import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { extractInvoiceData } from "@/lib/openai";

export const runtime = "nodejs";

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

/**
 * POST /api/review/[id]/rescan
 * Downloads the existing Drive file and re-runs AI extraction.
 * Returns the freshly extracted invoiceData for the user to review — does NOT approve.
 */
export async function POST(
    _req: Request,
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

    const pending = item.pendingData as any;
    const driveFileId: string = pending?.driveFileId ?? "";
    if (!driveFileId) {
        return NextResponse.json({ error: "No Drive file ID stored for this item" }, { status: 400 });
    }

    const accessToken = await getValidGoogleAccessToken(userId);
    if (!accessToken) {
        return NextResponse.json({ error: "Google access token missing. Please sign in again." }, { status: 401 });
    }

    // Download file content from Drive
    const driveRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!driveRes.ok) {
        return NextResponse.json(
            { error: `Failed to download file from Drive (${driveRes.status})` },
            { status: 502 },
        );
    }

    const arrayBuffer = await driveRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const pdfParse = await getPdfParse();
    const { text: pdfText } = await pdfParse(buffer);
    const invoiceData = await extractInvoiceData(pdfText);

    return NextResponse.json({ success: true, data: { invoiceData } });
}
