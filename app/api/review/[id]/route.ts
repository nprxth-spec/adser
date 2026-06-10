import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma, Prisma } from "@/lib/prisma";
import { renameDriveFile, appendToSheet, getActualSheetLastRow } from "@/lib/google";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { InvoiceData } from "@/lib/openai";
import { google } from "googleapis";
import { reserveSheetRow, withUserSheetWriteLock } from "@/lib/sheet-row";

/** Extract the Google Drive file ID from a webViewLink or webContentLink URL. */
function extractDriveFileId(driveLink: string): string | null {
    const byPath = driveLink.match(/\/(?:file\/d|document\/d)\/([a-zA-Z0-9_-]+)/);
    if (byPath) return byPath[1];

    try {
        const url = new URL(driveLink);
        const byQuery = url.searchParams.get("id");
        if (byQuery && /^[a-zA-Z0-9_-]+$/.test(byQuery)) return byQuery;
    } catch {
        // Fall through to the broad matcher below.
    }

    const byOpenId = driveLink.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return byOpenId ? byOpenId[1] : null;
}

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
    if (!id || id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

    // Reject obviously invalid IDs (CUIDs are ≤ 30 chars)
    if (!id || id.length > 64) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Atomically claim the item by flipping status from "review" → "approving".
    // If another request already claimed it (0 rows updated) → return 409.
    const claimed = await prisma.processingLog.updateMany({
        where: { id, userId, status: "review" },
        data: { status: "approving" },
    });
    if (claimed.count === 0) {
        return NextResponse.json({ error: "Not found or already being approved" }, { status: 409 });
    }

    const item = await prisma.processingLog.findFirst({
        where: { id, userId },
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

    // Build final filename
    // reference_number is optional when payment failed
    const paymentSucceeded = (mergedInvoiceData as any).paymentSuccess !== false;
    const date = (mergedInvoiceData.date ?? "").trim();
    const refNo = (mergedInvoiceData.reference_number ?? "").trim();
    const billedTo = (mergedInvoiceData.billed_to ?? "").trim();
    const prefix = cardPrefix.trim();

    const missingRequired = !prefix || !date || !billedTo || (paymentSucceeded && !refNo);
    if (missingRequired) {
        const required = paymentSucceeded
            ? "ชื่อบัตร, วันที่, หมายเลขอ้างอิง, ใบเสร็จสำหรับ"
            : "ชื่อบัตร, วันที่, ใบเสร็จสำหรับ";
        return NextResponse.json(
            { error: `Required fields: ${required}` },
            { status: 400 }
        );
    }

    // Filename: include reference_number only when payment succeeded and it exists
    const finalFilename = (paymentSucceeded && refNo)
        ? `${prefix} - ${date} - ${refNo} (${billedTo}).pdf`
        : `${prefix} - ${date} (${billedTo}).pdf`;

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

    const warnings: string[] = [];

    try {
        // 1. Rename Drive file
        if (driveFileId) {
            await renameDriveFile(driveFileId, finalFilename, accessToken);
        }

        // 2. Add row to Sheets
        let sheetRow = 0;
        if (sheetId) {
            sheetRow = await withUserSheetWriteLock(userId, async () => {
                const rowSeed = await getActualSheetLastRow(accessToken, sheetId, sheetName, sheetMapping);
                const reservedRow = await reserveSheetRow(userId, rowSeed);
                return await appendToSheet(
                    mergedInvoiceData,
                    finalFilename,
                    item.driveLink ?? "",
                    accessToken,
                    sheetId,
                    sheetName,
                    sheetMapping,
                    reservedRow,
                );
            });
        } else {
            warnings.push("No Sheet ID was configured at upload time — row not added to Sheets");
        }

        // 3. Update DB — mark success
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
        console.error("Review approval error:", err);
        // Revert status back to "review" so the user can try again
        await prisma.processingLog.updateMany({
            where: { id, userId, status: "approving" },
            data: { status: "review" },
        }).catch(() => {});
        return NextResponse.json(
            { error: err.message ?? "Failed to approve review item" },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/review/[id] — remove a review queue item permanently.
 * Deletes the DB row and attempts to delete the uploaded PDF from Google Drive.
 */
export async function DELETE(
    _req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const userId = session.user.id;
    if (!id || id.length > 64) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const item = await prisma.processingLog.findFirst({
        where: { id, userId, status: "review" },
    });
    if (!item) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const warnings: string[] = [];
    const pending = item.pendingData as { driveFileId?: string } | null;

    const accessToken = await getValidGoogleAccessToken(userId);
    if (accessToken) {
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
        );
        oauth2Client.setCredentials({ access_token: accessToken });

        let fileId: string | null = pending?.driveFileId ?? null;
        if (!fileId && item.driveLink) fileId = extractDriveFileId(item.driveLink);

        if (fileId) {
            try {
                const drive = google.drive({ version: "v3", auth: oauth2Client });
                await drive.files.delete({ fileId });
            } catch (err: any) {
                if (err?.code !== 404 && err?.status !== 404) {
                    warnings.push(`Drive: ${err.message ?? "Failed to delete file"}`);
                }
            }
        } else if (item.driveLink || pending?.driveFileId) {
            warnings.push("Drive: could not resolve file ID to delete");
        }
    } else if (item.driveLink || pending?.driveFileId) {
        warnings.push("Google access token missing — Drive file not deleted");
    }

    await prisma.processingLog.delete({ where: { id } });

    return NextResponse.json({
        success: true,
        ...(warnings.length > 0 && { warnings }),
    });
}
