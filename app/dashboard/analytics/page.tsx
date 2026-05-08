"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ChevronDown, CreditCard, Loader2, TrendingUp } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

type ByDayPoint = Record<string, string | number> & { date: string };
type ByMonthPoint = Record<string, string | number> & { month: string };
type ByCardPoint = { card: string; total: number };

type AnalyticsResponse = {
  cards: string[];
  byDay: ByDayPoint[];
  byMonth: ByMonthPoint[];
  last12Months: ByMonthPoint[];
  last12Cards: string[];
  byCard: ByCardPoint[];
  grandTotal: number;
  currency: string | null;
  txCount: number;
};

const PALETTE = [
  "#14b8a6",
  "#0ea5e9",
  "#8b5cf6",
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#6366f1",
  "#f97316",
  "#06b6d4",
  "#84cc16",
  "#ec4899",
  "#a855f7",
];

const RANGE_OPTIONS = [
  { value: "this_month", th: "เดือนนี้", en: "This month" },
  { value: "last_month", th: "เดือนที่แล้ว", en: "Last month" },
  { value: "this_year", th: "ปีนี้", en: "This year" },
  { value: "last_12_months", th: "12 เดือนล่าสุด", en: "Last 12 months" },
  { value: "all", th: "ทั้งหมด", en: "All time" },
];

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function cardLabel(card: string): string {
  if (!card || card === "—") return "—";
  return `•••• ${card}`;
}

export default function AnalyticsPage() {
  const { t, language } = useAppPreferences();
  const [range, setRange] = useState("this_year");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/analytics?range=${encodeURIComponent(range)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range]);

  const cardColor = useMemo(() => {
    const m = new Map<string, string>();
    // Build a stable color map across both range-bound cards and 12-month cards
    const allCards = Array.from(
      new Set([...(data?.cards ?? []), ...(data?.last12Cards ?? [])])
    );
    allCards.forEach((c, i) => m.set(c, PALETTE[i % PALETTE.length]));
    return m;
  }, [data?.cards, data?.last12Cards]);

  const donutData = useMemo(
    () =>
      (data?.byCard ?? []).map((c) => ({
        name: cardLabel(c.card),
        rawCard: c.card,
        value: c.total,
      })),
    [data?.byCard]
  );

  const grandTotal = data?.grandTotal ?? 0;
  const currency = data?.currency ?? "";
  const txCount = data?.txCount ?? 0;
  const cards = data?.cards ?? [];
  const topCard = data?.byCard[0];

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
            {t("วิเคราะห์การใช้จ่าย", "Spending Analytics")}
          </h1>
          <p className="text-slate-500 text-sm">
            {t(
              "กราฟแสดงการใช้จ่ายตามบัตร — คำนวณจากวันที่เรียกเก็บ",
              "Spending by card — based on invoice date"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="range" className="text-sm font-medium text-slate-600 shrink-0">
            {t("ช่วงเวลา:", "Range:")}
          </label>
          <div className="relative">
            <select
              id="range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer min-w-[160px]"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {language === "th" ? opt.th : opt.en}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile
          icon={TrendingUp}
          label={t("ยอดรวม", "Total spend")}
          value={`${currency ? `${currency} ` : ""}${formatAmount(grandTotal)}`}
          accent="teal"
        />
        <StatTile
          icon={BarChart3}
          label={t("จำนวนรายการ", "Transactions")}
          value={String(txCount)}
          accent="violet"
        />
        <StatTile
          icon={CreditCard}
          label={t("บัตรที่ใช้บ่อยที่สุด", "Most used card")}
          value={topCard ? cardLabel(topCard.card) : "—"}
          subValue={
            topCard
              ? `${currency ? `${currency} ` : ""}${formatAmount(topCard.total)}`
              : undefined
          }
          accent="amber"
        />
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
        </div>
      ) : !data || txCount === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center justify-center py-24 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <BarChart3 className="w-7 h-7 text-slate-400" />
          </div>
          <p className="font-semibold text-slate-700 mb-1">
            {t("ยังไม่มีข้อมูลในช่วงเวลานี้", "No data in this period")}
          </p>
          <p className="text-slate-400 text-sm">
            {t(
              "ลองเปลี่ยนช่วงเวลาหรืออัปโหลดใบแจ้งหนี้เพิ่มเติม",
              "Try another range or upload more invoices."
            )}
          </p>
        </div>
      ) : (
        <>
          {/* Daily chart */}
          <ChartCard
            title={t("ใช้จ่ายรายวัน (ตามบัตร)", "Daily spend (by card)")}
            subtitle={t(
              "แกน X = วันที่เรียกเก็บ · แต่ละสีแทนหนึ่งบัตร",
              "X-axis = invoice date · each color is one card"
            )}
          >
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byDay}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => String(v).slice(8)}
                    interval="preserveStartEnd"
                    minTickGap={8}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => Number(v).toLocaleString()}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      `${currency ? `${currency} ` : ""}${formatAmount(Number(value))}`,
                      cardLabel(String(name)),
                    ]}
                    labelFormatter={(value) => `${t("วันที่", "Date")}: ${value}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend formatter={(value) => cardLabel(String(value))} />
                  {cards.map((card) => (
                    <Bar
                      key={card}
                      dataKey={card}
                      stackId="spend"
                      fill={cardColor.get(card) ?? "#14b8a6"}
                      radius={[2, 2, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Monthly chart */}
          <ChartCard
            title={t("ใช้จ่ายรายเดือน (ตามบัตร)", "Monthly spend (by card)")}
            subtitle={t(
              "รวมยอดในแต่ละเดือนตามวันที่เรียกเก็บ",
              "Totals per calendar month based on invoice date"
            )}
          >
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.byMonth}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => String(v).slice(2)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => Number(v).toLocaleString()}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      `${currency ? `${currency} ` : ""}${formatAmount(Number(value))}`,
                      cardLabel(String(name)),
                    ]}
                    labelFormatter={(value) => `${t("เดือน", "Month")}: ${value}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend formatter={(value) => cardLabel(String(value))} />
                  {cards.map((card) => (
                    <Bar
                      key={card}
                      dataKey={card}
                      stackId="spend"
                      fill={cardColor.get(card) ?? "#14b8a6"}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Last 12 months — fixed window regardless of range filter */}
          <ChartCard
            title={t("แนวโน้ม 12 เดือนล่าสุด", "Last 12 months trend")}
            subtitle={t(
              "ภาพรวมการใช้จ่าย 12 เดือนล่าสุดของคุณ — ไม่ขึ้นกับช่วงเวลาที่เลือก",
              "Your spending across the last 12 calendar months — independent of the range filter above"
            )}
          >
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.last12Months}
                  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => String(v).slice(2)}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#475569" }}
                    tickFormatter={(v) => Number(v).toLocaleString()}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      `${currency ? `${currency} ` : ""}${formatAmount(Number(value))}`,
                      cardLabel(String(name)),
                    ]}
                    labelFormatter={(value) => `${t("เดือน", "Month")}: ${value}`}
                    contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  <Legend formatter={(value) => cardLabel(String(value))} />
                  {data.last12Cards.map((card) => (
                    <Bar
                      key={card}
                      dataKey={card}
                      stackId="spend"
                      fill={cardColor.get(card) ?? "#14b8a6"}
                      radius={[4, 4, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Donut + breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard
              title={t("สัดส่วนการใช้บัตร", "Card usage share")}
              subtitle={t("เปอร์เซ็นต์ของยอดรวมต่อบัตร", "Percentage of total spend per card")}
            >
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={110}
                      paddingAngle={2}
                    >
                      {donutData.map((entry) => (
                        <Cell
                          key={entry.rawCard}
                          fill={cardColor.get(entry.rawCard) ?? "#14b8a6"}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [
                        `${currency ? `${currency} ` : ""}${formatAmount(Number(value))}`,
                        String(name),
                      ]}
                      contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title={t("รายละเอียดต่อบัตร", "Per-card breakdown")}
              subtitle={t("เรียงจากใช้มากไปน้อย", "Ranked from highest to lowest")}
            >
              <ul className="divide-y divide-slate-100">
                {data.byCard.map((c) => {
                  const pct = grandTotal > 0 ? (c.total / grandTotal) * 100 : 0;
                  const color = cardColor.get(c.card) ?? "#14b8a6";
                  return (
                    <li key={c.card} className="py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="text-sm font-medium text-slate-800 truncate font-mono">
                            {cardLabel(c.card)}
                          </span>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-slate-900">
                            {currency ? `${currency} ` : ""}
                            {formatAmount(c.total)}
                          </div>
                          <div className="text-xs text-slate-400">{pct.toFixed(1)}%</div>
                        </div>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: color }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  subValue,
  accent,
}: {
  icon: any;
  label: string;
  value: string;
  subValue?: string;
  accent: "teal" | "violet" | "amber";
}) {
  const accentCls =
    accent === "teal"
      ? "bg-teal-50 text-teal-600"
      : accent === "violet"
        ? "bg-violet-50 text-violet-600"
        : "bg-amber-50 text-amber-600";
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accentCls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-slate-500 truncate">{label}</p>
        <p className="text-base font-semibold text-slate-900 truncate font-mono">{value}</p>
        {subValue && <p className="text-xs text-slate-400 truncate">{subValue}</p>}
      </div>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h3 className="font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
