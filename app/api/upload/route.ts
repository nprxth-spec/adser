import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { extractInvoiceData, InvoiceData } from "@/lib/openai";
import {
    appendToSheet,
    downloadDriveFileBuffer,
    getActualSheetLastRow,
    organizeExistingDriveFile,
    syncToGoogle,
    uploadFileToDrive,
} from "@/lib/google";
import { prisma, Prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { reserveSheetRow, withUserSheetWriteLock } from "@/lib/sheet-row";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Drive folder that all uploads go into — locked, not user-configurable. */
const LOCKED_DRIVE_FOLDER_ID   = "1l9gD9sNTtfJ0Yl9CiWeLyRmhLthPk9-S";
const LOCKED_DRIVE_FOLDER_MODE = "year-month-day";

/** Filename template — locked, not user-configurable. Format: {card_prefix} - {date} - {reference_number} ({billed_to}) */
const LOCKED_FILENAME_TEMPLATE: TemplateItem[] = [
    { type: "field",   key: "card_prefix",      id: "t1" },
    { type: "literal", value: " - ",            id: "t2" },
    { type: "field",   key: "date",             id: "t3" },
    { type: "literal", value: " - ",            id: "t4" },
    { type: "field",   key: "reference_number", id: "t5" },
    { type: "literal", value: " (",             id: "t6" },
    { type: "field",   key: "billed_to",        id: "t7" },
    { type: "literal", value: ")",              id: "t8" },
];

type DirectDriveUploadBody = {
    driveFileId?: string;
    originalFilename?: string;
    mimeType?: string;
    size?: number;
    sheetId?: string;
};

let _pdfParse: ((buffer: Buffer) => Promise<{ text: string }>) | null = null;
async function getPdfParse() {
    if (_pdfParse) return _pdfParse;
    const pdfModule: any = await import("pdf-parse");
    const fn =
        typeof pdfModule === "function" ? pdfModule :
        typeof pdfModule.default === "function" ? pdfModule.default : null;
    if (!fn) throw new Error("pdf-parse did not export a compatible parser function");
    _pdfParse = fn;
    return fn;
}

function debugPdfText(label: string, filename: string, pdfText: string) {
    if (process.env.DEBUG_PDF_TEXT !== "true") return;
    const preview = pdfText
        .slice(0, 4000)
        .split(/\r?\n/)
        .map((line, index) => `${String(index + 1).padStart(3, "0")}: ${line}`)
        .join("\n");
    console.log(`\n[PDF TEXT DEBUG] ${label}: ${filename}\n${preview}\n[END PDF TEXT DEBUG]\n`);
}

type TemplateItem =
    | { type: "field"; key: string; id: string }
    | { type: "literal"; value: string; id: string };

function applyFilenameTemplate(
    template: TemplateItem[],
    stem: string,
    ext: string,
    cardPrefix: string | null,
    data: InvoiceData,
): string {
    const fields: Record<string, string> = {
        card_prefix:       cardPrefix ?? "",
        original_filename: stem,
        billed_to:         data.billed_to ?? "",
        date:              data.date ?? "",
        amount:            data.amount != null ? String(data.amount) : "",
        currency:          data.currency ?? "",
        payment_method:    data.payment_method ?? "",
        invoice_number:    data.invoice_number ?? "",
        reference_number:  data.reference_number ?? "",
        transaction_id:    data.transaction_id ?? "",
        account_id:        data.account_id ?? "",
    };
    let result = "";
    for (const token of template) {
        if (token.type === "field") result += fields[token.key] ?? "";
        else result += token.value;
    }
    const trimmed = result.trim().replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
    return (trimmed || stem) + ext;
}

function buildFilenameLegacy(
    sanitizedOriginal: string,
    cardPrefix: string | null,
    billedTo: string | undefined,
): string {
    let filename = sanitizedOriginal;
    if (cardPrefix) filename = `${cardPrefix} - ${filename}`;
    const trimmed = (billedTo ?? "").trim();
    if (trimmed) {
        const dot = filename.lastIndexOf(".");
        filename = dot > 0
            ? `${filename.slice(0, dot)} (${trimmed})${filename.slice(dot)}`
            : `${filename} (${trimmed})`;
    }
    return filename;
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            sheetId: true, sheetName: true,
            sheetMapping: true, filenameMapping: true, filenameTemplate: true,
            driveFolderId: true, driveFolderMode: true,
        },
    });
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 401 });

    const accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
        return NextResponse.json(
            {
                code: "GOOGLE_REAUTH_REQUIRED",
                error: "Google access token missing. Please sign in again.",
            },
            { status: 428 },
        );
    }

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const contentTypeHeader = request.headers.get("content-type") ?? "";
    const isDirectDriveUpload = contentTypeHeader.includes("application/json");

    let driveFileId: string | null = null;
    let originalFilename = "";
    let sheetId = user.sheetId || "";
    let buffer: Buffer;

    if (isDirectDriveUpload) {
        const body = (await request.json()) as DirectDriveUploadBody;
        driveFileId = typeof body.driveFileId === "string" ? body.driveFileId.trim() : "";
        originalFilename = typeof body.originalFilename === "string" ? body.originalFilename : "";
        sheetId = body.sheetId || sheetId;

        const contentType = body.mimeType;
        const size = body.size;

        if (!driveFileId) return NextResponse.json({ error: "No Drive file uploaded" }, { status: 400 });
        if (!originalFilename) return NextResponse.json({ error: "Original filename is required" }, { status: 400 });
        if (size !== undefined && size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "File too large. Please upload a PDF smaller than 10 MB." }, { status: 413 });
        }

        const isPdf =
            contentType === "application/pdf" ||
            (!contentType && originalFilename.toLowerCase().endsWith(".pdf"));
        if (!isPdf) {
            return NextResponse.json({ error: "Invalid file type. Only PDF invoices are allowed." }, { status: 400 });
        }

        buffer = await downloadDriveFileBuffer(driveFileId, accessToken);
        if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "File too large. Please upload a PDF smaller than 10 MB." }, { status: 413 });
        }
    } else {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;
        sheetId = (formData.get("sheetId") as string) || sheetId;

        if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

        const contentType = file.type || undefined;
        const size = file.size;

        if (size !== undefined && size > MAX_FILE_SIZE_BYTES) {
            return NextResponse.json({ error: "File too large. Please upload a PDF smaller than 10 MB." }, { status: 413 });
        }

        const isPdf =
            contentType === "application/pdf" ||
            (!contentType && file.name.toLowerCase().endsWith(".pdf"));
        if (!isPdf) {
            return NextResponse.json({ error: "Invalid file type. Only PDF invoices are allowed." }, { status: 400 });
        }

        originalFilename = file.name;
        const arrayBuffer = await file.arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
    }

    if (!sheetId) {
        return NextResponse.json({ error: "No Google Sheet ID configured. Please set it in Integrations settings." }, { status: 400 });
    }

    const sanitizedOriginal = originalFilename.replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
    let filename = sanitizedOriginal;

    const existingLog = await prisma.processingLog.findFirst({
        where: {
            userId,
            status: "success",
            OR: [
                { originalFilename: originalFilename },
                { originalFilename: null, filename: originalFilename },
            ],
        },
        select: { id: true },
    });
    if (existingLog) {
        return NextResponse.json(
            {
                code: "DUPLICATE_FILE",
                error: `File "${originalFilename}" has already been processed.`,
                errorTh: `มีไฟล์ซ้ำ: ไฟล์ "${originalFilename}" ถูกประมวลผลไปแล้ว`,
                errorEn: `Duplicate file: File "${originalFilename}" has already been processed.`,
            },
            { status: 409 }
        );
    }

    let invoiceData: InvoiceData;
    let driveLink = "";
    let sheetRow = 0;
    let status = "success";
    // Track partial results so the error log can include whatever succeeded
    let partialInvoiceData: InvoiceData | null = null;
    let partialDriveLink = "";

    try {
        const pdfParse = await getPdfParse();
        const textResult = await pdfParse(buffer);
        const pdfText = textResult.text;
        debugPdfText("upload", originalFilename, pdfText);

        invoiceData = await extractInvoiceData(pdfText);
        partialInvoiceData = invoiceData;

        const last4 = invoiceData.card_last_4;
        const mapping = (user as any).filenameMapping as Record<string, string> | null | undefined;
        const cardPrefix = (last4 && mapping && typeof mapping === "object" && mapping[last4])
            ? mapping[last4]
            : null;

        // Always use the locked template — ignore user's filenameTemplate
        const dotIdx = sanitizedOriginal.lastIndexOf(".");
        const stem = dotIdx > 0 ? sanitizedOriginal.slice(0, dotIdx) : sanitizedOriginal;
        const ext  = dotIdx > 0 ? sanitizedOriginal.slice(dotIdx) : "";
        filename = applyFilenameTemplate(LOCKED_FILENAME_TEMPLATE, stem, ext, cardPrefix, invoiceData);

        // Check required fields — if any missing, route to review queue
        // reference_number is only required when payment succeeded
        const paymentSucceeded = invoiceData.paymentSuccess !== false;
        const missingFields: string[] = [];
        if (!cardPrefix)                                             missingFields.push("card_prefix");
        if (!invoiceData.date?.trim())                               missingFields.push("date");
        if (paymentSucceeded && !invoiceData.reference_number?.trim()) missingFields.push("reference_number");
        if (!invoiceData.billed_to?.trim())                          missingFields.push("billed_to");

        if (missingFields.length > 0) {
            const reviewFilename = "REVIEW_" + filename;
            const driveResult = driveFileId
                ? await organizeExistingDriveFile(
                    driveFileId,
                    reviewFilename,
                    accessToken,
                    invoiceData.date ?? "",
                    LOCKED_DRIVE_FOLDER_ID,
                    LOCKED_DRIVE_FOLDER_MODE,
                    invoiceData.paymentSuccess ?? true,
                )
                : await uploadFileToDrive(
                    buffer, reviewFilename, accessToken,
                    invoiceData.date ?? "",
                    LOCKED_DRIVE_FOLDER_ID,
                    LOCKED_DRIVE_FOLDER_MODE,
                    invoiceData.paymentSuccess ?? true,
                );

            const pendingData = {
                invoiceData,
                missingFields,
                driveFileId: driveResult.driveFileId,
                driveLink: driveResult.driveLink,
                cardPrefix,
                sheetId,
                sheetName: user.sheetName,
                sheetMapping: user.sheetMapping,
                driveFolderId: LOCKED_DRIVE_FOLDER_ID,
                driveFolderMode: LOCKED_DRIVE_FOLDER_MODE,
            };

            const log = await prisma.processingLog.create({
                data: {
                    userId,
                    filename: reviewFilename,
                    originalFilename,
                    invoiceDate: invoiceData.date,
                    cardLast4: invoiceData.card_last_4,
                    amount: invoiceData.amount,
                    currency: invoiceData.currency,
                    driveLink: driveResult.driveLink,
                    sheetRow: null,
                    status: "review",
                    pendingData: pendingData as unknown as Prisma.InputJsonValue,
                },
            });
            const reviewLogId = log.id;

            return NextResponse.json({
                requiresReview: true,
                reviewId: reviewLogId,
                missingFields,
                data: { filename: reviewFilename, ...invoiceData, driveLink: driveResult.driveLink },
            });
        }

        // Normal flow — all fields present.
        // Reserve a sheet row atomically in DB before calling syncToGoogle.
        // On first ever use (sheetWriteRow IS NULL in DB) detect the actual last
        // data row directly from the sheet so the counter starts from the right
        // position — NOT from processingLog which may hold stale/wrong row numbers
        // leftover from the old OVERWRITE race-condition era.
        const syncResult = await withUserSheetWriteLock(userId, async () => {
            const rowSeed = await getActualSheetLastRow(accessToken, sheetId, user.sheetName, user.sheetMapping);
            const reservedRow = await reserveSheetRow(userId, rowSeed);

            if (driveFileId) {
                const driveResult = await organizeExistingDriveFile(
                    driveFileId,
                    filename,
                    accessToken,
                    invoiceData.date ?? "",
                    LOCKED_DRIVE_FOLDER_ID,
                    LOCKED_DRIVE_FOLDER_MODE,
                    invoiceData.paymentSuccess ?? true,
                );
                const writtenRow = await appendToSheet(
                    invoiceData,
                    filename,
                    driveResult.driveLink,
                    accessToken,
                    sheetId,
                    user.sheetName,
                    user.sheetMapping,
                    reservedRow,
                );
                return { driveLink: driveResult.driveLink, sheetRow: writtenRow };
            }

            return await syncToGoogle(
                invoiceData, buffer, filename, accessToken,
                sheetId, user.sheetName, user.sheetMapping,
                LOCKED_DRIVE_FOLDER_ID,
                LOCKED_DRIVE_FOLDER_MODE,
                reservedRow,
            );
        });
        driveLink = syncResult.driveLink;
        partialDriveLink = driveLink;
        sheetRow = syncResult.sheetRow;

    } catch (err: any) {
        console.error("Processing error:", err);
        status = "error";
        if (driveFileId && !partialDriveLink) {
            try {
                const failedDriveResult = await organizeExistingDriveFile(
                    driveFileId,
                    "ERROR_" + (filename !== sanitizedOriginal ? filename : sanitizedOriginal),
                    accessToken,
                    partialInvoiceData?.date ?? "",
                    LOCKED_DRIVE_FOLDER_ID,
                    LOCKED_DRIVE_FOLDER_MODE,
                    false,
                );
                partialDriveLink = failedDriveResult.driveLink;
            } catch (driveErr) {
                console.error("Failed to move errored Drive upload:", driveErr);
            }
        }
        // Include whatever partial data was extracted/uploaded for traceability
        await prisma.processingLog.create({
            data: {
                userId,
                filename: filename !== sanitizedOriginal ? filename : sanitizedOriginal,
                originalFilename,
                status: "error",
                driveLink: partialDriveLink || null,
                invoiceDate: partialInvoiceData?.date ?? null,
                cardLast4: partialInvoiceData?.card_last_4 ?? null,
                amount: partialInvoiceData?.amount ?? null,
                currency: partialInvoiceData?.currency ?? null,
            },
        });
        const safeMessage =
            err.message?.includes("Google") || err.message?.includes("Sheet") || err.message?.includes("Drive")
                ? "Failed to sync to Google services. Please check your integration settings."
                : "Processing failed. Please try again or contact support.";
        return NextResponse.json({ error: safeMessage }, { status: 500 });
    }

    await prisma.processingLog.create({
        data: {
            userId, filename, originalFilename,
            invoiceDate: invoiceData?.date,
            cardLast4: invoiceData?.card_last_4,
            amount: invoiceData?.amount,
            currency: invoiceData?.currency,
            driveLink, sheetRow, status,
        },
    });

    return NextResponse.json({
        success: true,
        data: { filename, ...invoiceData, driveLink, sheetRow },
    });
}
