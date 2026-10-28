# InternHub — multi-stage image. Targets:
#   app     Next.js standalone server (default)
#   worker  outbox worker (emails, reminders, escalations)
#   migrate one-off `prisma migrate deploy` (run before starting a new app version)
#
# BUILD-TIME config (frozen into the build, e.g. the CSP header): APP_URL, S3_ENDPOINT,
# ALLOWED_ORIGINS. Changing them requires a rebuild. Everything else (DATABASE_URL,
# SESSION_SECRET, REDIS_URL, SMTP_URL, keys…) is RUNTIME env — never baked into the image.

ARG NODE_IMAGE=node:22.23.4-bookworm-slim

FROM ${NODE_IMAGE} AS base
# openssl: required by the Prisma query engine (the slim image has no libssl or CA certs)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# ── all dependencies (locked) + generated Prisma client ─────────────
FROM base AS deps
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
# Optional public CA bundle for managed build proxies; never copied into an image layer.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true --no-audit --no-fund

# ── production build ───────────────────────────────────────────────
FROM deps AS builder
ARG APP_URL=http://localhost:3000
ARG S3_ENDPOINT=
ARG ALLOWED_ORIGINS=
ENV APP_URL=${APP_URL} S3_ENDPOINT=${S3_ENDPOINT} ALLOWED_ORIGINS=${ALLOWED_ORIGINS} NODE_ENV=production
COPY . .
RUN npm run build

# ── migrate (one-off job) ──────────────────────────────────────────
FROM deps AS migrate
COPY --chown=node:node scripts/bootstrap-admin.ts ./scripts/bootstrap-admin.ts
COPY --chown=node:node src/server/bootstrap.ts ./src/server/bootstrap.ts
COPY --chown=node:node src/lib/db.ts src/lib/errors.ts src/lib/password.ts ./src/lib/
USER node
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

# ── worker ─────────────────────────────────────────────────────────
FROM deps AS worker
ENV NODE_ENV=production
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node src/emails ./src/emails
COPY --chown=node:node src/lib/db.ts src/lib/errors.ts src/lib/storage-provider.ts src/lib/malware.ts src/lib/archive.ts ./src/lib/
COPY --chown=node:node src/server/scan-upload.ts ./src/server/scan-upload.ts
USER node
# SIGTERM is handled: finishes the current batch, then exits.
CMD ["node_modules/.bin/tsx", "scripts/worker.ts"]

# ── app (default target, last stage) ────────────────────────────────
FROM base AS app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
# Liveness only (no DB): a database outage must not restart the app. Readiness = /api/health.
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
