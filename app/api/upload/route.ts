import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { extractInvoiceData, InvoiceData } from "@/lib/openai";
import { syncToGoogle } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { ensureFreeCreditsReset } from "@/lib/credits";

export const runtime = "nodejs";

// Cache pdf-parse at module level — avoid re-importing on every request
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

// ── Filename template types ────────────────────────────────────────────────────
type TemplateItem =
    | { type: "field"; key: string; id: string }
    | { type: "literal"; value: string; id: string };

/**
 * Build filename from a user-defined template.
 * `stem`  = original filename WITHOUT extension (sanitized)
 * `ext`   = extension including dot, e.g. ".pdf"
 */
function applyFilenameTemplate(
    template: TemplateItem[],
    stem: string,
    ext: string,
    cardPrefix: string | null,
    data: InvoiceData,
): string {
    const fields: Record<string, string> = {
        card_prefix:      cardPrefix ?? "",
        original_filename: stem,
        billed_to:        data.billed_to ?? "",
        date:             data.date ?? "",
        amount:           data.amount != null ? String(data.amount) : "",
        currency:         data.currency ?? "",
        payment_method:   data.payment_method ?? "",
        invoice_number:   data.invoice_number ?? "",
        reference_number: data.reference_number ?? "",
        transaction_id:   data.transaction_id ?? "",
        account_id:       data.account_id ?? "",
    };

    let result = "";
    for (const token of template) {
        if (token.type === "field") {
            result += fields[token.key] ?? "";
        } else {
            result += token.value;
        }
    }
    const trimmed = result.trim().replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
    return (trimmed || stem) + ext;
}

/**
 * Legacy filename builder — used when no template is configured.
 * Produces: [prefix ][stem][ (billed_to)][ext]
 */
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
    // 1. Auth
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    // 2. Load user
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            plan: true, credits: true, sheetId: true, sheetName: true,
            sheetMapping: true, filenameMapping: true, filenameTemplate: true,
            driveFolderId: true, driveFolderMode: true,
        },
    });
    if (!user) {
        return NextResponse.json({ error: "User not found." }, { status: 401 });
    }

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
        return NextResponse.json(
            { error: "Google access token missing. Please sign in again." },
            { status: 401 }
        );
    }

    // 3. Parse form
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sheetId = (formData.get("sheetId") as string) || user.sheetId || "";

    if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // 4. Validate file
    const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
    const contentType = (file as any).type as string | undefined;
    const size = (file as any).size as number | undefined;

    if (size !== undefined && size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
            { error: "File too large. Please upload a PDF smaller than 10 MB." },
            { status: 413 }
        );
    }

    const isPdf =
        contentType === "application/pdf" ||
        (!contentType && file.name.toLowerCase().endsWith(".pdf"));
    if (!isPdf) {
        return NextResponse.json(
            { error: "Invalid file type. Only PDF invoices are allowed." },
            { status: 400 }
        );
    }

    if (!sheetId) {
        return NextResponse.json(
            { error: "No Google Sheet ID configured. Please set it in Integrations settings." },
            { status: 400 }
        );
    }

    const originalFilename = file.name;
    // Sanitize: strip characters that cause problems in Drive / Sheets
    const sanitizedOriginal = originalFilename.replace(/[<>:"\\|?*\x00-\x1f]/g, "_");
    let filename = sanitizedOriginal;

    // 5. Duplicate check (use DB-level lock via unique constraint awareness)
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
            { error: `File "${originalFilename}" has already been processed.` },
            { status: 409 }
        );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let invoiceData: InvoiceData;
    let driveLink = "";
    let sheetRow = 0;
    let status = "success";

    try {
        // 6. Parse PDF
        const pdfParse = await getPdfParse();
        const textResult = await pdfParse(buffer);
        const pdfText = textResult.text;

        // 7. AI extraction
        invoiceData = await extractInvoiceData(pdfText);

        // 8. Build filename
        const last4 = invoiceData.card_last_4;
        const mapping = (user as any).filenameMapping as Record<string, string> | null | undefined;
        const cardPrefix = (last4 && mapping && typeof mapping === "object" && mapping[last4])
            ? mapping[last4]
            : null;

        const template = (user as any).filenameTemplate as TemplateItem[] | null | undefined;

        if (template && Array.isArray(template) && template.length > 0) {
            // Custom template
            const dotIdx = sanitizedOriginal.lastIndexOf(".");
            const stem = dotIdx > 0 ? sanitizedOriginal.slice(0, dotIdx) : sanitizedOriginal;
            const ext  = dotIdx > 0 ? sanitizedOriginal.slice(dotIdx) : "";
            filename = applyFilenameTemplate(template, stem, ext, cardPrefix, invoiceData);
        } else {
            // Legacy behavior
            filename = buildFilenameLegacy(sanitizedOriginal, cardPrefix, invoiceData.billed_to);
        }

        // 9. Sync to Google
        const syncResult = await syncToGoogle(
            invoiceData, buffer, filename, accessToken,
            sheetId, user.sheetName, user.sheetMapping,
            user.driveFolderId ?? null,
            (user as any).driveFolderMode ?? "auto"
        );
        driveLink = syncResult.driveLink;
        sheetRow = syncResult.sheetRow;
    } catch (err: any) {
        console.error("Processing error:", err);
        status = "error";
        await prisma.processingLog.create({
            data: { userId, filename: sanitizedOriginal, originalFilename, status: "error" },
        });
        const safeMessage =
            err.message?.includes("Google") || err.message?.includes("Sheet") || err.message?.includes("Drive")
                ? "Failed to sync to Google services. Please check your integration settings."
                : "Processing failed. Please try again or contact support.";
        return NextResponse.json({ error: safeMessage }, { status: 500 });
    }

    // 10. Deduct credit + log
    await prisma.$transaction(async (tx) => {
        if (!isPro) {
            await tx.user.update({
                where: { id: userId },
                data: { credits: { decrement: 1 } },
            });
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

    // 11. Return
    return NextResponse.json({
        success: true,
        data: { filename, ...invoiceData, driveLink, sheetRow },
    });
}
