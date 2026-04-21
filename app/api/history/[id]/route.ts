import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { google } from "googleapis";

/** Extract the Google Drive file ID from a webViewLink or webContentLink URL. */
function extractDriveFileId(driveLink: string): string | null {
  // https://drive.google.com/file/d/FILE_ID/view?...
  const m = driveLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: logId } = await context.params;
  const userId = session.user.id;

  // Find the log — must belong to this user
  const log = await prisma.processingLog.findFirst({
    where: { id: logId, userId },
  });

  if (!log) {
    return NextResponse.json({ error: "Record not found" }, { status: 404 });
  }

  const warnings: string[] = [];

  // ─── Google API calls ────────────────────────────────────────────────────────
  const accessToken = await getValidGoogleAccessToken(userId);

  if (accessToken) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });

    // 1. Delete file from Google Drive
    if (log.driveLink) {
      const fileId = extractDriveFileId(log.driveLink);
      if (fileId) {
        try {
          const drive = google.drive({ version: "v3", auth: oauth2Client });
          await drive.files.delete({ fileId });
        } catch (err: any) {
          // 404 = already deleted; treat as success silently
          if (err?.code !== 404 && err?.status !== 404) {
            warnings.push(`Drive: ${err.message ?? "Failed to delete file"}`);
          }
        }
      }
    }

    // 2. Delete row from Google Sheets
    if (log.sheetRow && log.sheetRow > 0) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { sheetId: true, sheetGid: true },
        });

        if (user?.sheetId) {
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });
          // sheetRow is 1-indexed; Sheets API startIndex is 0-indexed
          const startIndex = log.sheetRow - 1;
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: user.sheetId,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: user.sheetGid ?? 0,
                      dimension: "ROWS",
                      startIndex,
                      endIndex: startIndex + 1,
                    },
                  },
                },
              ],
            },
          });
        }
      } catch (err: any) {
        warnings.push(`Sheets: ${err.message ?? "Failed to delete row"}`);
      }
    }
  } else {
    warnings.push("Google access token missing — Drive and Sheets not deleted");
  }

  // 3. Delete from database (always, even if Google calls had warnings)
  await prisma.processingLog.delete({ where: { id: logId } });

  return NextResponse.json({
    success: true,
    ...(warnings.length > 0 && { warnings }),
  });
}
