-- Fix: add columns that failed to apply in 20260509143026_add_sheet_write_row
-- because "ip" already existed in AuditLog on the production database.
-- Using IF NOT EXISTS so this migration is safe to run in any environment.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sheetGid"      INTEGER;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sheetWriteRow" INTEGER;
ALTER TABLE "User" ALTER COLUMN "credits" SET DEFAULT 9999;
