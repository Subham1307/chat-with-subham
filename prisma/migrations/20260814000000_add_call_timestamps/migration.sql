-- AlterTable
ALTER TABLE "calls" ADD COLUMN "connectedAt" TIMESTAMP(3);
ALTER TABLE "calls" ADD COLUMN "endedAt" TIMESTAMP(3);

-- For already-finished calls, use updatedAt as the end time.
UPDATE "calls"
SET "endedAt" = "updatedAt"
WHERE "status" IN ('ended', 'rejected', 'missed', 'busy')
  AND "endedAt" IS NULL;
