"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  AlertCircle,
  BarChart2,
  ChevronDown,
  CreditCard,
  FileText,
  TrendingUp,
} from "lucide-react";

type CardBreakdown = { card: string; total: number };
type MonthlyPoint = { month: string; monthKey: string; total: number; count: number };
type DayPoint = { date: string; total: number };

type AnalyticsResponse = {
  range: string;
  chartYear: number;
  availableYears: number[];
  totalSpendByCurrency: Record<string, number>;
  invoiceCount: number;
  cardsUsed: number;
  cardBreakdown: CardBreakdown[];
  byDay: DayPoint[];
  monthlyData: MonthlyPoint[];
  userId: string | null;
};

type UserOption = { id: string; label: string };

const RANGE_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
  { value: "all", label: "All time" },
];

const CARD_COLORS = [
  "#465fff",
  "#0d9488",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#10b981",
  "#f97316",
  "#3b82f6",
  "#06b6d4",
  "#84cc16",
];

function fmtMoney(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

function cardLabel(card: string): string {
  if (!card || card === "—") return "—";
  return `•••• ${card}`;
}

type TooltipPayload = {
  name?: string;
  value: number;
  payload: { count?: number; fill?: string; pct?: number };
};
type TooltipProps = { active?: boolean; payload?: TooltipPayload[]; label?: string };

function CustomBarTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700 mb-1">{label}</p>
      <p className="text-teal-600 font-bold tabular-nums">{fmtMoney(item.value)}</p>
      {(item.payload.count ?? 0) > 0 && (
        <p className="text-slate-400 text-xs">{item.payload.count} invoices</p>
      )}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: TooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  return (
    <div className="bg-white border border-slate-200 rounded-md shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-700">{cardLabel(String(item.name ?? ""))}</p>
      <p className="font-bold tabular-nums" style={{ color: item.payload.fill }}>
        {fmtMoney(item.value)}
      </p>
      <p className="text-slate-400 text-xs">{item.payload.pct ?? 0}% of total</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-md border border-slate-100 shadow-sm p-5 flex gap-4 items-start">
      <div className={`w-11 h-11 rounded-md flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-none tabular-nums truncate">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function AdminAnalyticsClient({ users }: { users: UserOption[] }) {
  const [userId, setUserId] = useState<string>(""); // "" = all users
  const [range, setRange] = useState("this_month");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartYear, setChartYear] = useState<number>(new Date().getFullYear());
  const [chartLoading, setChartLoading] = useState(false);
  const isFirstChartFetch = useRef(true);
  const [chartMonthly, setChartMonthly] = useState<MonthlyPoint[]>([]);
  const [userQuery, setUserQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => u.label.toLowerCase().includes(q));
  }, [users, userQuery]);

  const buildUrl = (yearOnly = false) => {
    const params = new URLSearchParams({
      range,
      chartYear: String(chartYear),
    });
    if (userId) params.set("userId", userId);
    return `/api/admin/analytics?${params.toString()}`;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(buildUrl())
      .then((r) => r.json())
      .then((d: AnalyticsResponse) => {
        if (cancelled) return;
        setData(d);
        if (isFirstChartFetch.current) {
          setChartMonthly(d.monthlyData ?? []);
          isFirstChartFetch.current = false;
        } else {
          setChartMonthly(d.monthlyData ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, userId]);

  useEffect(() => {
    if (isFirstChartFetch.current) return;
    let cancelled = false;
    setChartLoading(true);
    fetch(buildUrl(true))
      .then((r) => r.json())
      .then((d: AnalyticsResponse) => {
        if (!cancelled) setChartMonthly(d.monthlyData ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChartLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartYear]);

  const currencyEntries = useMemo(
    () =>
      Object.entries(data?.totalSpendByCurrency ?? {}).sort((a, b) => b[1] - a[1]),
    [data?.totalSpendByCurrency]
  );
  const primary = currencyEntries[0];
  const others = currencyEntries.slice(1);

  const totalSpendDisplay = primary ? `${primary[0]} ${fmtMoney(primary[1])}` : "0.00";
  const avgPerInvoice =
    primary && (data?.invoiceCount ?? 0) > 0
      ? `${primary[0]} ${fmtMoney(primary[1] / (data?.invoiceCount ?? 1))}`
      : "0.00";

  const pieTotal = (data?.cardBreakdown ?? []).reduce((s, c) => s + c.total, 0);
  const pieData = (data?.cardBreakdown ?? []).map((c, i) => ({
    name: c.card,
    value: c.total,
    fill: CARD_COLORS[i % CARD_COLORS.length],
    pct: pieTotal > 0 ? Math.round((c.total / pieTotal) * 100) : 0,
  }));


  const yearOptions = useMemo(() => {
    const set = new Set<number>(data?.availableYears ?? []);
    set.add(new Date().getFullYear());
    set.add(chartYear);
    return Array.from(set).sort((a, b) => b - a);
  }, [data?.availableYears, chartYear]);

  const allMonthlyEmpty = chartMonthly.every((m) => m.total === 0);
  const selectedUserLabel =
    userId ? users.find((u) => u.id === userId)?.label ?? userId : "All users";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 mb-0.5">Spend Analytics</h1>
          <p className="text-sm text-slate-500">
            Spending summary across users · viewing: <span className="font-medium text-slate-700">{selectedUserLabel}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* User filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-500 shrink-0">User:</label>
            <input
              type="search"
              placeholder="Search users…"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              className="px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 w-36"
            />
            <div className="relative">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="appearance-none pl-3 pr-8 py-2 rounded-md border border-slate-200 bg-white text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer max-w-[260px]"
              >
                <option value="">All users ({users.length})</option>
                {filteredUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>
          {/* Range selector */}
          <div className="relative shrink-0">
            <select
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className="appearance-none pl-3 pr-8 py-2 rounded-md border border-slate-200 bg-white text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
            >
              {RANGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      <div
        className={`space-y-6 transition-opacity duration-200 ${
          loading && data ? "opacity-40 pointer-events-none" : "opacity-100"
        }`}
      >
        {/* Stat tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={TrendingUp}
            label="Total Spend"
            value={totalSpendDisplay}
            sub={
              others.length > 0
                ? others.map(([c, v]) => `${c} ${fmtMoney(v)}`).join(", ")
                : undefined
            }
            color="bg-teal-50 text-teal-600"
          />
          <StatCard
            icon={FileText}
            label="Total Invoices"
            value={(data?.invoiceCount ?? 0).toLocaleString()}
            sub="in this period"
            color="bg-sky-50 text-sky-600"
          />
          <StatCard
            icon={CreditCard}
            label="Cards Used"
            value={String(data?.cardsUsed ?? 0)}
            sub="unique cards"
            color="bg-violet-50 text-violet-600"
          />
          <StatCard
            icon={AlertCircle}
            label="Avg per Invoice"
            value={avgPerInvoice}
            sub="average per invoice"
            color="bg-amber-50 text-amber-600"
          />
        </div>

        {/* Monthly + Donut row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-md border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="font-semibold text-slate-800">Monthly Spend</p>
              <div className="relative shrink-0">
                <select
                  value={chartYear}
                  onChange={(e) => setChartYear(Number(e.target.value))}
                  className="appearance-none pl-3 pr-7 py-1 rounded border border-slate-200 bg-white text-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div
              className={`transition-opacity duration-200 ${
                chartLoading ? "opacity-40 pointer-events-none" : "opacity-100"
              }`}
            >
              {allMonthlyEmpty ? (
                <div className="flex flex-col items-center justify-center h-[260px] gap-2 text-center">
                  <BarChart2 className="w-8 h-8 text-slate-300" />
                  <p className="text-sm text-slate-400">No spend data for {chartYear}</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartMonthly} barSize={22} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(Number(v))} />
                    <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="total" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="bg-white rounded-md border border-slate-100 shadow-sm p-5">
            <p className="font-semibold text-slate-800 mb-4">Spend by Card</p>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-[260px] text-slate-400 text-sm">No card data</div>
            ) : (
              <ResponsiveContainer width="100%" height={pieData.length > 6 ? 220 : 260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  {pieData.length <= 6 && (
                    <Legend formatter={(value) => cardLabel(String(value))} wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                  )}
                </PieChart>
              </ResponsiveContainer>
            )}
            {pieData.length > 6 && (
              <p className="text-xs text-slate-400 text-center mt-1">Hover slices to see card details</p>
            )}
          </div>
        </div>

        {/* Daily chart + per-card breakdown row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-md border border-slate-100 shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="font-semibold text-slate-800">Daily Spend</p>
              <span className="text-xs text-slate-400">Within selected range</span>
            </div>
            {(data?.byDay ?? []).every((d) => d.total === 0) ? (
              <div className="flex flex-col items-center justify-center h-[260px] gap-2 text-center">
                <BarChart2 className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-400">No data in this period</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={data?.byDay ?? []} barSize={14} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => String(v).slice(8)} interval="preserveStartEnd" minTickGap={6} />
                  <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmtCompact(Number(v))} />
                  <Tooltip content={<CustomBarTooltip />} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="total" fill="#465fff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="bg-white rounded-md border border-slate-100 shadow-sm p-5">
            <p className="font-semibold text-slate-800 mb-4">Per-card Breakdown</p>
            {pieData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm">No card data</div>
            ) : (
              <ul className="divide-y divide-slate-100 max-h-[340px] overflow-y-auto pr-1">
                {pieData.map((c) => (
                  <li key={c.name} className="py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.fill }} />
                        <span className="text-sm font-medium text-slate-800 truncate font-mono">{cardLabel(c.name)}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-semibold text-slate-900 tabular-nums">{fmtMoney(c.value)}</div>
                        <div className="text-xs text-slate-400">{c.pct}%</div>
                      </div>
                    </div>
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.fill }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
