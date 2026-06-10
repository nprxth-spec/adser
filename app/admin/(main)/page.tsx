import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminDashboardFilters from "./AdminDashboardFilters";
import AdminDashboardChart from "./AdminDashboardChart";
import AdminDateRangeFilter from "./AdminDateRangeFilter";

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

type DateRangePreset = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "this_year";

function getDateRange(range: DateRangePreset): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  let from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (range) {
    case "today":
      break;
    case "yesterday": {
      from.setDate(from.getDate() - 1);
      to.setTime(from.getTime());
      to.setHours(23, 59, 59, 999);
      break;
    }
    case "this_week": {
      const day = from.getDay();
      const monday = day === 0 ? -6 : 1 - day;
      from.setDate(from.getDate() + monday);
      break;
    }
    case "this_month":
      from.setDate(1);
      break;
    case "last_month": {
      from.setMonth(from.getMonth() - 1);
      from.setDate(1);
      to.setTime(from.getTime());
      to.setMonth(to.getMonth() + 1);
      to.setDate(0);
      to.setHours(23, 59, 59, 999);
      break;
    }
    case "this_year":
      from.setMonth(0, 1);
      break;
    default:
      return { from: new Date(0), to: new Date(8640000000000000) };
  }
  return { from, to };
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string; interval?: string; range?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const selectedUserId = params.userId ?? "";
  const interval = params.interval === "month" ? "month" : "day";
  const range = (params.range ?? "all") as DateRangePreset | "all";
  const fromParam = params.from;
  const toParam = params.to;

  const logWhere: any = selectedUserId ? { userId: selectedUserId } : {};
  const fromDate = fromParam ? new Date(`${fromParam}T00:00:00`) : null;
  const toDate = toParam ? new Date(`${toParam}T23:59:59.999`) : null;
  const hasCustomRange =
    !!fromDate &&
    !!toDate &&
    !Number.isNaN(fromDate.getTime()) &&
    !Number.isNaN(toDate.getTime());

  const validPresets: DateRangePreset[] = [
    "today",
    "yesterday",
    "this_week",
    "this_month",
    "last_month",
    "this_year",
  ];
  if (hasCustomRange) {
    logWhere.createdAt = { gte: fromDate, lte: toDate };
  } else if (range && range !== "all" && validPresets.includes(range)) {
    const { from, to } = getDateRange(range);
    logWhere.createdAt = { gte: from, lte: to };
  }

  const [userCount, logCount, usersWithLogs, groupedStats, timeSeriesSource] = await Promise.all([
    prisma.user.count(),
    prisma.processingLog.count({ where: logWhere }),
    prisma.user.findMany({
      where: { logs: { some: {} } },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
    }),
    prisma.processingLog.groupBy({
      by: ["userId"],
      _count: { _all: true },
      _sum: { amount: true },
      where: logWhere,
    }),
    prisma.processingLog.findMany({
      where: logWhere,
      select: { createdAt: true, amount: true, userId: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const usersById = new Map(usersWithLogs.map((u) => [u.id, u]));
  const statsRows = groupedStats
    .map((row) => {
      const user = usersById.get(row.userId);
      return {
        userId: row.userId,
        userLabel: user?.email ?? user?.name ?? row.userId,
        userName: user?.name ?? "—",
        uploadCount: row._count._all,
        totalAmount: row._sum.amount ?? 0,
      };
    })
    .sort((a, b) => b.uploadCount - a.uploadCount);

  const totalAmount = statsRows.reduce((sum, row) => sum + row.totalAmount, 0);

  const chartUsers = statsRows.map((row) => ({
    userId: row.userId,
    label: row.userName !== "—" ? row.userName : row.userLabel,
  }));
  const chartUserIdSet = new Set(chartUsers.map((u) => u.userId));
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const timeSeriesMap = new Map<string, Record<string, string | number>>();
  for (const row of timeSeriesSource) {
    if (!chartUserIdSet.has(row.userId)) continue;
    const date = new Date(row.createdAt);
    if (interval === "month" && (date.getMonth() !== currentMonth || date.getFullYear() !== currentYear)) {
      continue;
    }
    const key =
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
      ).padStart(2, "0")}`;

    const countKey = `count_${row.userId}`;
    const amountKey = `amount_${row.userId}`;
    const prev = timeSeriesMap.get(key);
    if (prev) {
      prev[countKey] = Number(prev[countKey] ?? 0) + 1;
      prev[amountKey] = Number(prev[amountKey] ?? 0) + (row.amount ?? 0);
    } else {
      const next: Record<string, string | number> = { label: key };
      for (const user of chartUsers) {
        next[`count_${user.userId}`] = 0;
        next[`amount_${user.userId}`] = 0;
      }
      next[countKey] = 1;
      next[amountKey] = row.amount ?? 0;
      timeSeriesMap.set(key, next);
    }
  }

  const chartData = Array.from(timeSeriesMap.values()).sort((a, b) =>
    String(a.label).localeCompare(String(b.label))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex flex-wrap items-center gap-3">
          <AdminDateRangeFilter currentFrom={fromParam} currentTo={toParam} />
          <AdminDashboardFilters
            users={usersWithLogs.map((u) => ({ id: u.id, label: u.email ?? u.name ?? u.id }))}
            currentUserId={selectedUserId || undefined}
            currentInterval={interval}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link
          href="/admin/logs"
          className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300"
        >
          <p className="text-2xl font-bold text-gray-900">{logCount}</p>
          <p className="text-sm text-gray-500">Uploads ({selectedUserId ? "selected user" : "all users"})</p>
        </Link>
        <Link
          href="/admin/users"
          className="block p-4 bg-white rounded-lg border border-gray-200 hover:border-gray-300"
        >
          <p className="text-2xl font-bold text-gray-900">{userCount}</p>
          <p className="text-sm text-gray-500">Users</p>
        </Link>
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-2xl font-bold text-gray-900">{formatAmount(totalAmount)}</p>
          <p className="text-sm text-gray-500">Total bill amount</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Per-user uploads and amount</h2>
          <span className="text-xs text-gray-500">{statsRows.length} users</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">#</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">User</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Uploads</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600 whitespace-nowrap">Total amount</th>
              </tr>
            </thead>
            <tbody>
              {statsRows.map((row, i) => (
                <tr key={row.userId} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{i + 1}</td>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{row.userLabel}</td>
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{row.userName}</td>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{row.uploadCount}</td>
                  <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{formatAmount(row.totalAmount)}</td>
                </tr>
              ))}
              {statsRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                    No upload data for this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            Trend by {interval === "month" ? "day (current month)" : "day"}
          </h2>
          <p className="text-xs text-gray-500">{chartData.length} points</p>
        </div>
        <AdminDashboardChart data={chartData} interval={interval} users={chartUsers} />
      </div>
    </div>
  );
}
