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
): Promise<number> {
    const auth = getOAuth2Client(accessToken);
    const sheets = google.sheets({ version: "v4", auth });

    const mapping: SheetMapping | null =
        sheetMapping && typeof sheetMapping === "object" ? (sheetMapping as SheetMapping) : null;

    let nextRow: number;

    const cellMap: Record<string, any> = {};
    const addCell = (col: string | undefined | null, value: any) => {
        if (!col || col.trim() === "") return;
        cellMap[col.toUpperCase()] = value;
    };

    if (mapping) {
        addCell(mapping.date, data.date ?? "");
        addCell(mapping.billed_to, data.billed_to ?? "");
        addCell(mapping.card_last_4, data.card_last_4 ?? "");
        if (data.paymentSuccess) {
            addCell(mapping.amount, data.amount ?? 0);
        } else {
            addCell(mapping.amountFailed ?? "H", data.amount ?? 0);
        }
        addCell(mapping.currency, data.currency ?? "");
        addCell(mapping.filename, filename);
        addCell(mapping.driveLink, driveLink);
        addCell(mapping.reference, data.reference_number ?? "");
    }

    if (mapping) {
        // Mapping path: 2-step atomic approach
        // Step 1 — append anchor cell (smallest-index mapped column) to atomically reserve a row.
        //           values.append with INSERT_ROWS is atomic server-side; returns the new row number.
        // Step 2 — batchUpdate the remaining cells to their exact column addresses.
        //           This avoids the "table detection" issue where values.append can shift columns
        //           if Google Sheets detects the table starting at a column other than A.
        const entries = Object.entries(cellMap);
        if (entries.length === 0) return 0;

        // Pick anchor = first mapped column (smallest index)
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
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [[anchorVal]] },
        });

        const updatedRange = appendRes.data.updates?.updatedRange ?? "";
        const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
        nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
        if (nextRow === 0) {
            console.warn("[appendToSheet] Could not parse row number from updatedRange:", updatedRange);
        }

        // Step 2: write remaining cells to their exact column + row
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
    } else {
        // No mapping: use simple append A:G — already atomic and correct
        const valuesArray = [
            data.date ?? "",
            data.billed_to ?? "",
            data.card_last_4 ?? "",
            data.amount ?? 0,
            data.currency ?? "",
            filename,
            driveLink,
        ];
        const targetRange = sheetName ? `'${sheetName}'!A:G` : "A:G";
        const appendRes = await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: targetRange,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [valuesArray] },
        });
        const updatedRange = appendRes.data.updates?.updatedRange ?? "";
        const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
        nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
        if (nextRow === 0) {
            console.warn("[appendToSheet] Could not parse row number from updatedRange:", updatedRange);
        }
    }

    return nextRow;
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
    driveFolderMode: string = "auto"
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
    const addCell = (col: string | undefined | null, value: any) => {
        if (!col || col.trim() === "") return;
        cellMap[col.toUpperCase()] = value;
    };

    if (mapping) {
        addCell(mapping.date, data.date ?? "");
        addCell(mapping.billed_to, data.billed_to ?? "");
        addCell(mapping.card_last_4, data.card_last_4 ?? "");
        if (data.paymentSuccess) {
            addCell(mapping.amount, data.amount ?? 0);
        } else {
            addCell(mapping.amountFailed ?? "H", data.amount ?? 0);
        }
        addCell(mapping.currency, data.currency ?? "");
        addCell(mapping.filename, filename);
        addCell(mapping.driveLink, driveLink);
        addCell(mapping.reference, data.reference_number ?? "");
    }

    if (mapping) {
        // Mapping path: 2-step atomic approach (same as appendToSheet)
        // Step 1 — append anchor cell (smallest-index mapped column) to atomically reserve a row.
        // Step 2 — batchUpdate remaining cells to exact col+row addresses.
        //           This avoids the "table detection" shift where values.append starts writing
        //           from the sheet's detected table start column instead of the requested column.
        const entries = Object.entries(cellMap);
        if (entries.length > 0) {
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
                insertDataOption: "INSERT_ROWS",
                requestBody: { values: [[anchorVal]] },
            });

            const updatedRange = appendRes.data.updates?.updatedRange ?? "";
            const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
            nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
            if (nextRow === 0) {
                console.warn("[syncToGoogle] Could not parse row number from updatedRange:", updatedRange);
            }

            // Step 2: write remaining cells to their exact column + row
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
        // No mapping: simple append A:G — already atomic and correct
        const valuesArray = [
            data.date ?? "",
            data.billed_to ?? "",
            data.card_last_4 ?? "",
            data.amount ?? 0,
            data.currency ?? "",
            filename,
            driveLink,
        ];

        const targetRange = sheetName ? `'${sheetName}'!A:G` : "A:G";
        const appendRes = await sheets.spreadsheets.values.append({
            spreadsheetId: sheetId,
            range: targetRange,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: { values: [valuesArray] },
        });

        const updatedRange = appendRes.data.updates?.updatedRange ?? "";
        const rowMatch = updatedRange.match(/:?[A-Z]+(\d+)$/i);
        nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
        if (nextRow === 0) {
            console.warn("[syncToGoogle] Could not parse row number from updatedRange:", updatedRange);
        }
    }

    return { driveLink, sheetRow: nextRow };
}
