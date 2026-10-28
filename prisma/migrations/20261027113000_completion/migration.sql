ALTER TABLE "internship"."User" ADD COLUMN "mfaSecret" TEXT, ADD COLUMN "mfaLastStep" BIGINT NOT NULL DEFAULT -1, ADD COLUMN "mfaRecovery" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
CREATE TABLE "internship"."LoginChallenge" ("id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "sessionVersion" INTEGER NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0, "consumed" BOOLEAN NOT NULL DEFAULT false, "enrollmentSecret" TEXT);
CREATE INDEX "LoginChallenge_expiresAt_idx" ON "internship"."LoginChallenge"("expiresAt");
ALTER TABLE "internship"."SubmissionFile" ADD COLUMN "scanStatus" TEXT NOT NULL DEFAULT 'PENDING', ADD COLUMN "verifiedEtag" TEXT, ADD COLUMN "uploadId" TEXT;
CREATE UNIQUE INDEX "SubmissionFile_uploadId_key" ON "internship"."SubmissionFile"("uploadId");
CREATE TABLE "internship"."UploadAuthorization" ("id" TEXT PRIMARY KEY, "storageKey" TEXT UNIQUE NOT NULL, "userId" TEXT NOT NULL, "taskId" TEXT NOT NULL, "fileName" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL, "mimeType" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "consumed" BOOLEAN NOT NULL DEFAULT false);
CREATE INDEX "UploadAuthorization_expiresAt_idx" ON "internship"."UploadAuthorization"("expiresAt");
