import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import LogsRangeSelect from "./LogsRangeSelect";
import { UserFilterClient } from "./UserFilterClient";
import { LogRowActionsClient } from "./LogRowActionsClient";
import { LogsSearchClient } from "./LogsSearchClient";
import { LogsPageSizeSelect } from "./LogsPageSizeSelect";

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500] as const;
const DEFAULT_PAGE_SIZE = 50;

function parsePageSize(v: string | undefined): number {
  const n = parseInt(v ?? "", 10);
  return PAGE_SIZE_OPTIONS.includes(n as any) ? n : DEFAULT_PAGE_SIZE;
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

function buildQuery(opts: { page?: number; range?: string; userId?: string; q?: string; limit?: number }): string {
  const q = new URLSearchParams();
  if (opts.page && opts.page > 1) q.set("page", String(opts.page));
  if (opts.range && opts.range !== "all") q.set("range", opts.range);
  if (opts.userId) q.set("userId", opts.userId);
  if (opts.q) q.set("q", opts.q);
  if (opts.limit != null && opts.limit !== DEFAULT_PAGE_SIZE) q.set("limit", String(opts.limit));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export default async function AdminLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; range?: string; userId?: string; q?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = parsePageSize(params.limit);
  const range = (params.range ?? "all") as DateRangePreset | "all";
  const userId = params.userId ?? "";
  const query = (params.q ?? "").trim();
  const skip = (page - 1) * pageSize;

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
      { filename: { contains: query, mode: "insensitive" } },
      { originalFilename: { contains: query, mode: "insensitive" } },
      { driveLink: { contains: query, mode: "insensitive" } },
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

  const [logs, total, usersForFilter] = await Promise.all([
    prisma.processingLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip,
      include: {
        user: { select: { id: true, email: true, name: true } },
      },
    }),
    prisma.processingLog.count({ where }),
    prisma.user.findMany({
      where: { logs: { some: {} } },
      select: { id: true, email: true, name: true },
      orderBy: { email: "asc" },
    }),
  ]);

  const totalPages = Math.ceil(total / pageSize) || 1;
  const rangeLabel =
    (range === "all" ? "All time" : range === "today" ? "Today" : range === "yesterday" ? "Yesterday" : range === "this_week" ? "This week" : range === "this_month" ? "This month" : range === "last_month" ? "Last month" : range === "this_year" ? "This year" : "All time");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-slate-900">ประมวลผลใบแจ้งหนี้</h1>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <LogsRangeSelect
                basePath="/admin/logs"
                currentRange={range}
                dateLabel="Date (processed):"
              />
              <UserFilterClient
                users={usersForFilter.map((u) => ({
                  id: u.id,
                  label: u.email ?? u.name ?? u.id,
                }))}
                currentUserId={userId || undefined}
                basePath="/admin/logs"
                currentRange={range}
              />
            </div>
          </div>
          <LogsSearchClient basePath="/admin/logs" />
        </div>
      </div>

      <p className="text-sm text-slate-500">{total} รายการในระยะนี้</p>

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-2 font-medium text-slate-600 w-12 whitespace-nowrap">#</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Processed</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">User</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Filename</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Status</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Invoice Date</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Amount</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Drive</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 text-slate-500 tabular-nums whitespace-nowrap">
                    {(page - 1) * pageSize + i + 1}
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString(undefined, {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className="text-slate-700">{log.user?.email ?? log.userId}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {log.user?.name ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-slate-700 whitespace-nowrap" title={log.filename}>
                    {log.filename}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span
                      className={
                        log.status === "success"
                          ? "text-emerald-600 font-medium"
                          : "text-amber-600"
                      }
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{log.invoiceDate ?? "—"}</td>
                  <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                    {log.amount != null ? `${log.amount} ${log.currency ?? ""}` : "—"}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    {log.driveLink ? (
                      <a
                        href={log.driveLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-600 hover:underline"
                      >
                        Link
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <LogRowActionsClient
                      logId={log.id}
                      invoiceDate={log.invoiceDate}
                      cardLast4={log.cardLast4}
                      amount={log.amount}
                      currency={log.currency}
                      filename={log.filename}
                      driveLink={log.driveLink}
                      sheetRow={log.sheetRow}
                      status={log.status}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            Page {page} of {totalPages}
            {totalPages <= 1 && total > 0 && ` · ${total} items`}
            {totalPages > 1 && ` · ${total} items`}
            {range !== "all" && ` · ${rangeLabel}`}
          </p>
          <div className="flex items-center gap-4">
            <LogsPageSizeSelect basePath="/admin/logs" currentLimit={pageSize} />
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/logs${buildQuery({ page: page - 1, range, userId: userId || undefined, q: query || undefined, limit: pageSize })}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/logs${buildQuery({ page: page + 1, range, userId: userId || undefined, q: query || undefined, limit: pageSize })}`}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
