-- AlterTable
ALTER TABLE "ProcessingLog" ADD COLUMN "originalFilename" TEXT;

-- CreateIndex
CREATE INDEX "ProcessingLog_userId_originalFilename_status_idx" ON "ProcessingLog"("userId", "originalFilename", "status");
