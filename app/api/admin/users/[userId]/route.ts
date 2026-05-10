import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

const MAX_MAPPING_RULES = 1000;

const VALID_SHEET_KEYS = new Set([
  "date", "billed_to", "card_last_4", "amount", "amountFailed",
  "currency", "filename", "driveLink", "reference",
]);

function sanitizeSheetMapping(input: unknown):
  | { ok: true; value: Record<string, string> | null }
  | { ok: false; error: string } {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "sheetMapping must be an object" };
  }
  const cleaned: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    if (!VALID_SHEET_KEYS.has(rawKey)) continue;
    const val = String(rawVal ?? "").trim().toUpperCase();
    if (val !== "" && !/^[A-Z]$/.test(val)) {
      return { ok: false, error: `Invalid column "${rawVal}" for key "${rawKey}" — must be A-Z or empty` };
    }
    cleaned[rawKey] = val;
  }
  return { ok: true, value: cleaned };
}

function sanitizeFilenameMapping(input: unknown):
  | { ok: true; value: Record<string, string> | null }
  | { ok: false; error: string } {
  if (input === null) return { ok: true, value: null };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "filenameMapping must be an object" };
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_MAPPING_RULES) {
    return { ok: false, error: `Too many mapping rules (max ${MAX_MAPPING_RULES})` };
  }
  const cleaned: Record<string, string> = {};
  for (const [rawKey, rawVal] of entries) {
    const key = String(rawKey).trim().slice(0, 10);
    const val = String(rawVal ?? "").trim().slice(0, 100);
    if (!key || !val) continue;
    if (!/^\d+$/.test(key)) {
      return { ok: false, error: `Invalid key "${rawKey}" — must be digits only` };
    }
    cleaned[key] = val;
  }
  return { ok: true, value: cleaned };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if ("filenameMapping" in body) {
    const result = sanitizeFilenameMapping(body.filenameMapping);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    data.filenameMapping = result.value;
  }

  if ("sheetMapping" in body) {
    const result = sanitizeSheetMapping(body.sheetMapping);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    data.sheetMapping = result.value;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No supported fields provided" }, { status: 400 });
  }

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, filenameMapping: true, sheetMapping: true },
    });
    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Admin patch user error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to update user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE user and all related data (Account, Session, ProcessingLog via DB cascade).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;

  try {
    await prisma.user.delete({
      where: { id: userId },
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error("Admin delete user error:", err);
    return NextResponse.json(
      { error: err?.message ?? "Failed to delete user" },
      { status: 500 }
    );
  }
}
