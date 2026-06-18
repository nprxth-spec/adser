import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { getActualSheetLastRow } from "@/lib/google";
import { realignSheetRowCounter } from "@/lib/sheet-row";
import { prisma } from "@/lib/prisma";

export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { sheetId: true, sheetName: true, sheetMapping: true },
    });

    if (!user || !user.sheetId) {
        return NextResponse.json({ error: "No Google Sheet ID configured." }, { status: 400 });
    }

    const accessToken = await getValidGoogleAccessToken(session.user.id);
    if (!accessToken) {
        return NextResponse.json({ error: "Google access token missing. Please sign in again." }, { status: 401 });
    }

    try {
        const lastRow = await getActualSheetLastRow(accessToken, user.sheetId, user.sheetName, user.sheetMapping);
        await realignSheetRowCounter(session.user.id, lastRow);
        return NextResponse.json({ success: true, lastRow });
    } catch (err: any) {
        console.error("Failed to realign sheet row counter:", err);
        return NextResponse.json({ error: err.message || "Failed to realign row counter" }, { status: 500 });
    }
}
