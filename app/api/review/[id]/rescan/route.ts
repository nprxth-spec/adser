import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { extractInvoiceData } from "@/lib/openai";

export const runtime = "nodejs";
export const maxDuration = 300;

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

function debugPdfText(label: string, id: string, pdfText: string) {
    if (process.env.DEBUG_PDF_TEXT !== "true") return;
    const preview = pdfText
        .slice(0, 4000)
        .split(/\r?\n/)
        .map((line, index) => `${String(index + 1).padStart(3, "0")}: ${line}`)
        .join("\n");
    console.log(`\n[PDF TEXT DEBUG] ${label}: ${id}\n${preview}\n[END PDF TEXT DEBUG]\n`);
}

/**
 * POST /api/review/[id]/rescan
 * Downloads the existing Drive file, re-runs AI extraction, and resolves
 * card_prefix from the user's current filenameMapping.
 * Returns the freshly extracted invoiceData + resolved cardPrefix — does NOT approve.
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

    // Fetch the review item AND the user's current filenameMapping in one round-trip
    const [item, user] = await Promise.all([
        prisma.processingLog.findFirst({
            where: { id, userId, status: "review" },
        }),
        prisma.user.findUnique({
            where: { id: userId },
            select: { filenameMapping: true },
        }),
    ]);

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
    debugPdfText("review-rescan", id, pdfText);
    const invoiceData = await extractInvoiceData(pdfText, buffer);

    // Resolve card prefix from the user's CURRENT filenameMapping
    const filenameMapping = (user?.filenameMapping ?? null) as Record<string, string> | null;
    const last4 = invoiceData.card_last_4 ?? null;
    const cardPrefix: string | null =
        last4 && filenameMapping && typeof filenameMapping === "object" && filenameMapping[last4]
            ? filenameMapping[last4]
            : null;

    // Also persist the resolved cardPrefix back into pendingData so future
    // approve calls can use it without the user having to type it again
    if (cardPrefix) {
        await prisma.processingLog.update({
            where: { id },
            data: {
                pendingData: {
                    ...(pending as object),
                    invoiceData: { ...(pending.invoiceData ?? {}), ...invoiceData },
                    cardPrefix,
                } as any,
            },
        });
    }

    return NextResponse.json({
        success: true,
        data: { invoiceData, cardPrefix },
    });
}
