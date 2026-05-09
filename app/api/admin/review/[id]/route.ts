import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma, Prisma } from "@/lib/prisma";
import { renameDriveFile, appendToSheet } from "@/lib/google";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { InvoiceData } from "@/lib/openai";
import { google } from "googleapis";

function extractDriveFileId(driveLink: string): string | null {
    const m = driveLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

/**
 * PATCH /api/admin/review/[id]
 * Admin approves a review item on behalf of its owner.
 * Uses the item owner's Google access token to rename Drive file + append Sheet row.
 */
export async function PATCH(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!(await isAdminAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id || id.length > 64) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Atomically claim the item by flipping status "review" → "approving"
    const claimed = await prisma.processingLog.updateMany({
        where: { id, status: "review" },
        data: { status: "approving" },
    });
    if (claimed.count === 0) {
        return NextResponse.json({ error: "Not found or already being approved" }, { status: 409 });
    }

    const item = await prisma.processingLog.findFirst({ where: { id } });
    if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json() as { invoiceData?: Partial<InvoiceData>; cardPrefix?: string };
    const pending = item.pendingData as any;
    if (!pending) {
        await prisma.processingLog.updateMany({ where: { id, status: "approving" }, data: { status: "review" } }).catch(() => {});
        return NextResponse.json({ error: "No pending data found" }, { status: 400 });
    }

    const mergedInvoiceData: InvoiceData = {
        ...(pending.invoiceData ?? {}),
        ...(body.invoiceData ?? {}),
    };
    const cardPrefix: string = body.cardPrefix ?? pending.cardPrefix ?? "";

    const paymentSucceeded = (mergedInvoiceData as any).paymentSuccess !== false;
    const date = (mergedInvoiceData.date ?? "").trim();
    const refNo = (mergedInvoiceData.reference_number ?? "").trim();
    const billedTo = (mergedInvoiceData.billed_to ?? "").trim();
    const prefix = cardPrefix.trim();

    const missingRequired = !prefix || !date || !billedTo || (paymentSucceeded && !refNo);
    if (missingRequired) {
        await prisma.processingLog.updateMany({ where: { id, status: "approving" }, data: { status: "review" } }).catch(() => {});
        const required = paymentSucceeded
            ? "Card name, date, reference no., billed to"
            : "Card name, date, billed to";
        return NextResponse.json({ error: `Required fields missing: ${required}` }, { status: 400 });
    }

    const finalFilename = (paymentSucceeded && refNo)
        ? `${prefix} - ${date} - ${refNo} (${billedTo}).pdf`
        : `${prefix} - ${date} (${billedTo}).pdf`;

    // Use the item owner's Google access token (not admin's)
    const accessToken = await getValidGoogleAccessToken(item.userId);
    if (!accessToken) {
        await prisma.processingLog.updateMany({ where: { id, status: "approving" }, data: { status: "review" } }).catch(() => {});
        return NextResponse.json(
            { error: "User's Google access token is missing — ask the user to re-authenticate." },
            { status: 401 },
        );
    }

    const driveFileId: string = pending.driveFileId ?? "";
    const sheetId: string = pending.sheetId ?? "";
    const sheetName: string | null = pending.sheetName ?? null;
    const sheetMapping = pending.sheetMapping ?? null;
    const warnings: string[] = [];

    try {
        // 1. Rename Drive file
        if (driveFileId) {
            await renameDriveFile(driveFileId, finalFilename, accessToken);
        }

        // 2. Append row to the owner's Sheet
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
        } else {
            warnings.push("No Sheet ID was configured at upload time — row not added to Sheets");
        }

        // 3. Mark success in DB
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
            ...(warnings.length > 0 && { warnings }),
        });
    } catch (err: any) {
        console.error("Admin review approval error:", err);
        await prisma.processingLog.updateMany({
            where: { id, status: "approving" },
            data: { status: "review" },
        }).catch(() => {});
        return NextResponse.json(
            { error: err.message ?? "Failed to approve review item" },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/admin/review/[id]
 * Admin deletes a review item on behalf of its owner.
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    if (!(await isAdminAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id || id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const item = await prisma.processingLog.findFirst({
        where: { id, status: "review" },
    });
    if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const warnings: string[] = [];
    const pending = item.pendingData as { driveFileId?: string } | null;

    // Use item owner's Google token
    const accessToken = await getValidGoogleAccessToken(item.userId);
    if (accessToken) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2Client.setCredentials({ access_token: accessToken });

        let fileId: string | null = item.driveLink ? extractDriveFileId(item.driveLink) : null;
        if (!fileId && pending?.driveFileId) fileId = pending.driveFileId;

        if (fileId) {
            try {
                const drive = google.drive({ version: "v3", auth: oauth2Client });
                await drive.files.delete({ fileId });
            } catch (err: any) {
                if (err?.code !== 404 && err?.status !== 404) {
                    warnings.push(`Drive: ${err.message ?? "Failed to delete file"}`);
                }
            }
        }
    } else if (item.driveLink || pending?.driveFileId) {
        warnings.push("User's Google access token missing — Drive file not deleted");
    }

    await prisma.processingLog.delete({ where: { id } });

    return NextResponse.json({
        success: true,
        ...(warnings.length > 0 && { warnings }),
    });
}
