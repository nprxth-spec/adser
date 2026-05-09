import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";
import { renameDriveFile, updateSheetRow } from "@/lib/google";
import { getValidGoogleAccessToken } from "@/lib/google-auth";

function extractDriveFileId(driveLink: string): string | null {
    const m = driveLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
}

/**
 * PATCH /api/admin/log-entry/[id]
 * Edit a processing log entry and sync the changes to Google Drive and Sheets.
 *
 * Flow:
 *  1. Rename the Drive file if filename changed (uses item owner's token)
 *  2. Update the corresponding Sheet row with new data (uses owner's token + their mapping)
 *  3. Update the DB record
 *
 * All Google operations are best-effort — failures are returned as warnings,
 * not hard errors, so the DB is always updated.
 */
export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const ok = await isAdminAuthenticated();
    if (!ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;

    try {
        const body = await request.json();

        // Build DB update payload
        const dbData: Record<string, any> = {};
        if (body.invoiceDate !== undefined) dbData.invoiceDate = body.invoiceDate || null;
        if (body.cardLast4   !== undefined) dbData.cardLast4   = body.cardLast4   || null;
        if (body.currency    !== undefined) dbData.currency    = body.currency    || null;
        if (body.filename    !== undefined) dbData.filename    = body.filename    || null;
        if (body.driveLink   !== undefined) dbData.driveLink   = body.driveLink   || null;
        if (body.status      !== undefined) dbData.status      = body.status;
        if (body.amount !== undefined) {
            dbData.amount = body.amount !== "" && body.amount !== null ? Number(body.amount) : null;
        }
        if (body.sheetRow !== undefined) {
            dbData.sheetRow = body.sheetRow !== "" && body.sheetRow !== null ? Number(body.sheetRow) : null;
        }

        // Fetch current log + user config in parallel
        const log = await prisma.processingLog.findUnique({
            where: { id },
            include: {
                user: {
                    select: { sheetId: true, sheetName: true, sheetMapping: true },
                },
            },
        });
        if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const warnings: string[] = [];

        // ── Google operations (best-effort) ────────────────────────────────────
        const accessToken = await getValidGoogleAccessToken(log.userId).catch(() => null);

        if (accessToken) {
            // 1. Rename Drive file
            // Always use log.driveLink (current DB value) to locate the file —
            // even if the admin also edited the driveLink field, we rename the
            // file that currently exists, identified by the stored link.
            const newFilename = (dbData.filename as string | null | undefined) ?? null;
            if (newFilename) {
                const fileId = log.driveLink ? extractDriveFileId(log.driveLink) : null;
                if (fileId) {
                    await renameDriveFile(fileId, newFilename, accessToken).catch((e: any) => {
                        warnings.push(`Drive rename failed: ${e?.message ?? "unknown error"}`);
                    });
                } else {
                    console.warn("[admin log edit] Could not extract Drive fileId from driveLink:", log.driveLink);
                    if (log.driveLink) warnings.push("Drive rename skipped: could not parse file ID from stored Drive link");
                }
            }

            // 2. Update Sheet row
            const sheetId   = log.user?.sheetId   ?? null;
            const sheetName = log.user?.sheetName  ?? null;
            const sheetMapping = log.user?.sheetMapping ?? null;
            const rowNumber = (dbData.sheetRow ?? log.sheetRow) as number | null;

            if (sheetId && rowNumber && rowNumber > 0) {
                await updateSheetRow(
                    {
                        invoiceDate: dbData.invoiceDate ?? log.invoiceDate,
                        cardLast4:   dbData.cardLast4   ?? log.cardLast4,
                        amount:      dbData.amount      !== undefined ? dbData.amount : log.amount,
                        currency:    dbData.currency    ?? log.currency,
                        filename:    dbData.filename    ?? log.filename,
                        driveLink:   dbData.driveLink   ?? log.driveLink,
                    },
                    accessToken,
                    sheetId,
                    sheetName,
                    sheetMapping,
                    rowNumber,
                ).catch((e: any) => {
                    warnings.push(`Sheet update failed: ${e?.message ?? "unknown error"}`);
                });
            }
        } else {
            warnings.push("Google access token unavailable — Drive and Sheet were not updated");
        }

        // 3. Always update DB
        const updated = await prisma.processingLog.update({ where: { id }, data: dbData });

        return NextResponse.json({
            success: true,
            data: updated,
            ...(warnings.length > 0 && { warnings }),
        });
    } catch (err: any) {
        console.error("Admin edit log error:", err);
        return NextResponse.json(
            { error: err?.message ?? "Failed to update log" },
            { status: 500 },
        );
    }
}

/**
 * DELETE a single processing log entry by id.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await prisma.processingLog.delete({
      where: { id },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Admin delete single log error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to delete log" },
      { status: 500 }
    );
  }
}

