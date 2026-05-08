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

/**
 * Per-user serialization for any handler that reads/writes Google Sheet rows.
 *
 * Why: deleting a row in Google Sheets shifts every row below it up by one.
 * Without a lock, two concurrent DELETE requests can both look up rows by
 * content (driveLink/filename), then both submit `deleteDimension` calls using
 * indices that were correct at lookup time but have become stale after the
 * first delete finishes. Net effect: the wrong row gets deleted from the user's
 * sheet. The same race exists between PATCH and DELETE.
 *
 * The lock is per-user so different users never serialize against each other.
 *
 * Note: this is an in-memory lock and only protects requests served by the
 * same Node.js process. The frontend additionally serializes its own delete
 * queue, so multi-instance deployments still get protected from the common
 * "user clicks delete rapidly in one tab" case.
 */
const userSheetLock = new Map<string, Promise<void>>();

async function withUserSheetLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  const previous = userSheetLock.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  // Chain: the request that arrives after us will await `gate` (via this chain)
  // before it starts its own work. Keep the chain reference in the map.
  const chained = previous.then(() => gate);
  userSheetLock.set(userId, chained);
  try {
    await previous;
    return await fn();
  } finally {
    release();
    // If no later request has overwritten our chain entry, drop it so the map
    // doesn't hold a stale resolved promise forever.
    if (userSheetLock.get(userId) === chained) {
      userSheetLock.delete(userId);
    }
  }
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

// ─── PATCH: edit a history row + sync to Google Sheets ────────────────────────
type UpdatableFields = {
  invoiceDate?: string | null;
  cardLast4?: string | null;
  amount?: number | null;
  currency?: string | null;
};

function sanitizeUpdate(input: any): UpdatableFields {
  const out: UpdatableFields = {};
  if (Object.prototype.hasOwnProperty.call(input, "invoiceDate")) {
    const v = input.invoiceDate;
    out.invoiceDate = v == null || v === "" ? null : String(v).slice(0, 32);
  }
  if (Object.prototype.hasOwnProperty.call(input, "cardLast4")) {
    const v = input.cardLast4;
    out.cardLast4 = v == null || v === "" ? null : String(v).replace(/[^0-9]/g, "").slice(-4);
  }
  if (Object.prototype.hasOwnProperty.call(input, "amount")) {
    const v = input.amount;
    if (v == null || v === "") {
      out.amount = null;
    } else {
      const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
      out.amount = Number.isFinite(n) ? n : null;
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, "currency")) {
    const v = input.currency;
    out.currency = v == null || v === "" ? null : String(v).trim().slice(0, 8).toUpperCase();
  }
  return out;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: logId } = await context.params;
  const userId = session.user.id;

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const updates = sanitizeUpdate(body ?? {});
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No editable fields provided" }, { status: 400 });
  }

  return await withUserSheetLock(userId, async () => {
    const existing = await prisma.processingLog.findFirst({
      where: { id: logId, userId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const updated = await prisma.processingLog.update({
      where: { id: logId },
      data: updates,
    });

    // ─── Sync to Google Sheets ───────────────────────────────────────────────
    const warnings: string[] = [];
    const accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
      warnings.push("Google access token missing — Sheet not updated");
      return NextResponse.json({ success: true, log: updated, warnings });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { sheetId: true, sheetGid: true, sheetName: true, sheetMapping: true },
      });
      if (!user?.sheetId) {
        return NextResponse.json({ success: true, log: updated });
      }

      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
      );
      oauth2Client.setCredentials({ access_token: accessToken });
      const sheets = google.sheets({ version: "v4", auth: oauth2Client });

      const mapping = (user.sheetMapping as Record<string, string> | null) ?? null;
      const driveLinkCol = toA1Column(mapping?.driveLink, "G");
      const filenameCol = toA1Column(mapping?.filename, "F");

      // We intentionally do NOT fall back to `existing.sheetRow` here. That value
      // was correct at row-insertion time but goes stale as soon as any other
      // row is added/removed; using it could overwrite the wrong row.
      const currentRow = await findCurrentSheetRow(
        sheets,
        user.sheetId,
        user.sheetName,
        driveLinkCol,
        filenameCol,
        existing.driveLink ?? null,
        existing.filename
      );

      if (!currentRow || currentRow <= 0) {
        warnings.push("Sheets: could not locate matching row by Drive link/filename");
        return NextResponse.json({ success: true, log: updated, warnings });
      }

      const prefix = user.sheetName ? `${quoteSheetName(user.sheetName)}!` : "";
      const cellWrites: { range: string; values: (string | number)[][] }[] = [];

      const pushCell = (col: string | undefined | null, value: string | number) => {
        if (!col) return;
        const c = String(col).trim().toUpperCase();
        if (!/^[A-Z]+$/.test(c)) return;
        cellWrites.push({ range: `${prefix}${c}${currentRow}`, values: [[value]] });
      };

      if (Object.prototype.hasOwnProperty.call(updates, "invoiceDate")) {
        pushCell(mapping?.date, updates.invoiceDate ?? "");
      }
      if (Object.prototype.hasOwnProperty.call(updates, "cardLast4")) {
        pushCell(mapping?.card_last_4, updates.cardLast4 ?? "");
      }
      if (Object.prototype.hasOwnProperty.call(updates, "amount")) {
        const colKey =
          updated.status === "success" || existing.status === "success"
            ? mapping?.amount
            : mapping?.amountFailed ?? mapping?.amount;
        pushCell(colKey, updates.amount ?? 0);
      }
      if (Object.prototype.hasOwnProperty.call(updates, "currency")) {
        pushCell(mapping?.currency, updates.currency ?? "");
      }

      if (cellWrites.length > 0) {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: user.sheetId,
          requestBody: { valueInputOption: "USER_ENTERED", data: cellWrites },
        });
      }
    } catch (err: any) {
      warnings.push(`Sheets: ${err?.message ?? "Failed to update row"}`);
    }

    return NextResponse.json({
      success: true,
      log: updated,
      ...(warnings.length > 0 && { warnings }),
    });
  });
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

  return await withUserSheetLock(userId, async () => {
    // Find the log — must belong to this user
    const log = await prisma.processingLog.findFirst({
      where: { id: logId, userId },
    });

    if (!log) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    const warnings: string[] = [];

    // ─── Google API calls ──────────────────────────────────────────────────────
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
      if (log.driveLink || log.filename) {
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

            // We intentionally do NOT fall back to `log.sheetRow`. After even
            // one prior insert/delete, that stored row index is stale and we
            // would risk deleting an unrelated row. Better to surface a warning
            // and let the user clean up manually.
            const currentRow = await findCurrentSheetRow(
              sheets,
              user.sheetId,
              user.sheetName,
              driveLinkCol,
              filenameCol,
              log.driveLink ?? null,
              log.filename
            );

            if (!currentRow || currentRow <= 0) {
              warnings.push("Sheets: could not locate matching row by Drive link/filename");
            } else {
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
  });
}
