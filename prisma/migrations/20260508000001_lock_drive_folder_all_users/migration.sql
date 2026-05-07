-- Lock all users to the shared Drive folder with year/month/day hierarchy
UPDATE "User"
SET
    "driveFolderId"   = '1l9gD9sNTtfJ0Yl9CiWeLyRmhLthPk9-S',
    "driveFolderMode" = 'year-month-day';
