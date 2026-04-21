"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  Calendar,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

interface LogEntry {
  id: string;
  filename: string;
  invoiceDate: string | null;
  cardLast4: string | null;
  amount: number | null;
  currency: string | null;
  driveLink: string | null;
  status: string;
  createdAt: string;
}

const RANGE_OPTIONS: { value: string; label: string; labelTh: string }[] = [
  { value: "all", label: "All time", labelTh: "ทั้งหมด" },
  { value: "today", label: "Today", labelTh: "วันนี้" },
  { value: "yesterday", label: "Yesterday", labelTh: "เมื่อวาน" },
  { value: "this_week", label: "This week", labelTh: "สัปดาห์นี้" },
  { value: "this_month", label: "This month", labelTh: "เดือนนี้" },
  { value: "last_month", label: "Last month", labelTh: "เดือนที่แล้ว" },
  { value: "this_year", label: "This year", labelTh: "ปีนี้" },
];

export default function HistoryPage() {
  const { t } = useAppPreferences();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [range, setRange] = useState("all");
  const limit = 20;

  // Delete state
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
  const [deleteSuccess, setDeleteSuccess] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (range && range !== "all") params.set("range", range);
      const res = await fetch(`/api/history?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setLoading(false);
    };
    fetchLogs();
  }, [page, range]);

  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setConfirmId(null);
    setDeleteWarnings([]);
    setDeleteSuccess("");
    try {
      const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("ลบไม่สำเร็จ", "Failed to delete"));
      // Remove from local state
      setLogs((prev) => prev.filter((l) => l.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (data.warnings?.length) setDeleteWarnings(data.warnings);
      setDeleteSuccess("ลบรายการสำเร็จ");
    } catch (err: any) {
      alert(err.message ?? t("ลบรายการไม่สำเร็จ", "Failed to delete record"));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "All time";
  const rangeLabelTh = RANGE_OPTIONS.find((o) => o.value === range)?.labelTh ?? "ทั้งหมด";

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">{t("ประวัติใบแจ้งหนี้", "Invoice History")}</h1>
          <p className="text-slate-500">
            {t(`${total} รายการในช่วงเวลานี้`, `${total} invoice${total !== 1 ? "s" : ""} in this period`)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <label htmlFor="range" className="text-sm font-medium text-slate-600 shrink-0">
            {t("วันที่ประมวลผล:", "Date (processed):")}
          </label>
          <div className="relative">
            <select
              id="range"
              value={range}
              onChange={(e) => {
                setRange(e.target.value);
                setPage(1);
              }}
              className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 cursor-pointer min-w-[140px]"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelTh, opt.label)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Delete warnings banner */}
      {deleteWarnings.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800">{t("ลบข้อมูลจากฐานข้อมูลแล้ว แต่บางรายการบนคลาวด์ลบไม่สำเร็จ:", "Record deleted from database, but some cloud deletions had issues:")}</p>
            {deleteWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 mt-0.5">{w}</p>
            ))}
          </div>
          <button onClick={() => setDeleteWarnings([])} className="text-amber-600 hover:text-amber-800 text-xs shrink-0 cursor-pointer">✕</button>
        </div>
      )}
      {deleteSuccess && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <span className="text-sm font-medium text-green-800">{deleteSuccess}</span>
          <button
            onClick={() => setDeleteSuccess("")}
            className="ml-auto text-green-700 hover:text-green-900 text-xs shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700 mb-1">{t("ไม่มีใบแจ้งหนี้ในช่วงเวลานี้", "No invoices in this period")}</p>
            <p className="text-slate-400 text-sm">
              {t("ลองเปลี่ยนช่วงวันที่หรืออัปโหลดใบแจ้งหนี้", "Try another date range or upload an invoice.")}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm table-auto">
              <colgroup>
                <col style={{ width: "70px" }} />
                <col style={{ width: "170px" }} />
                <col style={{ width: "32%" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "110px" }} />
                <col style={{ width: "130px" }} />
                <col style={{ width: "100px" }} />
                <col style={{ width: "90px" }} />
                <col style={{ width: "120px" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  {[t("#", "#"), t("วันที่ประมวลผล", "Processed date"), t("ชื่อไฟล์", "Filename"), t("วันที่เรียกเก็บ", "Invoice Date"), t("บัตร", "Card"), t("จำนวนเงิน", "Amount"), t("สถานะ", "Status"), t("ไฟล์", "File"), t("การทำงาน", "Action")].map(
                    (h) => (
                      <th
                        key={h}
                        className="text-left px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    } ${deletingIds.has(log.id) ? "opacity-40" : ""}`}
                  >
                    {/* # */}
                    <td className="px-5 py-2.5 text-slate-400 text-xs font-mono whitespace-nowrap">
                      {(page - 1) * limit + i + 1}
                    </td>

                    <td className="px-5 py-2.5 text-slate-600 whitespace-nowrap text-xs">
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-teal-50 flex items-center justify-center shrink-0">
                          <FileText className="w-3 h-3 text-teal-500" />
                        </div>
                        <span
                          className="font-medium text-slate-800 block max-w-[420px] truncate text-xs"
                          title={log.filename}
                        >
                          {log.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 text-xs">
                      {log.invoiceDate ?? (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-600 font-mono text-xs">
                      {log.cardLast4 ? (
                        log.cardLast4
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-slate-800 font-semibold text-xs">
                      {log.amount != null ? (
                        <>
                          <span className="text-slate-400 font-normal text-xs mr-1">
                            {log.currency}
                          </span>
                          {log.amount.toLocaleString()}
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          log.status === "success"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {log.status === "error" && (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-5 py-2.5">
                      {log.driveLink ? (
                        <a
                          href={log.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-teal-600 hover:text-teal-800 font-medium transition-colors text-xs"
                        >
                          {t("เปิด", "View")} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Action — delete */}
                    <td className="px-5 py-2.5">
                      {confirmId === log.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleDelete(log.id)}
                            disabled={deletingIds.has(log.id)}
                            className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                          >
                            {deletingIds.has(log.id) ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                {t("กำลังลบ...", "Deleting...")}
                              </>
                            ) : (
                              t("ยืนยัน", "Confirm")
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmId(null)}
                            className="px-2 py-0.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 cursor-pointer"
                          >
                            {t("ยกเลิก", "Cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmId(log.id)}
                          disabled={deletingIds.has(log.id)}
                          title={t("ลบรายการ ไฟล์ใน Drive และแถวใน Sheets", "Delete record, Drive file, and Sheets row")}
                          className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          {deletingIds.has(log.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
      </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && !loading && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              {t(`หน้า ${page} จาก ${totalPages}`, `Page ${page} of ${totalPages}`)}
              {range !== "all" && ` · ${t(rangeLabelTh, rangeLabel)}`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
