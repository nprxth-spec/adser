"use client";

import { useEffect, useRef, useState } from "react";
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
  Pencil,
  Save,
  X,
  CheckCircle2,
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

type EditDraft = {
  invoiceDate: string;
  cardLast4: string;
  amount: string;
  currency: string;
};

const RANGE_OPTIONS: { value: string; label: string; labelTh: string }[] = [
  { value: "all", label: "All time", labelTh: "ทั้งหมด" },
  { value: "today", label: "Today", labelTh: "วันนี้" },
  { value: "yesterday", label: "Yesterday", labelTh: "เมื่อวาน" },
  { value: "this_week", label: "This week", labelTh: "สัปดาห์นี้" },
  { value: "this_month", label: "This month", labelTh: "เดือนนี้" },
  { value: "last_month", label: "Last month", labelTh: "เดือนที่แล้ว" },
  { value: "this_year", label: "This year", labelTh: "ปีนี้" },
];

function toDraft(log: LogEntry): EditDraft {
  return {
    invoiceDate: log.invoiceDate ?? "",
    cardLast4: log.cardLast4 ?? "",
    amount: log.amount != null ? String(log.amount) : "",
    currency: log.currency ?? "",
  };
}

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
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [confirmLog, setConfirmLog] = useState<LogEntry | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);

  // Serialize delete requests so the backend never receives concurrent
  // DELETEs that would race on Google Sheets row indices and end up deleting
  // the wrong row.
  const deleteQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Edit dialog state
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);

  // Toast
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(id);
  }, [toast]);

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

  // Close edit dialog on Escape
  useEffect(() => {
    if (!editingLog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) closeEdit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingLog, saving]);

  // Close delete-confirm dialog on Escape
  useEffect(() => {
    if (!confirmLog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmLog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmLog]);

  const enqueueDelete = (log: LogEntry) => {
    const id = log.id;
    setQueuedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setDeleteWarnings([]);

    const run = async () => {
      // Move from "queued" to "processing"
      setQueuedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      try {
        const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? t("ลบไม่สำเร็จ", "Failed to delete"));
        setLogs((prev) => prev.filter((l) => l.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
        if (data.warnings?.length) {
          setDeleteWarnings((prev) => [...prev, ...data.warnings]);
          setToast({
            kind: "success",
            text: t("ลบ DB แล้ว แต่ Sheet/Drive มีปัญหา", "Deleted from DB; Sheet/Drive had issues"),
          });
        } else {
          setToast({ kind: "success", text: t("ลบรายการสำเร็จ", "Record deleted") });
        }
      } catch (err: any) {
        setToast({
          kind: "error",
          text: err?.message ?? t("ลบรายการไม่สำเร็จ", "Failed to delete record"),
        });
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    };

    // Chain on the queue so each delete waits for the previous one to finish.
    deleteQueueRef.current = deleteQueueRef.current.then(run, run);
  };

  const openEdit = (log: LogEntry) => {
    setEditingLog(log);
    setDraft(toDraft(log));
    setSaveError(null);
    setSaveWarnings([]);
  };

  const closeEdit = () => {
    setEditingLog(null);
    setDraft(null);
    setSaveError(null);
    setSaveWarnings([]);
  };

  const handleSave = async () => {
    if (!draft || !editingLog) return;
    const original = editingLog;

    const payload: Record<string, unknown> = {};
    const trim = (s: string) => s.trim();

    const dt = trim(draft.invoiceDate);
    if (dt !== (original.invoiceDate ?? "")) payload.invoiceDate = dt === "" ? null : dt;

    const card = draft.cardLast4.replace(/[^0-9]/g, "").slice(-4);
    if (card !== (original.cardLast4 ?? "")) payload.cardLast4 = card === "" ? null : card;

    const amtStr = trim(draft.amount).replace(/,/g, "");
    const amtNum = amtStr === "" ? null : Number(amtStr);
    if (amtStr !== "" && !Number.isFinite(amtNum)) {
      setSaveError(t("จำนวนเงินไม่ถูกต้อง", "Invalid amount"));
      return;
    }
    if ((amtNum ?? null) !== (original.amount ?? null)) payload.amount = amtNum;

    const cur = trim(draft.currency).toUpperCase();
    if (cur !== (original.currency ?? "")) payload.currency = cur === "" ? null : cur;

    if (Object.keys(payload).length === 0) {
      closeEdit();
      return;
    }

    setSaving(true);
    setSaveError(null);
    setSaveWarnings([]);
    try {
      const res = await fetch(`/api/history/${original.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("บันทึกไม่สำเร็จ", "Failed to save"));
      const updated = data.log as LogEntry | undefined;
      if (updated) {
        setLogs((prev) => prev.map((l) => (l.id === original.id ? { ...l, ...updated } : l)));
      }
      if (data.warnings?.length) {
        setSaveWarnings(data.warnings);
        setToast({
          kind: "success",
          text: t("บันทึก DB แล้ว แต่ Sheet มีปัญหา", "Saved to DB. Sheet had issues."),
        });
        setSaving(false);
        return; // keep dialog open so warnings are visible
      }
      setToast({
        kind: "success",
        text: t("บันทึกสำเร็จ ทั้ง DB และ Google Sheet", "Saved to both DB and Google Sheet"),
      });
      closeEdit();
    } catch (err: any) {
      setSaveError(err?.message ?? t("บันทึกไม่สำเร็จ", "Failed to save"));
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;
  const rangeLabel = RANGE_OPTIONS.find((o) => o.value === range)?.label ?? "All time";
  const rangeLabelTh = RANGE_OPTIONS.find((o) => o.value === range)?.labelTh ?? "ทั้งหมด";

  return (
    <div className="max-w-7xl mx-auto w-full min-w-0">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
            {t("ประวัติใบแจ้งหนี้", "Invoice History")}
          </h1>
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

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-2.5 ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span className="text-sm font-medium flex-1">{toast.text}</span>
          <button
            onClick={() => setToast(null)}
            className="text-current/70 hover:text-current text-xs shrink-0 cursor-pointer"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Delete warnings banner */}
      {deleteWarnings.length > 0 && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800">
              {t("ลบข้อมูลจากฐานข้อมูลแล้ว แต่บางรายการบนคลาวด์ลบไม่สำเร็จ:", "Record deleted from database, but some cloud deletions had issues:")}
            </p>
            {deleteWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 mt-0.5">{w}</p>
            ))}
          </div>
          <button
            onClick={() => setDeleteWarnings([])}
            className="text-amber-600 hover:text-amber-800 text-xs shrink-0 cursor-pointer"
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
          <div className="scrollbar-thin">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "44px" }} />
                <col style={{ width: "118px" }} />
                {/* filename — takes the remaining space */}
                <col />
                <col style={{ width: "108px" }} />
                <col style={{ width: "72px" }} />
                <col style={{ width: "112px" }} />
                <col style={{ width: "84px" }} />
                <col style={{ width: "62px" }} />
                <col style={{ width: "76px" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-100">
                  {[
                    t("#", "#"),
                    t("วันที่ประมวลผล", "Processed"),
                    t("ชื่อไฟล์", "Filename"),
                    t("วันที่เรียกเก็บ", "Invoice"),
                    t("บัตร", "Card"),
                    t("จำนวนเงิน", "Amount"),
                    t("สถานะ", "Status"),
                    t("ไฟล์", "File"),
                    t("การทำงาน", "Action"),
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap truncate"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                      i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                    } ${deletingIds.has(log.id) ? "opacity-40" : queuedIds.has(log.id) ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2.5 text-slate-400 text-xs font-mono whitespace-nowrap truncate">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td
                      className="px-3 py-2.5 text-slate-600 whitespace-nowrap text-xs truncate"
                      title={new Date(log.createdAt).toLocaleString()}
                    >
                      {new Date(log.createdAt).toLocaleString(undefined, {
                        month: "2-digit",
                        day: "2-digit",
                        year: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-md bg-teal-50 flex items-center justify-center shrink-0">
                          <FileText className="w-3 h-3 text-teal-500" />
                        </div>
                        <span
                          className="font-medium text-slate-800 truncate text-xs min-w-0"
                          title={log.filename}
                        >
                          {log.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 text-xs truncate">
                      {log.invoiceDate ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 font-mono text-xs truncate">
                      {log.cardLast4 ? log.cardLast4 : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-800 font-semibold text-xs truncate">
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
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium ${
                          log.status === "success"
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-600"
                        }`}
                      >
                        {log.status === "error" && <AlertCircle className="w-3 h-3" />}
                        {log.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {log.driveLink ? (
                        <a
                          href={log.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("เปิดใน Drive", "Open in Drive")}
                          className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-800 font-medium transition-colors text-xs"
                        >
                          {t("เปิด", "View")} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Action: edit + delete */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => openEdit(log)}
                          disabled={deletingIds.has(log.id) || queuedIds.has(log.id)}
                          title={t("แก้ไขรายการนี้", "Edit this record")}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setConfirmLog(log)}
                          disabled={deletingIds.has(log.id) || queuedIds.has(log.id)}
                          title={t(
                            "ลบรายการ ไฟล์ใน Drive และแถวใน Sheets",
                            "Delete record, Drive file, and Sheets row"
                          )}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                        >
                          {deletingIds.has(log.id) || queuedIds.has(log.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </div>
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

      {/* ── Delete Confirmation Dialog ──────────────────────────────────────── */}
      {confirmLog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={() => setConfirmLog(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-900">
                  {t("ยืนยันการลบรายการ", "Delete this record?")}
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t(
                    "ระบบจะลบไฟล์ใน Google Drive และแถวที่ตรงกันใน Google Sheet ของคุณ การลบนี้ไม่สามารถย้อนกลับได้",
                    "We will remove the file from Google Drive and the matching row in your Google Sheet. This cannot be undone."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmLog(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mx-5 sm:mx-6 mb-4 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span
                  className="text-xs font-medium text-slate-700 truncate"
                  title={confirmLog.filename}
                >
                  {confirmLog.filename}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                {confirmLog.invoiceDate && (
                  <span>
                    <span className="text-slate-400">{t("วันที่: ", "Date: ")}</span>
                    {confirmLog.invoiceDate}
                  </span>
                )}
                {confirmLog.cardLast4 && (
                  <span className="font-mono">
                    <span className="text-slate-400 font-sans">{t("บัตร: ", "Card: ")}</span>
                    •••• {confirmLog.cardLast4}
                  </span>
                )}
                {confirmLog.amount != null && (
                  <span>
                    <span className="text-slate-400">{t("ยอด: ", "Amount: ")}</span>
                    {confirmLog.currency ? `${confirmLog.currency} ` : ""}
                    {confirmLog.amount.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 sm:px-6 pb-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLog(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                {t("ยกเลิก", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  enqueueDelete(confirmLog);
                  setConfirmLog(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {t("ลบรายการ", "Delete record")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Dialog ─────────────────────────────────────────────────────── */}
      {editingLog && draft && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={() => {
            if (!saving) closeEdit();
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                <Pencil className="w-4 h-4 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-900">
                  {t("แก้ไขรายการ", "Edit record")}
                </h2>
                <p
                  className="text-xs text-slate-500 truncate mt-0.5"
                  title={editingLog.filename}
                >
                  {editingLog.filename}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleSave();
              }}
              className="px-5 sm:px-6 py-5 space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <DialogField
                  label={t("วันที่เรียกเก็บ", "Invoice date")}
                  placeholder="YYYY-MM-DD"
                  value={draft.invoiceDate}
                  onChange={(v) => setDraft({ ...draft, invoiceDate: v })}
                />
                <DialogField
                  label={t("บัตร (4 หลักท้าย)", "Card (last 4)")}
                  placeholder="1234"
                  value={draft.cardLast4}
                  onChange={(v) =>
                    setDraft({ ...draft, cardLast4: v.replace(/[^0-9]/g, "").slice(0, 4) })
                  }
                  mono
                  inputMode="numeric"
                  maxLength={4}
                />
                <DialogField
                  label={t("จำนวนเงิน", "Amount")}
                  placeholder="0.00"
                  value={draft.amount}
                  onChange={(v) => setDraft({ ...draft, amount: v })}
                  inputMode="decimal"
                />
                <DialogField
                  label={t("สกุลเงิน", "Currency")}
                  placeholder="THB"
                  value={draft.currency}
                  onChange={(v) =>
                    setDraft({ ...draft, currency: v.toUpperCase().slice(0, 8) })
                  }
                  mono
                  maxLength={8}
                />
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t(
                  "กดบันทึกแล้วระบบจะอัปเดตทั้งฐานข้อมูลและแถวที่ตรงกันใน Google Sheet ของคุณ",
                  "Saving updates both the database and the matching row in your Google Sheet."
                )}
              </p>

              {saveError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 flex-1">{saveError}</p>
                </div>
              )}

              {saveWarnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-800">
                      {t("บันทึก DB แล้ว แต่ Sheet มีปัญหา:", "Saved to DB, but Sheet had issues:")}
                    </p>
                    {saveWarnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 mt-0.5">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
                >
                  {t("ยกเลิก", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl landing-accent-bg text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t("กำลังบันทึก...", "Saving...")}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t("บันทึก", "Save")}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function DialogField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  inputMode,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  inputMode?: "text" | "decimal" | "numeric";
  maxLength?: number;
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
