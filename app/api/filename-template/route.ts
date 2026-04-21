import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientIp } from "@/lib/audit-log";

const VALID_KEYS = [
  "card_prefix", "original_filename", "billed_to", "date",
  "amount", "currency", "payment_method", "invoice_number", "reference_number",
  "transaction_id", "account_id",
];

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { filenameTemplate: true },
  });
  return NextResponse.json({ data: user?.filenameTemplate ?? null });
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

  const template = body.template;
  if (!Array.isArray(template)) {
    return NextResponse.json({ error: "template must be an array" }, { status: 400 });
  }

  const MAX_ITEMS = 50;
  if (template.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Too many items (max ${MAX_ITEMS})` }, { status: 400 });
  }

  const sanitized = template
    .filter((item: any) => item && typeof item === "object")
    .map((item: any) => {
      if (item.type === "field" && VALID_KEYS.includes(String(item.key ?? ""))) {
        return { type: "field", key: String(item.key), id: String(item.id ?? "").slice(0, 32) };
      }
      if (item.type === "literal" && typeof item.value === "string") {
        return { type: "literal", value: String(item.value).slice(0, 50), id: String(item.id ?? "").slice(0, 32) };
      }
      return null;
    })
    .filter(Boolean);

  await prisma.user.update({
    where: { id: session.user.id },
    data: { filenameTemplate: sanitized },
  });

  await createAuditLog(
    session.user.id,
    "config_naming",
    "Edit filename template",
    { itemCount: sanitized.length },
    getClientIp(request)
  );

  return NextResponse.json({ success: true });
}
