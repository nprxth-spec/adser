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

function toA1Column(column: string | null | undefined, fallback: string): string {
  const col = String(column ?? "").trim().toUpperCase();
  return /^[A-Z]+$/.test(col) ? col : fallback;
}

function quoteSheetName(sheetName: string): string {
  return `'${sheetName.replace(/'/g, "''")}'`;
}

async function resolveSheetGid(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  preferredGid: number | null | undefined,
  preferredTitle: string | null | undefined
): Promise<number | null> {
  if (typeof preferredGid === "number") return preferredGid;
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    includeGridData: false,
    fields: "sheets(properties(sheetId,title))",
  });
  const tabs = meta.data.sheets ?? [];
  if (preferredTitle) {
    const byTitle = tabs.find((s) => s.properties?.title === preferredTitle);
    if (typeof byTitle?.properties?.sheetId === "number") return byTitle.properties.sheetId;
  }
  const first = tabs[0]?.properties?.sheetId;
  return typeof first === "number" ? first : null;
}

async function findCurrentSheetRow(
  sheets: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string | null | undefined,
  driveLinkCol: string,
  filenameCol: string,
  driveLink: string | null,
  filename: string
): Promise<number | null> {
  const prefix = sheetName ? `${quoteSheetName(sheetName)}!` : "";

  if (driveLink) {
    const driveColValues = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${prefix}${driveLinkCol}:${driveLinkCol}`,
    });
    const rows = driveColValues.data.values ?? [];
    const idx = rows.findIndex((r) => (r?.[0] ?? "") === driveLink);
    if (idx >= 0) return idx + 1; // 1-indexed
  }

  const filenameColValues = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${prefix}${filenameCol}:${filenameCol}`,
  });
  const nameRows = filenameColValues.data.values ?? [];
  const idxByName = nameRows.findIndex((r) => (r?.[0] ?? "") === filename);
  if (idxByName >= 0) return idxByName + 1;

  return null;
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
    if (log.sheetRow || log.driveLink || log.filename) {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { sheetId: true, sheetGid: true, sheetName: true, sheetMapping: true },
        });

        if (user?.sheetId) {
          const sheets = google.sheets({ version: "v4", auth: oauth2Client });
          const mapping = (user.sheetMapping as Record<string, string> | null) ?? null;
          const driveLinkCol = toA1Column(mapping?.driveLink, "G");
          const filenameCol = toA1Column(mapping?.filename, "F");
          const currentRow =
            (await findCurrentSheetRow(
              sheets,
              user.sheetId,
              user.sheetName,
              driveLinkCol,
              filenameCol,
              log.driveLink ?? null,
              log.filename
            )) ?? (log.sheetRow ?? null);

          if (!currentRow || currentRow <= 0) {
            throw new Error("Could not locate matching row in Sheets");
          }
          const targetGid = await resolveSheetGid(
            sheets,
            user.sheetId,
            user.sheetGid,
            user.sheetName
          );

          if (targetGid == null) {
            throw new Error("Could not resolve target sheet tab");
          }

          // Google Sheets API startIndex is 0-indexed
          const startIndex = Math.max(0, currentRow - 1);
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId: user.sheetId,
            requestBody: {
              requests: [
                {
                  deleteDimension: {
                    range: {
                      sheetId: targetGid,
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
