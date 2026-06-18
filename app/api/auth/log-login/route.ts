import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getClientIp } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";

const LOGIN_LOG_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes — avoid duplicate on refresh

/**
 * POST: Record a login audit log (called by client after sign-in).
 * Only creates a log if the last login log for this user was more than 2 minutes ago.
 * Captures client IP.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const ip = getClientIp(request);

  try {
    // Check if user exists in the database to avoid foreign key violation
    // if a stale JWT session cookie is present but the database has been reset.
    const userExists = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!userExists) {
      return NextResponse.json({ error: "User not found in database" }, { status: 401 });
    }

    const lastLogin = await prisma.auditLog.findFirst({
      where: { userId, type: "login" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });

    const now = Date.now();
    if (
      lastLogin &&
      now - lastLogin.createdAt.getTime() < LOGIN_LOG_COOLDOWN_MS
    ) {
      return NextResponse.json({ ok: true, skipped: "recent" });
    }

    await prisma.auditLog.create({
      data: {
        userId,
        type: "login",
        description: "ล็อกอินด้วย Google",
        ...(ip != null && { metadata: { ip } }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("log-login error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to log login" },
      { status: 500 }
    );
  }
}
