import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getValidGoogleAccessToken } from "@/lib/google-auth";

const ACCEPTED_SCOPE_GROUPS = [
  [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/drive.readonly",
  ],
  [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ],
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "google" },
    select: { scope: true },
  });

  const accessToken = await getValidGoogleAccessToken(session.user.id);
  if (!accessToken) {
    return NextResponse.json(
      {
        ok: false,
        code: "GOOGLE_REAUTH_REQUIRED",
        error: "Google token expired or missing. Please sign in again.",
      },
      { status: 401 }
    );
  }

  const rawScope = account?.scope ?? "";
  const scopes = rawScope
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const missingScopes = ACCEPTED_SCOPE_GROUPS
    .map((group) => group.some((scope) => scopes.includes(scope)))
    .map((ok, idx) => (ok ? null : `scope-group-${idx + 1}`))
    .filter(Boolean);

  // Do not block the whole dashboard for scope mismatches.
  // Scope issues can be handled at the feature/API level where needed.
  if (missingScopes.length > 0) {
    return NextResponse.json(
      {
        ok: true,
        data: {
          connected: true,
          scopeCount: scopes.length,
          missingScopes,
          warning: "Some Google permissions may be missing for specific features.",
        },
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    ok: true,
    data: {
      connected: true,
      scopeCount: scopes.length,
      missingScopes: [],
    },
  });
}

