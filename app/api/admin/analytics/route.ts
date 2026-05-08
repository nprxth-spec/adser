import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

type RangePreset =
  | "today"
  | "yesterday"
  | "this_week"
  | "this_month"
  | "last_month"
  | "this_year"
  | "all";

function getInvoiceDateRange(range: RangePreset): { from: string | null; to: string | null } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const now = new Date();

  switch (range) {
    case "today": {
      const today = fmt(now);
      return { from: today, to: today };
    }
    case "yesterday": {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const ystr = fmt(y);
      return { from: ystr, to: ystr };
    }
    case "this_week": {
      const day = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - day);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      return { from: fmt(start), to: fmt(end) };
    }
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
    default:
      return { from: null, to: null };
  }
}

const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function enumerateDays(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  const pad = (n: number) => String(n).padStart(2, "0");
  while (cur.getTime() <= end.getTime()) {
    out.push(`${cur.getUTCFullYear()}-${pad(cur.getUTCMonth() + 1)}-${pad(cur.getUTCDate())}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export async function GET(request: Request) {
  const ok = await isAdminAuthenticated();
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const range = (searchParams.get("range") ?? "this_month") as RangePreset;
  const userIdFilter = (searchParams.get("userId") ?? "").trim();
  const chartYearParam = parseInt(searchParams.get("chartYear") ?? "", 10);
  const chartYear = Number.isFinite(chartYearParam) && chartYearParam > 1970
    ? chartYearParam
    : new Date().getFullYear();

  const { from, to } = getInvoiceDateRange(range);

  const logs = await prisma.processingLog.findMany({
    where: {
      ...(userIdFilter ? { userId: userIdFilter } : {}),
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

  const inRange = logs.filter((l) => {
    if (!l.invoiceDate || !isValidDate(l.invoiceDate)) return false;
    if (from && l.invoiceDate < from) return false;
    if (to && l.invoiceDate > to) return false;
    return true;
  });

  const totalSpendByCurrency: Record<string, number> = {};
  const cardSpend: Record<string, number> = {};
  const cardSet = new Set<string>();
  const byDayMap = new Map<string, number>();

  for (const log of inRange) {
    if (log.amount == null || !log.invoiceDate) continue;
    const cur = log.currency ?? "USD";
    totalSpendByCurrency[cur] = (totalSpendByCurrency[cur] ?? 0) + log.amount;
    const card = log.cardLast4 || "—";
    cardSet.add(card);
    cardSpend[card] = (cardSpend[card] ?? 0) + log.amount;
    byDayMap.set(log.invoiceDate, (byDayMap.get(log.invoiceDate) ?? 0) + log.amount);
  }

  const invoiceCount = inRange.length;
  const cardsUsed = Array.from(cardSet).filter((c) => c !== "—").length;

  const cardBreakdown = Object.entries(cardSpend)
    .map(([card, total]) => ({ card, total }))
    .sort((a, b) => b.total - a.total);

  const dayKeys =
    from && to
      ? enumerateDays(from, to)
      : Array.from(byDayMap.keys()).sort((a, b) => a.localeCompare(b));
  const byDay = dayKeys.map((date) => ({ date, total: byDayMap.get(date) ?? 0 }));

  const monthSkeleton: { month: string; monthKey: string; total: number; count: number }[] = [];
  for (let m = 0; m < 12; m++) {
    monthSkeleton.push({
      month: MONTH_LABELS[m],
      monthKey: `${chartYear}-${String(m + 1).padStart(2, "0")}`,
      total: 0,
      count: 0,
    });
  }
  for (const log of logs) {
    if (log.amount == null || !log.invoiceDate || !isValidDate(log.invoiceDate)) continue;
    const monthKey = log.invoiceDate.slice(0, 7);
    const slot = monthSkeleton.find((s) => s.monthKey === monthKey);
    if (slot) {
      slot.total += log.amount;
      slot.count += 1;
    }
  }

  const yearSet = new Set<number>();
  for (const log of logs) {
    if (log.invoiceDate && isValidDate(log.invoiceDate)) {
      yearSet.add(parseInt(log.invoiceDate.slice(0, 4), 10));
    }
  }
  yearSet.add(new Date().getFullYear());
  const availableYears = Array.from(yearSet).sort((a, b) => b - a);

  return NextResponse.json({
    range,
    chartYear,
    availableYears,
    totalSpendByCurrency,
    invoiceCount,
    cardsUsed,
    cardBreakdown,
    byDay,
    monthlyData: monthSkeleton,
    userId: userIdFilter || null,
  });
}
