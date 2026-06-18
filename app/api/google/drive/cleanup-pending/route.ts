import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { cleanupPendingDriveFiles } from "@/lib/google";

const LOCKED_DRIVE_FOLDER_ID = "1l9gD9sNTtfJ0Yl9CiWeLyRmhLthPk9-S";

export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getValidGoogleAccessToken(session.user.id);
    if (!accessToken) {
        return NextResponse.json({ error: "Google access token missing. Please sign in again." }, { status: 401 });
    }

    try {
        const result = await cleanupPendingDriveFiles(accessToken, LOCKED_DRIVE_FOLDER_ID);
        return NextResponse.json({ success: true, ...result });
    } catch (err: any) {
        console.error("Failed to cleanup pending drive files:", err);
        return NextResponse.json({ error: err.message || "Failed to cleanup pending files" }, { status: 500 });
    }
}
