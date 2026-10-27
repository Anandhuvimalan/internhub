-- S1: session revocation, hashed activation tokens, DB-enforced membership and review invariants.
-- Hand-edited from `prisma migrate diff` output to backfill existing rows before constraints.

-- 1. Sessions: per-user version embedded in session tokens; bump to revoke all sessions.
ALTER TABLE "internship"."User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- 2. Activation tokens: store only a SHA-256 hash, with an expiry. Existing plaintext tokens
--    are hashed in place (same digest the app computes) and given 7 days from now.
ALTER TABLE "internship"."User"
  ADD COLUMN "activationTokenHash" TEXT,
  ADD COLUMN "activationExpiresAt" TIMESTAMP(3);
UPDATE "internship"."User"
   SET "activationTokenHash" = encode(sha256(convert_to("activationToken", 'UTF8')), 'hex'),
       "activationExpiresAt" = now() + interval '7 days'
 WHERE "activationToken" IS NOT NULL;
DROP INDEX "internship"."User_activationToken_key";
ALTER TABLE "internship"."User" DROP COLUMN "activationToken";
CREATE UNIQUE INDEX "User_activationTokenHash_key" ON "internship"."User"("activationTokenHash");

-- 3. Team membership: one active team per student per internship, enforced by the database.
ALTER TABLE "internship"."TeamMember" ADD COLUMN "internshipId" TEXT, ADD COLUMN "activeUserId" TEXT;
UPDATE "internship"."TeamMember" m
   SET "internshipId" = t."internshipId",
       "activeUserId" = CASE WHEN m."leftAt" IS NULL THEN m."userId" END
  FROM "internship"."Team" t
 WHERE t.id = m."teamId";
ALTER TABLE "internship"."TeamMember" ALTER COLUMN "internshipId" SET NOT NULL;
-- Fails loudly (rather than deleting data) if a student already has two active teams.
CREATE UNIQUE INDEX "TeamMember_internshipId_activeUserId_key" ON "internship"."TeamMember"("internshipId", "activeUserId");

-- 4. Reviews: one decision per submission version (blocks concurrent double review).
CREATE UNIQUE INDEX "Review_submissionId_key" ON "internship"."Review"("submissionId");
