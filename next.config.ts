import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const httpsApp = (process.env.APP_URL ?? "").startsWith("https://");
// Browser uploads go straight to object storage via presigned URLs (path-style on this origin).
const storageOrigin = process.env.S3_ENDPOINT ? new URL(process.env.S3_ENDPOINT).origin : "";

/**
 * CSP without nonces: nonce-based CSP is incompatible with Partial Prerendering / Cache
 * Components (installed docs: 02-guides/content-security-policy.md), so scripts allow
 * 'unsafe-inline' for Next.js's inline bootstrap. Everything else is locked to this origin:
 * no third-party scripts, no framing, no plugins, forms only post to us. See
 * docs/DECISIONS.md and docs/RISKS.md R-10.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self'${storageOrigin ? ` ${storageOrigin}` : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(httpsApp ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  ...(httpsApp ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  output: "standalone", // minimal server bundle for the Docker image
  // Extra origins (CDN/proxy hosts) allowed to invoke server actions; same-origin always allowed.
  experimental: process.env.ALLOWED_ORIGINS
    ? { serverActions: { allowedOrigins: process.env.ALLOWED_ORIGINS.split(",").map((o) => new URL(o.trim()).host) } }
    : undefined,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
