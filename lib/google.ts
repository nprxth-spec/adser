import { google } from "googleapis";
import { InvoiceData } from "./openai";

// ── Column helpers for custom sheet mapping ───────────────────────────────────
/** Convert a column letter (A, B, …, Z, AA, AB, …) to a 0-based index. */
function colLetterToIndex(col: string): number {
    let result = 0;
    for (const ch of col.toUpperCase()) {
        result = result * 26 + (ch.charCodeAt(0) - 64);
    }
    return result - 1;
}

/** Convert a 0-based column index back to a column letter string. */
function indexToColLetter(idx: number): string {
    let s = "";
    let n = idx + 1;
    while (n > 0) {
        const rem = (n - 1) % 26;
        s = String.fromCharCode(65 + rem) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

/**
 * Build a sparse row array for a custom column mapping.
 * cellMap keys are column letters (e.g. "A", "C", "Z").
 * Returns an array padded with "" up to the last used column.
 */
function buildMappedRowArray(cellMap: Record<string, any>): any[] {
    const keys = Object.keys(cellMap);
    if (keys.length === 0) return [];
    const maxIdx = Math.max(...keys.map(colLetterToIndex));
    const row = new Array(maxIdx + 1).fill("");
    for (const [col, val] of Object.entries(cellMap)) {
        row[colLetterToIndex(col)] = val;
    }
    return row;
}

function getOAuth2Client(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
}

/**
 * Ensure the target sheet tab has at least `targetRow` rows.
 * `batchUpdate` (unlike `values.append`) does NOT auto-extend the grid,
 * so we must add rows manually when the reserved row exceeds the sheet size.
 */
async function ensureSheetCapacity(
    sheets: ReturnType<typeof google.sheets>,
    sheetId: string,
    sheetName: string | null,
    targetRow: number,
): Promise<void> {
    const res = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: "sheets(properties(sheetId,title,gridProperties(rowCount)))",
    });

    const tab = sheetName
        ? res.data.sheets?.find((s: any) => s.properties?.title === sheetName)
        : res.data.sheets?.[0];

    const rowCount = (tab?.properties?.gridProperties?.rowCount as number | undefined) ?? 1000;
    const tabSheetId = (tab?.properties?.sheetId as number | undefined) ?? 0;

    if (targetRow <= rowCount) return; // Already enough rows — nothing to do

    // Append enough rows to cover the target, plus a buffer of 100 for the next batch.
    const toAdd = targetRow - rowCount + 100;
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: {
            requests: [{ appendDimension: { sheetId: tabSheetId, dimension: "ROWS", length: toAdd } }],
        },
    });
}

function escapeDriveQuery(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function getOrCreateFolder(
    drive: ReturnType<typeof google.drive>,
    invoiceDate: string
): Promise<string> {
    const safeDate = (invoiceDate ?? "").replace(/[^0-9-]/g, "");
    const yearMonth = safeDate.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const folderName = `FB_Invoices_${yearMonth}`;
    const escapedName = escapeDriveQuery(folderName);

    const searchRes = await drive.files.list({
        q: `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        fields: "files(id, name)",
        spaces: "drive",
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
    }

    const createRes = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
        },
        fields: "id",
    });

    return createRes.data.id!;
}

async function getOrCreateDateSubfolder(
    drive: ReturnType<typeof google.drive>,
    parentFolderId: string,
    invoiceDate: string
): Promise<string> {
    const safeDate = (invoiceDate ?? "").replace(/[^0-9-]/g, "");
    let folderName: string;
    if (/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
        const [y, m, d] = safeDate.split("-");
        folderName = `${d}/${m}/${y}`;
    } else {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
        folderName = `${dd}/${mm}/${yyyy}`;
    }

    const escapedParent = escapeDriveQuery(parentFolderId);
    const searchRes = await drive.files.list({
        q: [
            `name='${escapeDriveQuery(folderName)}'`,
            "mimeType='application/vnd.google-apps.folder'",
            "trashed=false",
            `'${escapedParent}' in parents`,
        ].join(" and "),
        fields: "files(id, name)",
        spaces: "drive",
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
    }

    const createRes = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentFolderId],
        },
        fields: "id",
    });

    return createRes.data.id!;
}

async function getOrCreateFailedSubfolder(
    drive: ReturnType<typeof google.drive>,
    parentFolderId: string
): Promise<string> {
    const failedName = "_Unsuccessful";
    const escapedParent = escapeDriveQuery(parentFolderId);

    const searchRes = await drive.files.list({
        q: [
            `name='${escapeDriveQuery(failedName)}'`,
            "mimeType='application/vnd.google-apps.folder'",
            "trashed=false",
            `'${escapedParent}' in parents`,
        ].join(" and "),
        fields: "files(id, name)",
        spaces: "drive",
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
    }

    const createRes = await drive.files.create({
        requestBody: {
            name: failedName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentFolderId],
        },
        fields: "id",
    });

    return createRes.data.id!;
}

// ─── Generic subfolder helper ─────────────────────────────────────────────────

async function getOrCreateSubfolder(
    drive: ReturnType<typeof google.drive>,
    parentFolderId: string,
    folderName: string,
): Promise<string> {
    const escapedParent = escapeDriveQuery(parentFolderId);
    const escapedName   = escapeDriveQuery(folderName);

    const searchRes = await drive.files.list({
        q: [
            `name='${escapedName}'`,
            "mimeType='application/vnd.google-apps.folder'",
            "trashed=false",
            `'${escapedParent}' in parents`,
        ].join(" and "),
        fields: "files(id, name)",
        spaces: "drive",
    });

    if (searchRes.data.files && searchRes.data.files.length > 0) {
        return searchRes.data.files[0].id!;
    }

    const createRes = await drive.files.create({
        requestBody: {
            name: folderName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentFolderId],
        },
        fields: "id",
    });

    return createRes.data.id!;
}

// ─── Year / Month / Day hierarchy ─────────────────────────────────────────────

const MONTH_NAMES = [
    "January", "February", "March",     "April",   "May",      "June",
    "July",    "August",   "September", "October", "November", "December",
];

/**
 * Resolves (or creates) root / YYYY / MM_MonthName / DD/MM/YYYY
 * from a date string formatted as YYYY-MM-DD.
 */
async function getOrCreateYearMonthDayFolder(
    drive: ReturnType<typeof google.drive>,
    rootFolderId: string,
    invoiceDate: string,
): Promise<string> {
    const safeDate = (invoiceDate ?? "").replace(/[^0-9-]/g, "");

    let year: string, month: string, day: string;
    if (/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
        [year, month, day] = safeDate.split("-");
    } else {
        const today = new Date();
        year  = String(today.getFullYear());
        month = String(today.getMonth() + 1).padStart(2, "0");
        day   = String(today.getDate()).padStart(2, "0");
    }

    const monthIndex      = parseInt(month, 10) - 1;
    const monthFolderName = `${month}_${MONTH_NAMES[monthIndex] ?? month}`;
    const dayFolderName   = `${day}/${month}/${year}`;

    const yearFolderId  = await getOrCreateSubfolder(drive, rootFolderId,  year);
    const monthFolderId = await getOrCreateSubfolder(drive, yearFolderId,  monthFolderName);
    const dayFolderId   = await getOrCreateSubfolder(drive, monthFolderId, dayFolderName);

    return dayFolderId;
}

export interface SheetMapping {
    date: string;
    card_last_4: string;
    amount: string;
    amountFailed?: string;
    currency: string;
    filename: string;
    driveLink: string;
    billed_to: string;
    reference?: string;
}

/**
 * Detect the last row that contains data in a Google Sheet.
 * Used to correctly seed the DB row counter on first use, avoiding
 * stale values from processingLog that may be higher than the real sheet.
 *
 * Strategy: read columns A:B and use the last row where either column has data.
 * The next write should continue after the latest populated row in A or B.
 */
export async function getActualSheetLastRow(
    accessToken: string,
    sheetId: string,
    sheetName: string | null,
    _sheetMapping: any | null,
): Promise<number> {
    const auth = getOAuth2Client(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const range = sheetName ? `'${sheetName}'!A:B` : "A:B";

    // Find the first (leftmost) mapped column — that's the most likely to have data in every row.
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range,
        });
        const rows = res.data.values ?? [];
        for (let i = rows.length - 1; i >= 0; i--) {
            const [a, b] = rows[i] ?? [];
            if (String(a ?? "").trim() || String(b ?? "").trim()) {
                return i + 1;
            }
        }
        return 0;
    } catch {
        return 0;
    }
}

export async function getSpreadsheetTitle(
    sheetId: string,
    accessToken: string
): Promise<string> {
    const auth = getOAuth2Client(accessToken);
    const sheets = google.sheets({ version: "v4", auth });
    const res = await sheets.spreadsheets.get({
        spreadsheetId: sheetId,
        fields: "properties/title",
    });
    return (res.data.properties?.title as string) ?? "";
}

export async function getSpreadsheetTabs(
    sheetId: string,
    accessToken: string
): Promise<{ id: number; title: string }[]> {
    const auth = getOAuth2Client(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    try {
        const res = await sheets.spreadsheets.get({
            spreadsheetId: sheetId,
            includeGridData: false,
        });

        return res.data.sheets?.map(s => ({
            id: s.properties?.sheetId ?? 0,
            title: s.properties?.title ?? "",
        })) ?? [];
    } catch (error: any) {
        console.error("Error fetching spreadsheet tabs:", error?.response?.data || error);
        const apiMessage: string | undefined =
            error?.response?.data?.error?.message || error?.message;
        if (apiMessage) throw new Error(apiMessage);
        throw new Error("Failed to fetch spreadsheet tabs.");
    }
}

export interface SyncResult {
    driveLink: string;
    sheetRow: number;
}

/** Upload a file to Drive only (no Sheets). Returns driveLink and driveFileId. */
export async function uploadFileToDrive(
    fileBuffer: Buffer,
    filename: string,
    accessToken: string,
    invoiceDate: string,
    driveFolderId: string | null = null,
    driveFolderMode: string = "auto",
    paymentSuccess: boolean = true,
): Promise<{ driveLink: string; driveFileId: string }> {
    const auth = getOAuth2Client(accessToken);
    const drive = google.drive({ version: "v3", auth });

    let baseFolderId: string;
    if (driveFolderMode === "year-month-day" && driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = await getOrCreateYearMonthDayFolder(drive, driveFolderId, invoiceDate);
    } else if (driveFolderMode === "date-subfolder" && driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = await getOrCreateDateSubfolder(drive, driveFolderId, invoiceDate);
    } else if (driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = driveFolderId;
    } else {
        baseFolderId = await getOrCreateFolder(drive, invoiceDate);
    }

    const folderId = paymentSuccess
        ? baseFolderId
        : await getOrCreateFailedSubfolder(drive, baseFolderId);

    const { Readable } = await import("stream");
    const fileStream = Readable.from(fileBuffer);

    const uploadRes = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType: "application/pdf", body: fileStream },
        fields: "id, webViewLink",
    });

    return {
        driveLink: uploadRes.data.webViewLink ?? "",
        driveFileId: uploadRes.data.id ?? "",
    };
}

/** Rename an existing Drive file. */
export async function renameDriveFile(
    fileId: string,
    newName: string,
    accessToken: string,
): Promise<void> {
    const auth = getOAuth2Client(accessToken);
    const drive = google.drive({ version: "v3", auth });
    await drive.files.update({
        fileId,
        requestBody: { name: newName },
    });
}

/** Append a single row to Sheets (used when approving a review item). */
export async function appendToSheet(
    data: InvoiceData,
    filename: string,
    driveLink: string,
    accessToken: string,
    sheetId: string,
    sheetName: string | null = null,
    sheetMapping: any | null = null,
    targetRow: number | null = null,
): Promise<number> {
    const auth = getOAuth2Client(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const mapping: SheetMapping | null =
        sheetMapping && typeof sheetMapping === "object" ? (sheetMapping as SheetMapping) : null;

    let nextRow: number;

    const cellMap: Record<string, any> = {};
    // Only add the cell if both the column letter and the value are non-empty.
    // Skipping empty strings prevents overwriting formulas in cells that have no
    // corresponding invoice data (e.g. reference_number on a failed payment).
    // Numeric 0 is intentionally kept so a zero-amount row is still written.
    const addCell = (col: string | undefined | null, value: any) => {
        if (!col || col.trim() === "") return;
        if (value === "" || value === null || value === undefined) return;
        cellMap[col.toUpperCase()] = value;
    };

    if (mapping) {
        addCell(mapping.date, data.date);
        addCell(mapping.billed_to, data.billed_to);
        addCell(mapping.card_last_4, data.card_last_4);
        if (data.paymentSuccess) {
            addCell(mapping.amount, data.amount ?? 0);
        } else {
            // Only write to amountFailed column if the user explicitly configured it.
            // Do NOT fall back to a hardcoded column — that would overwrite formulas
            // in cells the user never intended to be written by FilesGo.
            addCell(mapping.amountFailed, data.amount ?? 0);
        }
        addCell(mapping.currency, data.currency);
        addCell(mapping.filename, filename || null);
        addCell(mapping.driveLink, driveLink || null);
        addCell(mapping.reference, data.reference_number);
    }

    if (mapping) {
        const entries = Object.entries(cellMap);
        if (entries.length === 0) return 0;

        if (targetRow && targetRow > 0) {
            // ── Preferred path: write directly to the pre-allocated row ──────────
            // No values.append at all → no INSERT_ROWS (no physical row insertion)
            // and no OVERWRITE race condition.  Row was reserved atomically in DB.
            // Ensure the grid is tall enough — batchUpdate won't auto-extend.
            await ensureSheetCapacity(sheets, sheetId, sheetName, targetRow);
            const batchData = entries.map(([col, val]) => ({
                range: sheetName ? `'${sheetName}'!${col}${targetRow}` : `${col}${targetRow}`,
                values: [[val]],
            }));
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetId,
                requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
            });
            nextRow = targetRow;
        } else {
            // ── Fallback: 2-step OVERWRITE append (used when no targetRow given) ──
            // OVERWRITE does not insert physical rows (good), but has a race condition
            // for concurrent uploads (acceptable here — fallback is for one-at-a-time
            // operations like review approval).
            const sortedEntries = [...entries].sort(
                (a, b) => colLetterToIndex(a[0]) - colLetterToIndex(b[0])
            );
            const [anchorCol, anchorVal] = sortedEntries[0];
            const anchorRange = sheetName
                ? `'${sheetName}'!${anchorCol}:${anchorCol}`
                : `${anchorCol}:${anchorCol}`;

            const appendRes = await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range: anchorRange,
                valueInputOption: "USER_ENTERED",
                insertDataOption: "OVERWRITE",
                requestBody: { values: [[anchorVal]] },
            });

            const updatedRange = appendRes.data.updates?.updatedRange ?? "";
            const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
            nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
            if (nextRow === 0) {
                console.warn("[appendToSheet] Could not parse row number from updatedRange:", updatedRange);
            }

            const remaining = sortedEntries.slice(1);
            if (nextRow > 0 && remaining.length > 0) {
                const batchData = remaining.map(([col, val]) => ({
                    range: sheetName ? `'${sheetName}'!${col}${nextRow}` : `${col}${nextRow}`,
                    values: [[val]],
                }));
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
                });
            }
        }
    } else {
        // No mapping path — fixed A:G layout
        const valuesArray = [
            data.date ?? "",
            data.billed_to ?? "",
            data.card_last_4 ?? "",
            data.amount ?? 0,
            data.currency ?? "",
            filename,
            driveLink,
        ];

        if (targetRow && targetRow > 0) {
            // Write directly to the reserved row
            await ensureSheetCapacity(sheets, sheetId, sheetName, targetRow);
            const range = sheetName ? `'${sheetName}'!A${targetRow}:G${targetRow}` : `A${targetRow}:G${targetRow}`;
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetId,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: [{ range, values: [valuesArray] }],
                },
            });
            nextRow = targetRow;
        } else {
            // Fallback OVERWRITE append
            const range = sheetName ? `'${sheetName}'!A:G` : "A:G";
            const appendRes = await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range,
                valueInputOption: "USER_ENTERED",
                insertDataOption: "OVERWRITE",
                requestBody: { values: [valuesArray] },
            });
            const updatedRange = appendRes.data.updates?.updatedRange ?? "";
            const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
            nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
            if (nextRow === 0) {
                console.warn("[appendToSheet] Could not parse row number from updatedRange:", updatedRange);
            }
        }
    }

    return nextRow;
}

/**
 * Update specific cells in an existing Sheet row (admin edit).
 * Only writes non-empty values — skips fields that are null/undefined/""
 * so formulas in other columns are preserved.
 */
export async function updateSheetRow(
    data: {
        invoiceDate?: string | null;
        cardLast4?: string | null;
        amount?: number | null;
        currency?: string | null;
        filename?: string | null;
        driveLink?: string | null;
    },
    accessToken: string,
    sheetId: string,
    sheetName: string | null,
    sheetMapping: any | null,
    rowNumber: number,
): Promise<void> {
    if (rowNumber <= 0) return;

    const auth = getOAuth2Client(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const mapping: SheetMapping | null =
        sheetMapping && typeof sheetMapping === "object" ? (sheetMapping as SheetMapping) : null;

    const cellMap: Record<string, any> = {};
    const addCell = (col: string | undefined | null, value: any) => {
        if (!col || col.trim() === "") return;
        if (value === "" || value === null || value === undefined) return;
        cellMap[col.toUpperCase()] = value;
    };

    if (mapping) {
        addCell(mapping.date,       data.invoiceDate);
        addCell(mapping.card_last_4, data.cardLast4);
        addCell(mapping.amount,     data.amount);
        addCell(mapping.currency,   data.currency);
        addCell(mapping.filename,   data.filename);
        addCell(mapping.driveLink,  data.driveLink);
    } else {
        // Default layout (A=date, C=card, D=amount, E=currency, F=filename, G=driveLink)
        addCell("A", data.invoiceDate);
        addCell("C", data.cardLast4);
        addCell("D", data.amount);
        addCell("E", data.currency);
        addCell("F", data.filename);
        addCell("G", data.driveLink);
    }

    const entries = Object.entries(cellMap);
    if (entries.length === 0) return;

    const batchData = entries.map(([col, val]) => ({
        range: sheetName ? `'${sheetName}'!${col}${rowNumber}` : `${col}${rowNumber}`,
        values: [[val]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: sheetId,
        requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
    });
}

export async function syncToGoogle(
    data: InvoiceData,
    fileBuffer: Buffer,
    filename: string,
    accessToken: string,
    sheetId: string,
    sheetName: string | null = null,
    sheetMapping: any | null = null,
    driveFolderId: string | null = null,
    driveFolderMode: string = "auto",
    targetRow: number | null = null,
): Promise<SyncResult> {
    const auth = getOAuth2Client(accessToken);
    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    let baseFolderId: string;
    if (driveFolderMode === "year-month-day" && driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = await getOrCreateYearMonthDayFolder(drive, driveFolderId, data.date);
    } else if (driveFolderMode === "date-subfolder" && driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = await getOrCreateDateSubfolder(drive, driveFolderId, data.date);
    } else if (driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = driveFolderId;
    } else {
        baseFolderId = await getOrCreateFolder(drive, data.date);
    }

    const folderId = data.paymentSuccess
        ? baseFolderId
        : await getOrCreateFailedSubfolder(drive, baseFolderId);

    const { Readable } = await import("stream");
    const fileStream = Readable.from(fileBuffer);

    const uploadRes = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType: "application/pdf", body: fileStream },
        fields: "id, webViewLink",
    });

    const driveLink = uploadRes.data.webViewLink ?? "";

    const mapping: SheetMapping | null =
        sheetMapping && typeof sheetMapping === "object" ? (sheetMapping as SheetMapping) : null;

    let nextRow = 0;

    const cellMap: Record<string, any> = {};
    // Only add the cell if both the column letter and the value are non-empty.
    // Skipping empty strings prevents overwriting formulas in cells that have no
    // corresponding invoice data (e.g. reference_number on a failed payment).
    // Numeric 0 is intentionally kept so a zero-amount row is still written.
    const addCell = (col: string | undefined | null, value: any) => {
        if (!col || col.trim() === "") return;
        if (value === "" || value === null || value === undefined) return;
        cellMap[col.toUpperCase()] = value;
    };

    if (mapping) {
        addCell(mapping.date, data.date);
        addCell(mapping.billed_to, data.billed_to);
        addCell(mapping.card_last_4, data.card_last_4);
        if (data.paymentSuccess) {
            addCell(mapping.amount, data.amount ?? 0);
        } else {
            // Only write to amountFailed column if the user explicitly configured it.
            // Do NOT fall back to a hardcoded column — that would overwrite formulas
            // in cells the user never intended to be written by FilesGo.
            addCell(mapping.amountFailed, data.amount ?? 0);
        }
        addCell(mapping.currency, data.currency);
        addCell(mapping.filename, filename || null);
        addCell(mapping.driveLink, driveLink || null);
        addCell(mapping.reference, data.reference_number);
    }

    if (mapping) {
        const entries = Object.entries(cellMap);
        if (entries.length > 0) {
            if (targetRow && targetRow > 0) {
                // ── Preferred path: write directly to pre-allocated row ───────────
                await ensureSheetCapacity(sheets, sheetId, sheetName, targetRow);
                const batchData = entries.map(([col, val]) => ({
                    range: sheetName ? `'${sheetName}'!${col}${targetRow}` : `${col}${targetRow}`,
                    values: [[val]],
                }));
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
                });
                nextRow = targetRow;
            } else {
                // ── Fallback: 2-step OVERWRITE append ────────────────────────────
                const sortedEntries = [...entries].sort(
                    (a, b) => colLetterToIndex(a[0]) - colLetterToIndex(b[0])
                );
                const [anchorCol, anchorVal] = sortedEntries[0];
                const anchorRange = sheetName
                    ? `'${sheetName}'!${anchorCol}:${anchorCol}`
                    : `${anchorCol}:${anchorCol}`;

                const appendRes = await sheets.spreadsheets.values.append({
                    spreadsheetId: sheetId,
                    range: anchorRange,
                    valueInputOption: "USER_ENTERED",
                    insertDataOption: "OVERWRITE",
                    requestBody: { values: [[anchorVal]] },
                });

                const updatedRange = appendRes.data.updates?.updatedRange ?? "";
                const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
                nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
                if (nextRow === 0) {
                    console.warn("[syncToGoogle] Could not parse row number from updatedRange:", updatedRange);
                }

                const remaining = sortedEntries.slice(1);
                if (nextRow > 0 && remaining.length > 0) {
                    const batchData = remaining.map(([col, val]) => ({
                        range: sheetName ? `'${sheetName}'!${col}${nextRow}` : `${col}${nextRow}`,
                        values: [[val]],
                    }));
                    await sheets.spreadsheets.values.batchUpdate({
                        spreadsheetId: sheetId,
                        requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
                    });
                }
            }
        }
    } else {
        // No mapping — fixed A:G layout
        const valuesArray = [
            data.date ?? "",
            data.billed_to ?? "",
            data.card_last_4 ?? "",
            data.amount ?? 0,
            data.currency ?? "",
            filename,
            driveLink,
        ];

        if (targetRow && targetRow > 0) {
            await ensureSheetCapacity(sheets, sheetId, sheetName, targetRow);
            const range = sheetName ? `'${sheetName}'!A${targetRow}:G${targetRow}` : `A${targetRow}:G${targetRow}`;
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetId,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: [{ range, values: [valuesArray] }],
                },
            });
            nextRow = targetRow;
        } else {
            // Fallback OVERWRITE append
            const range = sheetName ? `'${sheetName}'!A:G` : "A:G";
            const appendRes = await sheets.spreadsheets.values.append({
                spreadsheetId: sheetId,
                range,
                valueInputOption: "USER_ENTERED",
                insertDataOption: "OVERWRITE",
                requestBody: { values: [valuesArray] },
            });
            const updatedRange = appendRes.data.updates?.updatedRange ?? "";
            const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
            nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
            if (nextRow === 0) {
                console.warn("[syncToGoogle] Could not parse row number from updatedRange:", updatedRange);
            }
        }
    }

    return { driveLink, sheetRow: nextRow };
}
