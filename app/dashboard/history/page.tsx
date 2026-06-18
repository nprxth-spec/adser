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
  const [limit, setLimit] = useState(50);

  // Delete state
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [confirmLog, setConfirmLog] = useState<LogEntry | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);

  // Serialize delete requests so the backend never receives concurrent
  // DELETEs that would race on Google Sheets row indices and end up deleting
  // the wrong row.
  const deleteQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Selection states
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const handleSelectAll = () => {
    if (selectedIds.size === logs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map((l) => l.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    const idsArray = Array.from(selectedIds);
    if (idsArray.length === 0) return;

    const confirmMsg = t(
      `คุณต้องการลบข้อมูล ${idsArray.length} รายการที่เลือกนี้ออกจากฐานข้อมูล, Google Drive และ Google Sheets (ลบแถว) หรือไม่?`,
      `Are you sure you want to delete the ${idsArray.length} selected records from the database, Google Drive, and Google Sheets (row deletion)?`
    );
    if (!window.confirm(confirmMsg)) return;

    setBulkDeleting(true);
    setSelectedIds(new Set()); // clear selection immediately

    let successCount = 0;
    let failCount = 0;
    const warnings: string[] = [];

    // Run sequentially to avoid Google Sheets API rate limits and row shifting index race conditions
    for (let i = 0; i < idsArray.length; i++) {
      const id = idsArray[i];
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      try {
        const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to delete");
        
        setLogs((prev) => prev.filter((l) => l.id !== id));
        setTotal((prev) => Math.max(0, prev - 1));
        if (data.warnings?.length) {
          warnings.push(...data.warnings);
        }
        successCount++;
      } catch (err: any) {
        console.error(`Failed to delete record ${id}:`, err);
        failCount++;
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    }

    setBulkDeleting(false);

    if (failCount === 0) {
      if (warnings.length > 0) {
        setToast({
          kind: "success",
          text: t(
            `ลบสำเร็จทั้งหมด ${successCount} รายการ แต่บางไฟล์ใน Sheet/Drive มีปัญหา`,
            `Successfully deleted all ${successCount} records; some Drive/Sheet files had warnings`
          ),
        });
      } else {
        setToast({
          kind: "success",
          text: t(`ลบข้อมูลสำเร็จทั้งหมด ${successCount} รายการ`, `Successfully deleted all ${successCount} records`),
        });
      }
    } else {
      setToast({
        kind: "error",
        text: t(
          `ลบสำเร็จ ${successCount} รายการ และล้มเหลว ${failCount} รายการ`,
          `Successfully deleted ${successCount} records, failed to delete ${failCount} records`
        ),
      });
    }
  };

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
      setSelectedIds(new Set()); // Reset selection when parameters change
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (range && range !== "all") params.set("range", range);
      const res = await fetch(`/api/history?${params}`);
      const data = await res.json();
      setLogs(data.logs ?? []);
      setTotal(data.total ?? 0);
      setLoading(false);
    };
    fetchLogs();
  }, [page, limit, range]);

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">
              {t("รายการใบแจ้งหนี้", "Invoice List")}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              {t(`${total} รายการในช่วงเวลานี้`, `${total} invoice${total !== 1 ? "s" : ""} in this period`)}
            </p>
          </div>
          {selectedIds.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              disabled={bulkDeleting}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors cursor-pointer w-fit"
            >
              {bulkDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              <span>
                {t(`ลบที่เลือก (${selectedIds.size})`, `Delete Selected (${selectedIds.size})`)}
              </span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400 dark:text-gray-550 shrink-0" />
          <label htmlFor="range" className="text-sm font-medium text-gray-600 dark:text-gray-350 shrink-0">
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
              className="appearance-none pl-3 pr-8 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 cursor-pointer min-w-[140px]"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {t(opt.labelTh, opt.label)}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-550 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 ${
            toast.kind === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-400"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-450"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 dark:text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-red-500 dark:text-red-400" />
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
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
              {t("ลบข้อมูลจากฐานข้อมูลแล้ว แต่บางรายการบนคลาวด์ลบไม่สำเร็จ:", "Record deleted from database, but some cloud deletions had issues:")}
            </p>
            {deleteWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">{w}</p>
            ))}
          </div>
          <button
            onClick={() => setDeleteWarnings([])}
            className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 text-xs shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-gray-400 dark:text-gray-550" />
            </div>
            <p className="font-semibold text-gray-700 dark:text-gray-300 mb-1">{t("ไม่มีใบแจ้งหนี้ในช่วงเวลานี้", "No invoices in this period")}</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm">
              {t("ลองเปลี่ยนช่วงวันที่หรืออัปโหลดใบแจ้งหนี้", "Try another date range or upload an invoice.")}
            </p>
          </div>
        ) : (
          <div className="scrollbar-thin">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col style={{ width: "36px" }} />
                <col style={{ width: "44px" }} />
                <col style={{ width: "118px" }} />
                <col />
                <col style={{ width: "108px" }} />
                <col style={{ width: "72px" }} />
                <col style={{ width: "112px" }} />
                <col style={{ width: "84px" }} />
                <col style={{ width: "62px" }} />
                <col style={{ width: "76px" }} />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <th className="px-3 py-3 text-left w-[36px]">
                    <input
                      type="checkbox"
                      checked={logs.length > 0 && selectedIds.size === logs.length}
                      onChange={handleSelectAll}
                      className="rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer accent-brand-500"
                    />
                  </th>
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
                      className="text-left px-3 py-3 text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap truncate"
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
                    className={`border-b border-gray-550 dark:border-gray-800/40 hover:bg-gray-50/50 dark:hover:bg-gray-850/30 transition-colors ${
                      i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/40"
                    } ${deletingIds.has(log.id) ? "opacity-40" : queuedIds.has(log.id) ? "opacity-60" : ""}`}
                  >
                    <td className="px-3 py-2.5 w-[36px]">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(log.id)}
                        onChange={() => handleSelectRow(log.id)}
                        className="rounded border-gray-300 dark:border-gray-700 text-brand-500 focus:ring-brand-500 w-3.5 h-3.5 cursor-pointer accent-brand-500"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 dark:text-gray-500 text-xs font-mono whitespace-nowrap truncate">
                      {(page - 1) * limit + i + 1}
                    </td>
                    <td
                      className="px-3 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap text-xs truncate"
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
                        <div className="w-6 h-6 rounded bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center shrink-0">
                          <FileText className="w-3 h-3 text-brand-500 dark:text-brand-400" />
                        </div>
                        <span
                          className="font-medium text-gray-800 dark:text-gray-200 truncate text-xs min-w-0"
                          title={log.filename}
                        >
                          {log.filename}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-350 text-xs truncate">
                      {log.invoiceDate ?? <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-650 dark:text-gray-350 font-mono text-xs truncate">
                      {log.cardLast4 ? log.cardLast4 : <span className="text-gray-300 dark:text-gray-600">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-800 dark:text-gray-200 font-semibold text-xs truncate">
                      {log.amount != null ? (
                        <>
                          <span className="text-gray-400 dark:text-gray-500 font-normal text-xs mr-1">
                            {log.currency}
                          </span>
                          {log.amount.toLocaleString()}
                        </>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
                          log.status === "success"
                            ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : log.status === "review"
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                            : "bg-red-50 text-red-655" 
                        }`}
                      >
                        {log.status === "error" && <AlertCircle className="w-3 h-3 text-red-500 dark:text-red-400" />}
                        {log.status === "success" ? t("สำเร็จ", "Success")
                          : log.status === "review" ? t("รอตรวจสอบ", "Review")
                          : t("ผิดพลาด", "Error")}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {log.driveLink ? (
                        <a
                          href={log.driveLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t("เปิดใน Drive", "Open in Drive")}
                          className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium transition-colors text-xs"
                        >
                          {t("เปิด", "View")} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>

                    {/* Action: edit + delete */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => openEdit(log)}
                          disabled={deletingIds.has(log.id) || queuedIds.has(log.id)}
                          title={t("แก้ไขรายการนี้", "Edit this record")}
                          className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/30 transition-colors disabled:opacity-40 cursor-pointer"
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
                          className="p-1.5 rounded-md text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-40 cursor-pointer"
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
        {!loading && logs.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-gray-800 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t(`หน้า ${page} จาก ${totalPages}`, `Page ${page} of ${totalPages}`)}
                {range !== "all" && ` · ${t(rangeLabelTh, rangeLabel)}`}
              </p>
              {/* Limit selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-400 dark:text-gray-500">{t("แสดง", "Show")}</span>
                <select
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="text-xs border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-305 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  {[50, 100, 200, 500].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 dark:text-gray-500">{t("แถว", "rows")}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer"
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 dark:bg-black/60 px-4"
          onClick={() => setConfirmLog(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-transparent dark:border-gray-800 w-full max-w-md mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 sm:px-6 pt-5 pb-3 flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 dark:bg-red-950/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t("ยืนยันการลบรายการ", "Delete this record?")}
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                  {t(
                    "ระบบจะลบไฟล์ใน Google Drive และแถวที่ตรงกันใน Google Sheet ของคุณ การลบนี้ไม่สามารถย้อนกลับได้",
                    "We will remove the file from Google Drive and the matching row in your Google Sheet. This cannot be undone."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmLog(null)}
                className="p-1 rounded-md text-gray-450 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mx-5 sm:mx-6 mb-4 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-950/40 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-gray-400 dark:text-gray-550 shrink-0" />
                <span
                  className="text-xs font-medium text-gray-700 dark:text-gray-350 truncate"
                  title={confirmLog.filename}
                >
                  {confirmLog.filename}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                {confirmLog.invoiceDate && (
                  <span>
                    <span className="text-gray-400 dark:text-gray-500">{t("วันที่: ", "Date: ")}</span>
                    {confirmLog.invoiceDate}
                  </span>
                )}
                {confirmLog.cardLast4 && (
                  <span className="font-mono">
                    <span className="text-gray-400 dark:text-gray-500 font-sans">{t("บัตร: ", "Card: ")}</span>
                    •••• {confirmLog.cardLast4}
                  </span>
                )}
                {confirmLog.amount != null && (
                  <span>
                    <span className="text-gray-400 dark:text-gray-500">{t("ยอด: ", "Amount: ")}</span>
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
                className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                {t("ยกเลิก", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  enqueueDelete(confirmLog);
                  setConfirmLog(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer"
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 dark:bg-black/60 px-4"
          onClick={() => {
            if (!saving) closeEdit();
          }}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-transparent dark:border-gray-800 w-full max-w-lg mx-4 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800 flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-brand-50 dark:bg-brand-950/20 flex items-center justify-center shrink-0">
                <Pencil className="w-4 h-4 text-brand-600 dark:text-brand-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                  {t("แก้ไขรายการ", "Edit record")}
                </h2>
                <p
                  className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5"
                  title={editingLog.filename}
                >
                  {editingLog.filename}
                </p>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={saving}
                className="p-1 rounded-md text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
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

              <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                {t(
                  "กดบันทึกแล้วระบบจะอัปเดตทั้งฐานข้อมูลและแถวที่ตรงกันใน Google Sheet ของคุณ",
                  "Saving updates both the database and the matching row in your Google Sheet."
                )}
              </p>

              {saveError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700 dark:text-red-450 flex-1">{saveError}</p>
                </div>
              )}

              {saveWarnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 px-3 py-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                      {t("บันทึก DB แล้ว แต่ Sheet มีปัญหา:", "Saved to DB, but Sheet had issues:")}
                    </p>
                    {saveWarnings.map((w, i) => (
                      <p key={i} className="text-xs text-amber-700 dark:text-amber-500 mt-0.5">{w}</p>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-650 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 cursor-pointer"
                >
                  {t("ยกเลิก", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg landing-accent-bg text-white text-sm font-semibold hover:opacity-95 disabled:opacity-60 cursor-pointer"
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
      <span className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
          mono ? "font-mono" : ""
        }`}
      />
    </label>
  );
}
