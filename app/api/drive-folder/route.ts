import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientIp } from "@/lib/audit-log";

const VALID_MODES = ["auto", "custom", "date-subfolder"] as const;
type DriveMode = (typeof VALID_MODES)[number];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { driveFolderId: true, driveFolderMode: true },
  });

  return NextResponse.json({
    data: {
      driveFolderId: user?.driveFolderId ?? null,
      driveFolderMode: user?.driveFolderMode ?? "auto",
    },
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const driveFolderIdRaw = (body as any)?.driveFolderId as string | undefined;
  const driveFolderId =
    typeof driveFolderIdRaw === "string" && driveFolderIdRaw.trim().length > 0
      ? driveFolderIdRaw.trim()
      : null;

  const modeRaw = (body as any)?.driveFolderMode as string | undefined;
  const driveFolderMode: DriveMode =
    typeof modeRaw === "string" && VALID_MODES.includes(modeRaw as DriveMode)
      ? (modeRaw as DriveMode)
      : driveFolderId
        ? "custom"
        : "auto";

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found in database. Please sign out and sign in again." },
        { status: 404 }
      );
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { driveFolderId, driveFolderMode },
    });

    await createAuditLog(
      session.user.id,
      "config_drive",
      driveFolderMode === "auto"
        ? "ล้างโฟลเดอร์ Drive (ใช้โหมดอัตโนมัติ)"
        : driveFolderMode === "date-subfolder"
          ? "ตั้งค่าโฟลเดอร์ Drive แบบสร้างตามวันที่"
          : "ตั้งค่าโฟลเดอร์ Drive ปลายทาง",
      { driveFolderId, driveFolderMode },
      getClientIp(request)
    );

    revalidateTag(`user-folder-${session.user.id}`, "max");

    return NextResponse.json({ success: true, data: { driveFolderId, driveFolderMode } });
  } catch (err: any) {
    console.error("Failed to update driveFolderId:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to save Drive folder." },
      { status: 500 }
    );
  }
}
