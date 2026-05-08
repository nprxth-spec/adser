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

  // Always-on 12-month window (independent of selected range)
  const last12 = getInvoiceDateRange("last_12_months");

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

  // Build the day-axis: for single-month ranges fill every day from 1..end-of-month
  // so the chart always renders the full calendar month, even if some days are empty.
  let dayKeys: string[];
  if ((range === "this_month" || range === "last_month") && from && to) {
    dayKeys = enumerateDays(from, to);
  } else {
    dayKeys = Array.from(byDayMap.keys()).sort((a, b) => a.localeCompare(b));
  }
  const byDay = dayKeys.map((date) => {
    const cardMap = byDayMap.get(date);
    const point: Record<string, string | number> = { date };
    for (const card of cards) point[card] = cardMap?.get(card) ?? 0;
    return point;
  });

  const byMonth = Array.from(byMonthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cardMap]) => {
      const point: Record<string, string | number> = { month };
      for (const card of cards) point[card] = cardMap.get(card) ?? 0;
      return point;
    });

  // Independent last-12-months series — always covers the same 12 calendar months
  // regardless of the selected range, with zero-fill for empty months.
  const last12CardSet = new Set<string>();
  const last12Map = new Map<string, Map<string, number>>();
  for (const log of logs) {
    if (log.amount == null || !log.invoiceDate || !isValidDate(log.invoiceDate)) continue;
    if (last12.from && log.invoiceDate < last12.from) continue;
    if (last12.to && log.invoiceDate > last12.to) continue;
    const card = log.cardLast4 || "—";
    last12CardSet.add(card);
    const month = log.invoiceDate.slice(0, 7);
    const m = last12Map.get(month) ?? new Map<string, number>();
    m.set(card, (m.get(card) ?? 0) + log.amount);
    last12Map.set(month, m);
  }
  const last12Cards = Array.from(last12CardSet).sort();
  const last12MonthKeys =
    last12.from && last12.to ? enumerateMonths(last12.from, last12.to) : [];
  const last12Months = last12MonthKeys.map((month) => {
    const cardMap = last12Map.get(month);
    const point: Record<string, string | number> = { month };
    for (const card of last12Cards) point[card] = cardMap?.get(card) ?? 0;
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
    last12Months,
    last12Cards,
    byCard,
    grandTotal,
    currency,
    txCount: filtered.length,
    range,
  });
}

function enumerateDays(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  const pad = (n: number) => String(n).padStart(2, "0");
  while (cur.getTime() <= end.getTime()) {
    out.push(
      `${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`
    );
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

function enumerateMonths(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const [fy, fm] = fromIso.split("-").map(Number);
  const [ty, tm] = toIso.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}
