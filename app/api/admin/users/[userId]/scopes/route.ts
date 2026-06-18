import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getValidGoogleAccessToken } from "@/lib/google-auth";
import { prisma } from "@/lib/prisma";

/** Scopes the app requests at login (must all be granted for Drive + Sheets to work). */
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
];

function scopesFromString(scopeStr: string | null | undefined): string[] {
  return (scopeStr || "").split(/\s+/).filter(Boolean);
}

function getMissingScopes(granted: string[]): string[] {
  const missing: string[] = [];
  const hasFullDrive = granted.includes("https://www.googleapis.com/auth/drive");
  const hasDriveRead = hasFullDrive || granted.includes("https://www.googleapis.com/auth/drive.readonly");
  const hasDriveFile = hasFullDrive || granted.includes("https://www.googleapis.com/auth/drive.file");
  const hasSheets = granted.includes("https://www.googleapis.com/auth/spreadsheets");

  if (!hasDriveRead) missing.push("https://www.googleapis.com/auth/drive.readonly");
  if (!hasDriveFile) missing.push("https://www.googleapis.com/auth/drive.file");
  if (!hasSheets) missing.push("https://www.googleapis.com/auth/spreadsheets");

  return missing;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  const dbAccount = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true },
  });
  const grantedFromLogin = scopesFromString(dbAccount?.scope);
  const missingFromLogin = getMissingScopes(grantedFromLogin);

  const accessToken = await getValidGoogleAccessToken(userId);
  if (!accessToken) {
    return NextResponse.json({
      ok: false,
      verification: "no_valid_token",
      error: "no_google_account",
      message:
        "ไม่มี access token ที่ใช้ได้ (หมดอายุ / refresh ล้มเหลว / ไม่มี refresh token) — ให้ผู้ใช้ล็อกอิน Google ใหม่",
      granted: [],
      missing: [],
      grantedFromLogin,
      missingFromLogin,
    });
  }

  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        verification: "tokeninfo_failed",
        error: "tokeninfo_failed",
        message:
          (data.error_description as string) ??
          (data.error as string) ??
          "ตรวจสอบโทเค็นกับ Google ไม่ได้",
        granted: [],
        missing: [],
        grantedFromLogin,
        missingFromLogin,
        hint:
          "ข้อความเช่น Invalid Value มักหมายถึงโทเค็นหมดอายุหรือถูกเพิกถอน ไม่ได้แปลว่าสโคปหายจากบัญชีเสมอไป — ดูสโคปตอนล็อกอินล่าสุดด้านล่าง",
      });
    }

    const scopeStr = (data.scope as string) || "";
    const granted = scopesFromString(scopeStr);
    const missing = getMissingScopes(granted);
    const okScopes = missing.length === 0;

    return NextResponse.json({
      ok: okScopes,
      verification: "ok",
      granted,
      missing,
      grantedFromLogin,
      missingFromLogin,
      message: okScopes
        ? "สโคปครบทุกสิทธิ์ที่แอปใช้"
        : `ขาดสิทธิ์: ${missing.join(", ")}`,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      verification: "request_failed",
      error: "request_failed",
      message: err?.message ?? "เกิดข้อผิดพลาด",
      granted: [],
      missing: [],
      grantedFromLogin,
      missingFromLogin,
    });
  }
}
