-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activeSheetProfileId" TEXT,
ADD COLUMN     "driveFolderId" TEXT,
ADD COLUMN     "sheetProfiles" JSONB;
