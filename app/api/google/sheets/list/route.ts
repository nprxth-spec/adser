import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getValidGoogleAccessToken } from "@/lib/google-auth";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken = await getValidGoogleAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Google access token missing. Please sign in again." },
      { status: 401 }
    );
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ access_token: accessToken });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    const resDrive = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.spreadsheet' and trashed=false",
      fields: "files(id, name)",
      orderBy: "name_natural",
      pageSize: 1000,
      spaces: "drive",
      corpora: "allDrives",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });
    const allFiles = resDrive.data.files ?? [];
    const sheets = allFiles
      .filter((f) => (f.name ?? "").startsWith("101วิเคราะห์แอด"))
      .map((f) => ({
        id: f.id ?? "",
        name: f.name ?? "",
      }));

    return NextResponse.json({ data: sheets });
  } catch (err: any) {
    console.error("Failed to list spreadsheets:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to list spreadsheets" },
      { status: 500 }
    );
  }
}

