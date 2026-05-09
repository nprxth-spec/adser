import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { extractInvoiceData, InvoiceData } from "@/lib/openai";
import { syncToGoogle, uploadFileToDrive } from "@/lib/google";
import { prisma, Prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { ensureFreeCreditsReset } from "@/lib/credits";
import { reserveSheetRow } from "@/lib/sheet-row";

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
            plan: true, credits: true, sheetId: true, sheetName: true,
            sheetMapping: true, filenameMapping: true, filenameTemplate: true,
            driveFolderId: true, driveFolderMode: true,
        },
    });
    if (!user) return NextResponse.json({ error: "User not found." }, { status: 401 });

    const isPro = user.plan === "pro";
    if (!isPro) {
        const creditsAfterReset = await ensureFreeCreditsReset(userId);
        if (creditsAfterReset <= 0) {
            return NextResponse.json(
                { error: "No credits remaining this month. Resets next month or upgrade to Pro for unlimited." },
                { status: 402 }
            );
        }
    }

    const accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
        return NextResponse.json({ error: "Google access token missing. Please sign in again." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sheetId = (formData.get("sheetId") as string) || user.sheetId || "";

    if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const contentType = (file as any).type as string | undefined;
    const size = (file as any).size as number | undefined;

    if (size !== undefined && size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ error: "File too large. Please upload a PDF smaller than 10 MB." }, { status: 413 });
    }

    const isPdf =
        contentType === "application/pdf" ||
        (!contentType && file.name.toLowerCase().endsWith(".pdf"));
    if (!isPdf) {
        return NextResponse.json({ error: "Invalid file type. Only PDF invoices are allowed." }, { status: 400 });
    }

    if (!sheetId) {
        return NextResponse.json({ error: "No Google Sheet ID configured. Please set it in Integrations settings." }, { status: 400 });
    }

    const originalFilename = file.name;
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

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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
            const driveResult = await uploadFileToDrive(
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

            let reviewLogId: string | undefined;
            await prisma.$transaction(async (tx) => {
                if (!isPro) {
                    await tx.user.update({ where: { id: userId }, data: { credits: { decrement: 1 } } });
                }
                const log = await tx.processingLog.create({
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
                reviewLogId = log.id;
            });

            return NextResponse.json({
                requiresReview: true,
                reviewId: reviewLogId,
                missingFields,
                data: { filename: reviewFilename, ...invoiceData, driveLink: driveResult.driveLink },
            });
        }

        // Normal flow — all fields present.
        // Reserve a sheet row atomically in DB before calling syncToGoogle.
        // This ensures concurrent uploads each get a unique row without
        // inserting physical rows into the sheet (which would disrupt formula rows).
        const reservedRow = await reserveSheetRow(userId);

        const syncResult = await syncToGoogle(
            invoiceData, buffer, filename, accessToken,
            sheetId, user.sheetName, user.sheetMapping,
            LOCKED_DRIVE_FOLDER_ID,
            LOCKED_DRIVE_FOLDER_MODE,
            reservedRow,
        );
        driveLink = syncResult.driveLink;
        partialDriveLink = driveLink;
        sheetRow = syncResult.sheetRow;

    } catch (err: any) {
        console.error("Processing error:", err);
        status = "error";
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

    await prisma.$transaction(async (tx) => {
        if (!isPro) {
            await tx.user.update({ where: { id: userId }, data: { credits: { decrement: 1 } } });
        }
        await tx.processingLog.create({
            data: {
                userId, filename, originalFilename,
                invoiceDate: invoiceData?.date,
                cardLast4: invoiceData?.card_last_4,
                amount: invoiceData?.amount,
                currency: invoiceData?.currency,
                driveLink, sheetRow, status,
            },
        });
    });

    return NextResponse.json({
        success: true,
        data: { filename, ...invoiceData, driveLink, sheetRow },
    });
}
