import { google } from "googleapis";
import { InvoiceData } from "./openai";

// ── Per-sheet write serializer ────────────────────────────────────────────────
// Prevents concurrent uploads from all reading the same "last row" and
// then overwriting each other via batchUpdate. Each sheetId gets its own
// promise chain; Drive uploads remain fully parallel.
const _sheetWriteLocks = new Map<string, Promise<unknown>>();

async function withSheetLock<T>(sheetId: string, fn: () => Promise<T>): Promise<T> {
    const prev = _sheetWriteLocks.get(sheetId) ?? Promise.resolve();
    let resolve!: () => void;
    const current = new Promise<void>(r => { resolve = r; });
    _sheetWriteLocks.set(sheetId, current);
    try {
        await prev;         // wait for previous write on this sheet
        return await fn();  // perform the read-then-write atomically
    } finally {
        resolve();          // unblock next queued write
        if (_sheetWriteLocks.get(sheetId) === current) {
            _sheetWriteLocks.delete(sheetId);
        }
    }
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

    if (mapping) {
        // Serialized: read last row then write — must not run concurrently on same sheet
        nextRow = await withSheetLock(sheetId, async () => {
            const sheetPrefix = sheetName ? `'${sheetName}'!` : "";
            const existingRes = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: `${sheetPrefix}A:A`,
            });
            const row = (existingRes.data.values?.length ?? 0) + 1;

            const cellMap: Record<string, any> = {};
            const addCell = (col: string | undefined | null, value: any) => {
                if (!col || col.trim() === "") return;
                cellMap[col.toUpperCase()] = value;
            };

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

            if (Object.keys(cellMap).length > 0) {
                const batchData = Object.entries(cellMap).map(([col, val]) => ({
                    range: sheetName ? `'${sheetName}'!${col}${row}` : `${col}${row}`,
                    values: [[val]],
                }));
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
                });
            }
            return row;
        });
    } else {
        // values.append with INSERT_ROWS is atomic on Google's side — safe for concurrent calls
        const valuesArray: any[] = [
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
        const rowMatch = updatedRange.match(/(\d+)(?::\w+\d+)?$/);
        nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
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

    let nextRow: number;

    if (mapping) {
        // Serialized: read last row then write — must not run concurrently on same sheet
        nextRow = await withSheetLock(sheetId, async () => {
            const sheetPrefix = sheetName ? `'${sheetName}'!` : "";
            const existingRes = await sheets.spreadsheets.values.get({
                spreadsheetId: sheetId,
                range: `${sheetPrefix}A:A`,
            });
            const row = (existingRes.data.values?.length ?? 0) + 1;

            const cellMap: Record<string, any> = {};
            const addCell = (col: string | undefined | null, value: any) => {
                if (!col || col.trim() === "") return;
                cellMap[col.toUpperCase()] = value;
            };

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

            if (Object.keys(cellMap).length > 0) {
                const batchData = Object.entries(cellMap).map(([col, val]) => ({
                    range: sheetName ? `'${sheetName}'!${col}${row}` : `${col}${row}`,
                    values: [[val]],
                }));
                await sheets.spreadsheets.values.batchUpdate({
                    spreadsheetId: sheetId,
                    requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
                });
            }
            return row;
        });
    } else {
        // values.append with INSERT_ROWS is atomic on Google's side — safe for concurrent calls
        const valuesArray: any[] = [
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
        const rowMatch = updatedRange.match(/(\d+)(?::\w+\d+)?$/);
        nextRow = rowMatch ? parseInt(rowMatch[1], 10) : 0;
    }

    return { driveLink, sheetRow: nextRow };
}
