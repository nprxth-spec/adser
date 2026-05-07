import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma, Prisma } from "@/lib/prisma";
import { renameDriveFile, appendToSheet } from "@/lib/google";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { InvoiceData } from "@/lib/openai";

/** GET /api/review/[id] — get a single review item */
export async function GET(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const item = await prisma.processingLog.findFirst({
        where: { id, userId: session.user.id, status: "review" },
    });
    if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ data: item });
}

/**
 * PATCH /api/review/[id]
 * Body: { invoiceData: Partial<InvoiceData>, cardPrefix: string }
 *
 * Approves a review item:
 * 1. Merges updated invoiceData + cardPrefix into the stored pendingData
 * 2. Builds the final filename from the locked template
 * 3. Renames the Drive file (removes REVIEW_ prefix + uses corrected data)
 * 4. Appends a row to Sheets
 * 5. Updates the DB log to status="success"
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;

    const item = await prisma.processingLog.findFirst({
        where: { id, userId, status: "review" },
    });
    if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json() as { invoiceData?: Partial<InvoiceData>; cardPrefix?: string };
    const pending = item.pendingData as any;
    if (!pending) {
        return NextResponse.json({ error: "No pending data found" }, { status: 400 });
    }

    // Merge updated fields into stored invoiceData
    const mergedInvoiceData: InvoiceData = {
        ...(pending.invoiceData ?? {}),
        ...(body.invoiceData ?? {}),
    };
    const cardPrefix: string = body.cardPrefix ?? pending.cardPrefix ?? "";

    // Build final filename using locked template: {card_prefix} - {date} - {reference_number} ({billed_to})
    const date = (mergedInvoiceData.date ?? "").trim();
    const refNo = (mergedInvoiceData.reference_number ?? "").trim();
    const billedTo = (mergedInvoiceData.billed_to ?? "").trim();
    const prefix = cardPrefix.trim();

    if (!prefix || !date || !refNo || !billedTo) {
        return NextResponse.json(
            { error: "All fields (ชื่อบัตร, วันที่, หมายเลขอ้างอิง, ใบเสร็จสำหรับ) are required to approve" },
            { status: 400 }
        );
    }

    const finalFilename = `${prefix} - ${date} - ${refNo} (${billedTo}).pdf`;

    // Get access token
    const accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
        return NextResponse.json(
            { error: "Google access token missing. Please sign in again." },
            { status: 401 }
        );
    }

    const driveFileId: string = pending.driveFileId ?? "";
    const sheetId: string = pending.sheetId ?? "";
    const sheetName: string | null = pending.sheetName ?? null;
    const sheetMapping = pending.sheetMapping ?? null;

    try {
        // 1. Rename Drive file
        if (driveFileId) {
            await renameDriveFile(driveFileId, finalFilename, accessToken);
        }

        // 2. Add row to Sheets
        let sheetRow = 0;
        if (sheetId) {
            sheetRow = await appendToSheet(
                mergedInvoiceData,
                finalFilename,
                item.driveLink ?? "",
                accessToken,
                sheetId,
                sheetName,
                sheetMapping,
            );
        }

        // 3. Update DB
        await prisma.processingLog.update({
            where: { id },
            data: {
                status: "success",
                filename: finalFilename,
                invoiceDate: date,
                cardLast4: mergedInvoiceData.card_last_4,
                amount: mergedInvoiceData.amount,
                currency: mergedInvoiceData.currency,
                sheetRow,
                pendingData: Prisma.DbNull,
            },
        });

        return NextResponse.json({
            success: true,
            data: { filename: finalFilename, driveLink: item.driveLink, sheetRow },
        });
    } catch (err: any) {
        console.error("Review approval error:", err);
        return NextResponse.json(
            { error: err.message ?? "Failed to approve review item" },
            { status: 500 }
        );
    }
}

/** DELETE /api/review/[id] — discard a review item (keep Drive file as-is, mark status=error) */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const item = await prisma.processingLog.findFirst({
        where: { id, userId: session.user.id, status: "review" },
    });
    if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.processingLog.update({
        where: { id },
        data: { status: "error", pendingData: Prisma.DbNull },
    });

    return NextResponse.json({ success: true });
}
