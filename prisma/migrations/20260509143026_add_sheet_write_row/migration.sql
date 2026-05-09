-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "ip" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sheetGid" INTEGER,
ADD COLUMN     "sheetWriteRow" INTEGER,
ALTER COLUMN "credits" SET DEFAULT 9999;
