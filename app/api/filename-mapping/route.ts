import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientIp } from "@/lib/audit-log";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { filenameMapping: true },
  });

  return NextResponse.json({ data: user?.filenameMapping ?? null });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const mapping = body?.mapping as Record<string, string> | null | undefined;

  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return NextResponse.json({ error: "Invalid mapping payload" }, { status: 400 });
  }

  const MAX_RULES = 1000;
  if (Object.keys(mapping).length > MAX_RULES) {
    return NextResponse.json(
      { error: `Too many mapping rules. Maximum is ${MAX_RULES}.` },
      { status: 400 }
    );
  }

  const cleaned: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(mapping)) {
    const key = String(rawKey).trim().slice(0, 10);
    const val = String(rawVal).trim().slice(0, 100);
    if (!key || !val) continue;
    if (!/^\d+$/.test(key)) continue;
    cleaned[key] = val;
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { filenameMapping: cleaned },
  });
  await createAuditLog(
    session.user.id,
    "config_naming",
    "Edit filename rules (last 4 digits -> prefix)",
    { ruleCount: Object.keys(cleaned).length },
    getClientIp(request)
  );

  return NextResponse.json({ success: true });
}
