import { google } from "googleapis";
import { InvoiceData } from "./openai";

function getOAuth2Client(accessToken: string) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    return oauth2Client;
}

/** Escape single quotes for Drive API query strings */
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
    // Convert YYYY-MM-DD → DD/MM/YYYY for the folder name
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

    // 1. Determine target Drive folder
    let baseFolderId: string;
    if (driveFolderMode === "date-subfolder" && driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = await getOrCreateDateSubfolder(drive, driveFolderId, data.date);
    } else if (driveFolderId && driveFolderId.trim().length > 0) {
        baseFolderId = driveFolderId;
    } else {
        baseFolderId = await getOrCreateFolder(drive, data.date);
    }

    const folderId = data.paymentSuccess
        ? baseFolderId
        : await getOrCreateFailedSubfolder(drive, baseFolderId);

    // 2. Upload PDF
    const { Readable } = await import("stream");
    const fileStream = Readable.from(fileBuffer);

    const uploadRes = await drive.files.create({
        requestBody: { name: filename, parents: [folderId] },
        media: { mimeType: "application/pdf", body: fileStream },
        fields: "id, webViewLink",
    });

    const driveLink = uploadRes.data.webViewLink ?? "";

    // 3. Write to Google Sheet
    const mapping: SheetMapping | null =
        sheetMapping && typeof sheetMapping === "object" ? (sheetMapping as SheetMapping) : null;

    let nextRow: number;

    if (mapping) {
        // Custom mapping: get next row then batchUpdate in one call
        const sheetPrefix = sheetName ? `'${sheetName}'!` : "";
        const existingRes = await sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: `${sheetPrefix}A:A`,
        });
        nextRow = (existingRes.data.values?.length ?? 0) + 1;

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
                range: sheetName ? `'${sheetName}'!${col}${nextRow}` : `${col}${nextRow}`,
                values: [[val]],
            }));
            await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId: sheetId,
                requestBody: { valueInputOption: "USER_ENTERED", data: batchData },
            });
        }
    } else {
        // No mapping: use append for atomic row insertion (fixes race condition)
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
