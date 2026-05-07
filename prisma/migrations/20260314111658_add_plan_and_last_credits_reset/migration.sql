-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastCreditsReset" TIMESTAMP(3),
ADD COLUMN     "plan" TEXT NOT NULL DEFAULT 'free';
