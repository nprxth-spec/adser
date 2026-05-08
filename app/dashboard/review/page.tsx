"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle, XCircle, ExternalLink, Loader2, AlertTriangle,
  FileText, RefreshCw, Eye, Trash2, ScanSearch, X as XIcon,
  AlertCircle,
} from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

// ── Types ──────────────────────────────────────────────────────────────────────
interface PendingData {
  invoiceData: Record<string, any>;
  missingFields: string[];
  driveFileId: string;
  cardPrefix: string | null;
  sheetId: string;
  sheetName: string | null;
  sheetMapping: any;
}

interface ReviewItem {
  id: string;
  filename: string;
  originalFilename: string | null;
  invoiceDate: string | null;
  cardLast4: string | null;
  amount: number | null;
  currency: string | null;
  driveLink: string | null;
  pendingData: PendingData | null;
  createdAt: string;
}

const FIELD_LABELS: Record<string, { th: string; en: string }> = {
  card_prefix:      { th: "ชื่อบัตร",        en: "Card name" },
  date:             { th: "วันที่ใบเสร็จ",     en: "Invoice date" },
  reference_number: { th: "หมายเลขอ้างอิง",    en: "Reference no." },
  billed_to:        { th: "ใบเสร็จสำหรับ",     en: "Billed to" },
};

const FIELD_KEYS = ["card_prefix", "date", "reference_number", "billed_to"] as const;

// ── Dialog ─────────────────────────────────────────────────────────────────────
function ReviewDialog({
  item,
  onClose,
  onApprove,
  onRequestDeleteConfirm,
}: {
  item: ReviewItem;
  onClose: () => void;
  onApprove: (id: string, invoiceData: Record<string, any>, cardPrefix: string) => Promise<void>;
  onRequestDeleteConfirm: (item: ReviewItem) => void;
}) {
  const { t } = useAppPreferences();
  const pending = item.pendingData;
  const missingFields = pending?.missingFields ?? [];

  const [fields, setFields] = useState<Record<string, string>>(() => {
    const inv = pending?.invoiceData ?? {};
    return {
      card_prefix:      pending?.cardPrefix ?? "",
      date:             inv.date ?? "",
      reference_number: inv.reference_number ?? "",
      billed_to:        inv.billed_to ?? "",
    };
  });

  const [approving, setApproving] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [error, setError] = useState("");
  const [rescanNotice, setRescanNotice] = useState("");

  const paymentSucceeded = (pending?.invoiceData?.paymentSuccess ?? true) !== false;
  const requiredKeys = FIELD_KEYS.filter(k => k !== "reference_number" || paymentSucceeded);
  const allFilled = requiredKeys.every((k) => fields[k].trim() !== "");

  const preview = allFilled
    ? (paymentSucceeded && fields.reference_number.trim())
      ? `${fields.card_prefix} - ${fields.date} - ${fields.reference_number} (${fields.billed_to}).pdf`
      : `${fields.card_prefix} - ${fields.date} (${fields.billed_to}).pdf`
    : null;

  const handleRescan = async () => {
    setRescanning(true);
    setError("");
    setRescanNotice("");
    try {
      const res = await fetch(`/api/review/${item.id}/rescan`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Re-scan failed");
      const inv = data.data?.invoiceData ?? {};
      // cardPrefix resolved from user's CURRENT filenameMapping (may be newly added)
      const resolvedCardPrefix: string = data.data?.cardPrefix ?? "";
      const notices: string[] = [];
      setFields(prev => {
        const next = {
          card_prefix:      resolvedCardPrefix || prev.card_prefix,
          date:             inv.date              || prev.date,
          reference_number: inv.reference_number  || prev.reference_number,
          billed_to:        inv.billed_to         || prev.billed_to,
        };
        if (resolvedCardPrefix && !prev.card_prefix) {
          notices.push(t(`พบชื่อบัตร: ${resolvedCardPrefix}`, `Found card name: ${resolvedCardPrefix}`));
        }
        return next;
      });
      const baseNotice = t("สแกนซ้ำแล้ว — ตรวจสอบข้อมูลด้านล่าง", "Re-scanned — verify the fields below");
      setRescanNotice(notices.length > 0 ? `${baseNotice} · ${notices.join(", ")}` : baseNotice);
    } catch (e: any) {
      setError(e.message ?? "Re-scan failed");
    } finally {
      setRescanning(false);
    }
  };

  const handleApprove = async () => {
    setApproving(true);
    setError("");
    const { card_prefix, ...restFields } = fields;
    try {
      await onApprove(item.id, restFields, card_prefix);
      onClose();
    } catch (e: any) {
      setError(e.message ?? "Error");
    } finally {
      setApproving(false);
    }
  };

  const handleDiscardClick = () => {
    onRequestDeleteConfirm(item);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start gap-3 rounded-t-2xl z-10">
          <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 text-sm truncate">
              {item.originalFilename ?? item.filename}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-xs text-slate-400">
                {new Date(item.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
              </p>
              {item.driveLink && (
                <a
                  href={item.driveLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-teal-600 hover:underline"
                >
                  <ExternalLink className="w-3 h-3" />
                  {t("ดูไฟล์", "View file")}
                </a>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Missing field badges */}
          {missingFields.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-slate-500 mr-1">{t("ขาด:", "Missing:")}</span>
              {missingFields.map((f) => (
                <span
                  key={f}
                  className="text-[11px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5"
                >
                  {t(FIELD_LABELS[f]?.th ?? f, FIELD_LABELS[f]?.en ?? f)}
                </span>
              ))}
            </div>
          )}

          {/* Re-scan notice */}
          {rescanNotice && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
              {rescanNotice}
            </div>
          )}

          {/* Editable fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELD_KEYS.map((key) => {
              const isMissing = missingFields.includes(key);
              const labels = FIELD_LABELS[key];
              return (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    {t(labels.th, labels.en)}
                    {isMissing && <span className="ml-1 text-red-500">*</span>}
                  </label>
                  <input
                    type="text"
                    value={fields[key]}
                    onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={isMissing ? t("กรอกข้อมูล...", "Fill in...") : ""}
                    className={[
                      "w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent",
                      isMissing && !fields[key].trim() && (key !== "reference_number" || paymentSucceeded)
                        ? "border-red-300 bg-red-50"
                        : "border-slate-200 bg-white",
                    ].join(" ")}
                  />
                </div>
              );
            })}
          </div>

          {/* Filename preview */}
          {preview && (
            <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-2">
              <p className="text-[11px] font-medium text-teal-700 mb-0.5">
                {t("ตัวอย่างชื่อไฟล์", "Filename preview")}
              </p>
              <p className="font-mono text-xs text-teal-900 break-all">{preview}</p>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center gap-2 rounded-b-2xl">
          {/* Re-scan */}
          <button
            onClick={handleRescan}
            disabled={rescanning || approving}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {rescanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanSearch className="w-3.5 h-3.5" />}
            {t("สแกนซ้ำ", "Re-scan")}
          </button>

          <div className="flex-1" />

          {/* Discard */}
          <button
            onClick={handleDiscardClick}
            disabled={approving || rescanning}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            <XCircle className="w-3.5 h-3.5" />
            {t("ยกเลิก", "Discard")}
          </button>

          {/* Approve */}
          <button
            onClick={handleApprove}
            disabled={approving || rescanning || !allFilled}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl landing-accent-bg text-white text-xs font-medium hover:opacity-95 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
            {t("อนุมัติ", "Approve")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Table row ──────────────────────────────────────────────────────────────────
function ReviewRow({
  item,
  onReview,
  onRequestDelete,
  discarding,
}: {
  item: ReviewItem;
  onReview: (item: ReviewItem) => void;
  onRequestDelete: (item: ReviewItem) => void;
  discarding: boolean;
}) {
  const { t } = useAppPreferences();
  const pending = item.pendingData;
  const missingFields = pending?.missingFields ?? [];

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors group">
      {/* File */}
      <td className="py-3 pl-4 pr-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <FileText className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="min-w-0">
            <p
              className="text-sm font-medium text-slate-800 truncate w-full max-w-[min(55vw,36rem)]"
              title={item.originalFilename ?? item.filename}
            >
              {item.originalFilename ?? item.filename}
            </p>
            <p className="text-xs text-slate-400">
              {new Date(item.createdAt).toLocaleDateString("th-TH", { dateStyle: "medium" })}
            </p>
          </div>
        </div>
      </td>

      {/* Missing fields */}
      <td className="py-3 px-3 hidden sm:table-cell">
        <div className="flex flex-wrap gap-1">
          {missingFields.length > 0 ? missingFields.map((f) => (
            <span
              key={f}
              className="text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-1.5 py-0.5"
            >
              {t(FIELD_LABELS[f]?.th ?? f, FIELD_LABELS[f]?.en ?? f)}
            </span>
          )) : (
            <span className="text-[10px] text-slate-400">{t("ครบแล้ว", "Complete")}</span>
          )}
        </div>
      </td>

      {/* Amount */}
      <td className="py-3 px-3 hidden md:table-cell text-right">
        {item.amount != null ? (
          <span className="text-sm font-medium text-slate-700">
            {item.amount.toLocaleString()} {item.currency}
          </span>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>

      {/* Drive link */}
      <td className="py-3 px-3 hidden lg:table-cell">
        {item.driveLink ? (
          <a
            href={item.driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline"
          >
            <ExternalLink className="w-3 h-3" />
            Drive
          </a>
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>

      {/* Actions */}
      <td className="py-3 pl-3 pr-4 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => onReview(item)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg landing-accent-bg text-white text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer"
          >
            <Eye className="w-3 h-3" />
            {t("ตรวจสอบ", "Review")}
          </button>
          <button
            onClick={() => onRequestDelete(item)}
            disabled={discarding}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
          >
            {discarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            {t("ลบ", "Delete")}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ReviewPage() {
  const { t } = useAppPreferences();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReviewItem | null>(null);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<ReviewItem | null>(null);
  const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchItems = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch("/api/review");
      const data = await res.json();
      setItems(Array.isArray(data.data) ? data.data : []);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (!deleteConfirmItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !discardingId) setDeleteConfirmItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteConfirmItem, discardingId]);

  const requestDeleteConfirm = (item: ReviewItem) => {
    setDeleteError(null);
    setSelectedItem(null);
    setDeleteConfirmItem(item);
  };

  const handleApprove = async (
    id: string,
    invoiceData: Record<string, any>,
    cardPrefix: string,
  ) => {
    const res = await fetch(`/api/review/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoiceData, cardPrefix }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to approve");
    setItems((prev) => prev.filter((i) => i.id !== id));
    window.dispatchEvent(new Event("filesgo:review-update"));
  };

  const executeDelete = async (id: string) => {
    setDiscardingId(id);
    setDeleteWarnings([]);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/review/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t("ลบไม่สำเร็จ", "Failed to delete"));
      setItems((prev) => prev.filter((i) => i.id !== id));
      setDeleteConfirmItem(null);
      setSelectedItem(null);
      if (data.warnings?.length) setDeleteWarnings(data.warnings);
      window.dispatchEvent(new Event("filesgo:review-update"));
    } catch (e: any) {
      setDeleteError(e?.message ?? t("ลบรายการไม่สำเร็จ", "Failed to delete record"));
    } finally {
      setDiscardingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">

      {/* Page header */}
      <div className="mb-6 sm:mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
            {t("ต้องตรวจสอบ", "Needs Review")}
          </h1>
          <p className="text-slate-500 text-sm">
            {t(
              "ไฟล์ที่ข้อมูลไม่ครบ — กดตรวจสอบเพื่อกรอกข้อมูลและอนุมัติ",
              "Files with incomplete data — click Review to complete and approve."
            )}
          </p>
        </div>
        <button
          onClick={() => fetchItems(false)}
          disabled={refreshing || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {t("รีเฟรช", "Refresh")}
        </button>
      </div>

      {deleteWarnings.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800">
              {t("ลบจากฐานข้อมูลแล้ว แต่มีข้อควรระวัง:", "Deleted from database, but note:")}
            </p>
            {deleteWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-700 mt-0.5">{w}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setDeleteWarnings([])}
            className="text-amber-600 hover:text-amber-800 text-xs shrink-0 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">{t("กำลังโหลด...", "Loading...")}</span>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center">
            <CheckCircle className="w-7 h-7 text-emerald-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">
            {t("ไม่มีรายการที่ต้องตรวจสอบ", "No items need review")}
          </p>
          <p className="text-xs text-slate-400 text-center max-w-xs">
            {t(
              "ไฟล์ที่ข้อมูลไม่ครบจะปรากฏที่นี่เพื่อให้คุณกรอกข้อมูลและอนุมัติ",
              "Files with incomplete data will appear here for you to complete and approve."
            )}
          </p>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-sm text-slate-600">
              {t(
                `${items.length} รายการรอตรวจสอบ`,
                `${items.length} item${items.length !== 1 ? "s" : ""} awaiting review`
              )}
            </p>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 pl-4 pr-3">
                    {t("ไฟล์", "File")}
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden sm:table-cell">
                    {t("ข้อมูลที่ขาด", "Missing fields")}
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden md:table-cell">
                    {t("ยอด", "Amount")}
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden lg:table-cell">
                    {t("ไฟล์", "File link")}
                  </th>
                  <th className="py-3 pl-3 pr-4" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <ReviewRow
                    key={item.id}
                    item={item}
                    onReview={setSelectedItem}
                    onRequestDelete={requestDeleteConfirm}
                    discarding={discardingId === item.id}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={() => !discardingId && setDeleteConfirmItem(null)}
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
                  {t("ยืนยันการลบรายการ", "Delete this item?")}
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {t(
                    "ระบบจะลบรายการจากฐานข้อมูลและพยายามลบไฟล์บน Google Drive การกระทำนี้ไม่สามารถย้อนกลับได้",
                    "This removes the record from the database and tries to delete the file from Google Drive. This cannot be undone."
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => !discardingId && setDeleteConfirmItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                aria-label="Close"
              >
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="mx-5 sm:mx-6 mb-4 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                <span
                  className="text-xs font-medium text-slate-700 truncate"
                  title={deleteConfirmItem.originalFilename ?? deleteConfirmItem.filename}
                >
                  {deleteConfirmItem.originalFilename ?? deleteConfirmItem.filename}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                {deleteConfirmItem.invoiceDate && (
                  <span>
                    <span className="text-slate-400">{t("วันที่: ", "Date: ")}</span>
                    {deleteConfirmItem.invoiceDate}
                  </span>
                )}
                {deleteConfirmItem.cardLast4 && (
                  <span className="font-mono">
                    <span className="text-slate-400 font-sans">{t("บัตร: ", "Card: ")}</span>
                    •••• {deleteConfirmItem.cardLast4}
                  </span>
                )}
                {deleteConfirmItem.amount != null && (
                  <span>
                    <span className="text-slate-400">{t("ยอด: ", "Amount: ")}</span>
                    {deleteConfirmItem.currency ? `${deleteConfirmItem.currency} ` : ""}
                    {deleteConfirmItem.amount.toLocaleString()}
                  </span>
                )}
              </div>
            </div>

            {deleteError && (
              <div className="mx-5 sm:mx-6 mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {deleteError}
              </div>
            )}
              <button
                type="button"
                onClick={() => !discardingId && setDeleteConfirmItem(null)}
                disabled={!!discardingId}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
              >
                {t("ยกเลิก", "Cancel")}
              </button>
              <button
                type="button"
                onClick={() => void executeDelete(deleteConfirmItem.id)}
                disabled={!!discardingId}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer disabled:opacity-60"
              >
                {discardingId === deleteConfirmItem.id ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("กำลังลบ...", "Deleting...")}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t("ลบรายการ", "Delete")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review dialog */}
      {selectedItem && (
        <ReviewDialog
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onApprove={handleApprove}
          onRequestDeleteConfirm={requestDeleteConfirm}
        />
      )}
    </div>
  );
}
