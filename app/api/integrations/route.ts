import { revalidateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientIp } from "@/lib/audit-log";

type SheetProfile = {
  id: string;
  name: string;
  sheetId: string;
  sheetName: string | null;
  sheetGid: number | null;
  sheetMapping: any | null;
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      sheetId: true,
      sheetName: true,
      sheetMapping: true,
      sheetProfiles: true,
      activeSheetProfileId: true,
    },
  });

  let profiles: SheetProfile[] = (user?.sheetProfiles as SheetProfile[] | null) ?? [];
  let activeId: string | null = (user?.activeSheetProfileId as string | null) ?? null;

  if (profiles.length === 0 && (user?.sheetId || user?.sheetName || user?.sheetMapping)) {
    const defaultId = "default";
    profiles = [{
      id: defaultId,
      name: "Default",
      sheetId: user?.sheetId ?? "",
      sheetName: user?.sheetName ?? null,
      sheetGid: (user as any)?.sheetGid ?? null,
      sheetMapping: user?.sheetMapping ?? null,
    }];
    activeId = defaultId;
  }

  return NextResponse.json({ data: { profiles, activeProfileId: activeId } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const profiles = (body.profiles as SheetProfile[] | undefined) ?? [];
  const activeProfileId = (body.activeProfileId as string | undefined) ?? null;

  if (!Array.isArray(profiles)) {
    return NextResponse.json({ error: "Invalid profiles payload" }, { status: 400 });
  }

  const MAX_PROFILES = 20;
  if (profiles.length > MAX_PROFILES) {
    return NextResponse.json(
      { error: `Too many profiles. Maximum is ${MAX_PROFILES}.` },
      { status: 400 }
    );
  }

  const sanitizedProfiles: SheetProfile[] = profiles.map((p) => ({
    id: String(p.id ?? "").slice(0, 64),
    name: String(p.name ?? "").slice(0, 100),
    sheetId: String(p.sheetId ?? "").slice(0, 200),
    sheetName: p.sheetName ? String(p.sheetName).slice(0, 200) : null,
    sheetGid: typeof p.sheetGid === "number" ? p.sheetGid : null,
    sheetMapping: p.sheetMapping && typeof p.sheetMapping === "object" ? p.sheetMapping : null,
  }));

  const activeProfile = sanitizedProfiles.find((p) => p.id === activeProfileId)
    ?? sanitizedProfiles[0]
    ?? null;

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
      data: {
        sheetProfiles: sanitizedProfiles,
        activeSheetProfileId: activeProfile ? activeProfile.id : null,
        sheetId: activeProfile ? activeProfile.sheetId ?? null : null,
        sheetName: activeProfile ? activeProfile.sheetName ?? null : null,
        sheetGid: activeProfile ? (activeProfile.sheetGid ?? null) : null,
        sheetMapping: activeProfile ? activeProfile.sheetMapping ?? null : null,
        sheetWriteRow: null, // Reset counter so it realigns on next upload!
      },
    });
    await createAuditLog(
      session.user.id,
      "config_sheet",
      "Edit Google Sheet integration",
      { profileCount: sanitizedProfiles.length, activeId: activeProfile?.id ?? null },
      getClientIp(request)
    );

    revalidateTag(`user-sheet-${session.user.id}`, "default");
    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Failed to save integrations:", err);
    return NextResponse.json(
      { error: err.message ?? "Failed to save integrations" },
      { status: 500 }
    );
  }
}
