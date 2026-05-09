import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/**
 * PATCH /api/admin/log-entry/[id] — edit editable fields of a processing log entry.
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
        const data: Record<string, any> = {};

        if (body.invoiceDate !== undefined) data.invoiceDate = body.invoiceDate || null;
        if (body.cardLast4 !== undefined)   data.cardLast4   = body.cardLast4   || null;
        if (body.currency !== undefined)    data.currency    = body.currency    || null;
        if (body.filename !== undefined)    data.filename    = body.filename    || null;
        if (body.driveLink !== undefined)   data.driveLink   = body.driveLink   || null;
        if (body.status !== undefined)      data.status      = body.status;
        if (body.amount !== undefined) {
            data.amount = body.amount !== "" && body.amount !== null
                ? Number(body.amount)
                : null;
        }
        if (body.sheetRow !== undefined) {
            data.sheetRow = body.sheetRow !== "" && body.sheetRow !== null
                ? Number(body.sheetRow)
                : null;
        }

        const updated = await prisma.processingLog.update({ where: { id }, data });
        return NextResponse.json({ success: true, data: updated });
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

