import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import LogsRangeSelect from "../logs/LogsRangeSelect";
import { LogsSearchClient } from "../logs/LogsSearchClient";
import { UserFilterClient } from "../logs/UserFilterClient";

const PAGE_SIZE = 50;

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

function buildQuery(opts: { page?: number; range?: string; userId?: string; q?: string }): string {
  const q = new URLSearchParams();
  if (opts.page && opts.page > 1) q.set("page", String(opts.page));
  if (opts.range && opts.range !== "all") q.set("range", opts.range);
  if (opts.userId) q.set("userId", opts.userId);
  if (opts.q) q.set("q", opts.q);
  const s = q.toString();
  return s ? `?${s}` : "";
}

const AUDIT_TYPE_LABELS: Record<string, string> = {
  login: "ล็อกอิน",
  config_drive: "Drive",
  config_sheet: "Google Sheet",
  config_naming: "กฎชื่อไฟล์",
  config_plan: "แพลน",
};

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; range?: string; userId?: string; q?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const range = (params.range ?? "all") as DateRangePreset | "all";
  const userId = params.userId ?? "";
  const query = (params.q ?? "").trim();
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = {};
  const validPresets: DateRangePreset[] = [
    "today",
    "yesterday",
    "this_week",
    "this_month",
    "last_month",
    "this_year",
  ];
  if (range && range !== "all" && validPresets.includes(range)) {
    const { from, to } = getDateRange(range);
    where.createdAt = { gte: from, lte: to };
  }

  if (userId) {
    where.userId = userId;
  }

  if (query) {
    where.OR = [
      { type: { contains: query, mode: "insensitive" } },
      { description: { contains: query, mode: "insensitive" } },
      { ip: { contains: query, mode: "insensitive" } },
      {
        user: {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { name: { contains: query, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const rangeLabel =
    range === "all" ? "All time" : range === "today" ? "Today" : range === "yesterday" ? "Yesterday" : range === "this_week" ? "This week" : range === "this_month" ? "This month" : range === "last_month" ? "Last month" : range === "this_year" ? "This year" : "All time";

  const [auditLogs, auditTotal, usersForFilter] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.user.findMany({
      where: { auditLogs: { some: {} } },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
    }),
  ]);
  const auditTotalPages = Math.ceil(auditTotal / PAGE_SIZE) || 1;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-xl font-bold text-gray-900">การล็อกอิน / แก้ไข config</h1>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <LogsRangeSelect basePath="/admin/audit-logs" currentRange={range} dateLabel="Date:" />
            <UserFilterClient
              users={usersForFilter.map((u) => ({
                id: u.id,
                label: u.email ?? u.name ?? u.id,
              }))}
              currentUserId={userId || undefined}
              basePath="/admin/audit-logs"
              currentRange={range}
              showDeleteButton={false}
            />
          </div>
        </div>
        <LogsSearchClient
          basePath="/admin/audit-logs"
          placeholder="Search by user, type, description, or IP"
        />
      </div>

      <p className="text-sm text-gray-500">{auditTotal} รายการในระยะนี้</p>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-2 font-medium text-gray-600">เวลา</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">User</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">IP</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">ประเภท</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">รายละเอียด</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-gray-600 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 text-gray-700">
                    {log.user?.email ?? log.userId}
                  </td>
                  <td className="px-4 py-2 text-gray-600 font-mono text-xs">
                    {(log as { ip?: string | null }).ip ??
                      (log.metadata as { ip?: string } | null)?.ip ??
                      "—"}
                  </td>
                  <td className="px-4 py-2">
                    <span className="font-medium text-gray-700">
                      {AUDIT_TYPE_LABELS[log.type] ?? log.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600 max-w-[320px] truncate" title={log.description ?? undefined}>
                    {log.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {auditTotalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {page} of {auditTotalPages}
              {range !== "all" && ` · ${rangeLabel}`}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/audit-logs${buildQuery({ page: page - 1, range, userId: userId || undefined, q: query || undefined })}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Link>
              )}
              {page < auditTotalPages && (
                <Link
                  href={`/admin/audit-logs${buildQuery({ page: page + 1, range, userId: userId || undefined, q: query || undefined })}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-gray-200 text-gray-700 hover:bg-gray-50 text-sm"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
