import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type RangePreset = "this_month" | "last_month" | "this_year" | "last_12_months" | "all";

function getInvoiceDateRange(range: RangePreset): { from: string | null; to: string | null } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();

  switch (range) {
    case "this_month": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmt(from), to: fmt(to) };
    }
    case "last_month": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: fmt(from), to: fmt(to) };
    }
    case "this_year": {
      const from = new Date(now.getFullYear(), 0, 1);
      const to = new Date(now.getFullYear(), 11, 31);
      return { from: fmt(from), to: fmt(to) };
    }
    case "last_12_months": {
      const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { from: fmt(from), to: fmt(to) };
    }
    default:
      return { from: null, to: null };
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") ?? "this_year") as RangePreset;
  const { from, to } = getInvoiceDateRange(range);

  const logs = await prisma.processingLog.findMany({
    where: {
      userId: session.user.id,
      status: "success",
      amount: { not: null },
      invoiceDate: { not: null },
    },
    select: {
      invoiceDate: true,
      cardLast4: true,
      amount: true,
      currency: true,
    },
  });

  // Filter by string-date range and validity (YYYY-MM-DD)
  const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
  const filtered = logs.filter((l) => {
    if (!l.invoiceDate || !isValidDate(l.invoiceDate)) return false;
    if (from && l.invoiceDate < from) return false;
    if (to && l.invoiceDate > to) return false;
    return true;
  });

  // Aggregations
  const cardSet = new Set<string>();
  const byDayMap = new Map<string, Map<string, number>>(); // date -> card -> amount
  const byMonthMap = new Map<string, Map<string, number>>(); // YYYY-MM -> card -> amount
  const byCardTotal = new Map<string, number>(); // card -> total
  const currencySet = new Set<string>();

  for (const log of filtered) {
    if (log.amount == null || !log.invoiceDate) continue;
    const card = log.cardLast4 || "—";
    cardSet.add(card);
    if (log.currency) currencySet.add(log.currency);

    const day = log.invoiceDate;
    const month = day.slice(0, 7);

    const dayCards = byDayMap.get(day) ?? new Map<string, number>();
    dayCards.set(card, (dayCards.get(card) ?? 0) + log.amount);
    byDayMap.set(day, dayCards);

    const monthCards = byMonthMap.get(month) ?? new Map<string, number>();
    monthCards.set(card, (monthCards.get(card) ?? 0) + log.amount);
    byMonthMap.set(month, monthCards);

    byCardTotal.set(card, (byCardTotal.get(card) ?? 0) + log.amount);
  }

  const cards = Array.from(cardSet).sort();
  const byDay = Array.from(byDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cardMap]) => {
      const point: Record<string, string | number> = { date };
      for (const card of cards) point[card] = cardMap.get(card) ?? 0;
      return point;
    });
  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cardMap]) => {
      const point: Record<string, string | number> = { month };
      for (const card of cards) point[card] = cardMap.get(card) ?? 0;
      return point;
    });
  const byCard = Array.from(byCardTotal.entries())
    .map(([card, total]) => ({ card, total }))
    .sort((a, b) => b.total - a.total);

  const grandTotal = byCard.reduce((sum, c) => sum + c.total, 0);
  const currency = currencySet.size === 1 ? Array.from(currencySet)[0] : null;

  return NextResponse.json({
    cards,
    byDay,
    byMonth,
    byCard,
    grandTotal,
    currency,
    txCount: filtered.length,
    range,
  });
}
