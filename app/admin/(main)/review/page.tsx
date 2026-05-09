"use client";

import { useEffect, useState, useCallback } from "react";
import {
    CheckCircle, XCircle, ExternalLink, Loader2, AlertTriangle,
    FileText, RefreshCw, Eye, Trash2, X as XIcon, AlertCircle,
    User,
} from "lucide-react";

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

interface AdminReviewItem {
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
    userId: string;
    user: { email: string | null; name: string | null } | null;
}

const FIELD_LABELS: Record<string, string> = {
    card_prefix:      "Card name",
    date:             "Invoice date",
    reference_number: "Reference no.",
    billed_to:        "Billed to",
};

const FIELD_KEYS = ["card_prefix", "date", "reference_number", "billed_to"] as const;

// ── Review Dialog ──────────────────────────────────────────────────────────────
function ReviewDialog({
    item,
    onClose,
    onApprove,
    onRequestDeleteConfirm,
}: {
    item: AdminReviewItem;
    onClose: () => void;
    onApprove: (id: string, invoiceData: Record<string, any>, cardPrefix: string) => Promise<void>;
    onRequestDeleteConfirm: (item: AdminReviewItem) => void;
}) {
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
    const [error, setError] = useState("");

    const paymentSucceeded = (pending?.invoiceData?.paymentSuccess ?? true) !== false;
    const requiredKeys = FIELD_KEYS.filter((k) => k !== "reference_number" || paymentSucceeded);
    const allFilled = requiredKeys.every((k) => fields[k].trim() !== "");

    const preview = allFilled
        ? (paymentSucceeded && fields.reference_number.trim())
            ? `${fields.card_prefix} - ${fields.date} - ${fields.reference_number} (${fields.billed_to}).pdf`
            : `${fields.card_prefix} - ${fields.date} (${fields.billed_to}).pdf`
        : null;

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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-start gap-3 rounded-t-lg z-10">
                    <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                        <FileText className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm truncate">
                            {item.originalFilename ?? item.filename}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <p className="text-xs text-slate-400">
                                {new Date(item.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                            </p>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="inline-flex items-center gap-1 text-xs text-blue-600">
                                <User className="w-3 h-3" />
                                {item.user?.email ?? item.userId}
                            </span>
                            {item.driveLink && (
                                <a
                                    href={item.driveLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-xs text-teal-600 hover:underline"
                                >
                                    <ExternalLink className="w-3 h-3" />
                                    View file
                                </a>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Missing field badges */}
                    {missingFields.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            <span className="text-xs text-slate-500 mr-1">Missing:</span>
                            {missingFields.map((f) => (
                                <span key={f} className="text-[11px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">
                                    {FIELD_LABELS[f] ?? f}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Editable fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {FIELD_KEYS.map((key) => {
                            const isMissing = missingFields.includes(key);
                            return (
                                <div key={key}>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">
                                        {FIELD_LABELS[key]}
                                        {isMissing && <span className="ml-1 text-red-500">*</span>}
                                    </label>
                                    <input
                                        type="text"
                                        value={fields[key]}
                                        onChange={(e) => setFields((prev) => ({ ...prev, [key]: e.target.value }))}
                                        placeholder={isMissing ? "Fill in..." : ""}
                                        className={[
                                            "w-full px-3 py-2 rounded-md border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent",
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
                        <div className="rounded-md bg-teal-50 border border-teal-200 px-3 py-2">
                            <p className="text-[11px] font-medium text-teal-700 mb-0.5">Filename preview</p>
                            <p className="font-mono text-xs text-teal-900 break-all">{preview}</p>
                        </div>
                    )}

                    {error && (
                        <p className="text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex items-center gap-2 rounded-b-lg">
                    <div className="flex-1" />
                    <button
                        onClick={() => { onRequestDeleteConfirm(item); onClose(); }}
                        disabled={approving}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                        Discard
                    </button>
                    <button
                        onClick={handleApprove}
                        disabled={approving || !allFilled}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                        {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        Approve & Sync
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Table Row ──────────────────────────────────────────────────────────────────
function ReviewRow({
    item,
    onReview,
    onRequestDelete,
    discarding,
    selected,
    onToggleSelect,
}: {
    item: AdminReviewItem;
    onReview: (item: AdminReviewItem) => void;
    onRequestDelete: (item: AdminReviewItem) => void;
    discarding: boolean;
    selected: boolean;
    onToggleSelect: (id: string) => void;
}) {
    const pending = item.pendingData;
    const missingFields = pending?.missingFields ?? [];

    return (
        <tr className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors ${selected ? "bg-teal-50/40" : ""}`}>
            <td className="py-3 pl-4 pr-2 w-10">
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={() => onToggleSelect(item.id)}
                    className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
            </td>

            {/* User */}
            <td className="py-3 px-3 whitespace-nowrap hidden md:table-cell">
                <span className="inline-flex items-center gap-1 text-xs text-slate-600">
                    <User className="w-3 h-3 text-slate-400" />
                    {item.user?.email ?? item.userId}
                </span>
            </td>

            {/* File */}
            <td className="py-3 pr-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-md bg-amber-50 flex items-center justify-center shrink-0">
                        <FileText className="w-3.5 h-3.5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate max-w-[min(40vw,28rem)]" title={item.originalFilename ?? item.filename}>
                            {item.originalFilename ?? item.filename}
                        </p>
                        <p className="text-xs text-slate-400">
                            {new Date(item.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}
                        </p>
                    </div>
                </div>
            </td>

            {/* Missing fields */}
            <td className="py-3 px-3 hidden sm:table-cell">
                <div className="flex flex-wrap gap-1">
                    {missingFields.length > 0 ? missingFields.map((f) => (
                        <span key={f} className="text-[10px] font-medium bg-red-50 text-red-600 border border-red-200 rounded-full px-1.5 py-0.5">
                            {FIELD_LABELS[f] ?? f}
                        </span>
                    )) : (
                        <span className="text-[10px] text-slate-400">Complete</span>
                    )}
                </div>
            </td>

            {/* Amount */}
            <td className="py-3 px-3 hidden lg:table-cell text-right">
                {item.amount != null ? (
                    <span className="text-sm font-medium text-slate-700">
                        {item.amount.toLocaleString()} {item.currency}
                    </span>
                ) : (
                    <span className="text-xs text-slate-300">—</span>
                )}
            </td>

            {/* Drive link */}
            <td className="py-3 px-3 hidden xl:table-cell">
                {item.driveLink ? (
                    <a href={item.driveLink} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-teal-600 hover:underline">
                        <ExternalLink className="w-3 h-3" />Drive
                    </a>
                ) : <span className="text-xs text-slate-300">—</span>}
            </td>

            {/* Actions */}
            <td className="py-3 pl-3 pr-4 text-right">
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        onClick={() => onReview(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-opacity cursor-pointer"
                    >
                        <Eye className="w-3 h-3" />
                        Review
                    </button>
                    <button
                        onClick={() => onRequestDelete(item)}
                        disabled={discarding}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                        {discarding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function AdminReviewPage() {
    const [items, setItems] = useState<AdminReviewItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedItem, setSelectedItem] = useState<AdminReviewItem | null>(null);
    const [discardingId, setDiscardingId] = useState<string | null>(null);
    const [deleteConfirmItem, setDeleteConfirmItem] = useState<AdminReviewItem | null>(null);
    const [deleteWarnings, setDeleteWarnings] = useState<string[]>([]);
    const [deleteError, setDeleteError] = useState<string | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

    const fetchItems = useCallback(async (showSpinner = true) => {
        if (showSpinner) setLoading(true);
        else setRefreshing(true);
        try {
            const res = await fetch("/api/admin/review");
            const data = await res.json();
            setItems(Array.isArray(data.data) ? data.data : []);
        } catch {}
        setLoading(false);
        setRefreshing(false);
    }, []);

    useEffect(() => { fetchItems(); }, [fetchItems]);

    const handleApprove = async (id: string, invoiceData: Record<string, any>, cardPrefix: string) => {
        const res = await fetch(`/api/admin/review/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ invoiceData, cardPrefix }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to approve");
        setItems((prev) => prev.filter((i) => i.id !== id));
    };

    const executeDelete = async (id: string) => {
        setDiscardingId(id);
        setDeleteWarnings([]);
        setDeleteError(null);
        try {
            const res = await fetch(`/api/admin/review/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to delete");
            setItems((prev) => prev.filter((i) => i.id !== id));
            setDeleteConfirmItem(null);
            if (data.warnings?.length) setDeleteWarnings(data.warnings);
        } catch (e: any) {
            setDeleteError(e?.message ?? "Failed to delete");
        } finally {
            setDiscardingId(null);
        }
    };

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds((prev) =>
            prev.size === items.length && items.length > 0 ? new Set() : new Set(items.map((i) => i.id))
        );
    }, [items]);

    const executeBulkDelete = async () => {
        const ids = Array.from(selectedIds);
        if (!ids.length) return;
        setBulkDeleting(true);
        setDeleteError(null);
        setDeleteWarnings([]);
        try {
            const results = await Promise.allSettled(
                ids.map((id) =>
                    fetch(`/api/admin/review/${id}`, { method: "DELETE" })
                        .then(async (r) => ({ id, ok: r.ok, data: await r.json().catch(() => ({})) }))
                )
            );
            const deletedIds: string[] = [];
            const warnings: string[] = [];
            const failed: string[] = [];
            for (const r of results) {
                if (r.status === "fulfilled" && r.value.ok) {
                    deletedIds.push(r.value.id);
                    if (Array.isArray(r.value.data?.warnings)) warnings.push(...r.value.data.warnings);
                } else if (r.status === "fulfilled") {
                    failed.push(r.value.data?.error ?? r.value.id);
                } else {
                    failed.push("network error");
                }
            }
            if (deletedIds.length > 0) {
                const deletedSet = new Set(deletedIds);
                setItems((prev) => prev.filter((i) => !deletedSet.has(i.id)));
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    for (const id of deletedIds) next.delete(id);
                    return next;
                });
            }
            if (warnings.length > 0) setDeleteWarnings(warnings);
            if (failed.length > 0) setDeleteError(`Failed to delete ${failed.length} item(s)`);
            setBulkConfirmOpen(false);
        } finally {
            setBulkDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-xl font-bold text-slate-900">ตรวจสอบบิล (ทุก User)</h1>
                    <p className="text-slate-500 text-sm mt-1">
                        รายการรอตรวจสอบจากทุก user — Admin สามารถอนุมัติแทนได้ ระบบจะบันทึกลง Sheet ของ user นั้น
                    </p>
                </div>
                <button
                    onClick={() => fetchItems(false)}
                    disabled={refreshing || loading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50 cursor-pointer shrink-0"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
                    Refresh
                </button>
            </div>

            {/* Warnings */}
            {deleteWarnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <p className="text-xs font-semibold text-amber-800">Note:</p>
                        {deleteWarnings.map((w, i) => <p key={i} className="text-xs text-amber-700 mt-0.5">{w}</p>)}
                    </div>
                    <button type="button" onClick={() => setDeleteWarnings([])} className="text-amber-600 text-xs cursor-pointer">✕</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading...</span>
                </div>
            ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                    <div className="w-14 h-14 rounded-xl bg-slate-50 flex items-center justify-center">
                        <CheckCircle className="w-7 h-7 text-emerald-400" />
                    </div>
                    <p className="text-sm font-medium text-slate-600">No items need review</p>
                </div>
            ) : (
                <div>
                    <div className="flex items-center justify-between gap-2 mb-3 min-h-[28px]">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            <p className="text-sm text-slate-600">{items.length} item{items.length !== 1 ? "s" : ""} awaiting review</p>
                        </div>
                        {selectedIds.size > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
                                <button onClick={() => setSelectedIds(new Set())} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded-md hover:bg-slate-100 cursor-pointer">Clear</button>
                                <button
                                    onClick={() => { setDeleteError(null); setBulkConfirmOpen(true); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500 text-white text-xs font-medium hover:bg-red-600 cursor-pointer"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Delete selected ({selectedIds.size})
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="py-3 pl-4 pr-2 w-10">
                                        <input
                                            type="checkbox"
                                            checked={items.length > 0 && selectedIds.size === items.length}
                                            ref={(el) => {
                                                if (el) el.indeterminate = selectedIds.size > 0 && selectedIds.size < items.length;
                                            }}
                                            onChange={toggleSelectAll}
                                            className="w-4 h-4 rounded border-slate-300 text-teal-600 cursor-pointer"
                                        />
                                    </th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden md:table-cell">User</th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 pr-3">File</th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden sm:table-cell">Missing fields</th>
                                    <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden lg:table-cell">Amount</th>
                                    <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide py-3 px-3 hidden xl:table-cell">Drive</th>
                                    <th className="py-3 pl-3 pr-4" />
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <ReviewRow
                                        key={item.id}
                                        item={item}
                                        onReview={setSelectedItem}
                                        onRequestDelete={(i) => { setDeleteError(null); setDeleteConfirmItem(i); }}
                                        discarding={discardingId === item.id}
                                        selected={selectedIds.has(item.id)}
                                        onToggleSelect={toggleSelect}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Bulk delete confirm */}
            {bulkConfirmOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={() => !bulkDeleting && setBulkConfirmOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 pt-5 pb-3 flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                                <Trash2 className="w-5 h-5 text-red-500" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-base font-semibold text-slate-900">Delete {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""}?</h2>
                                <p className="text-xs text-slate-500 mt-1">Deletes from DB and attempts to remove files from each user's Drive.</p>
                            </div>
                            <button onClick={() => !bulkDeleting && setBulkConfirmOpen(false)} className="p-1 rounded-md text-slate-400 hover:bg-slate-100 cursor-pointer">
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                        {deleteError && <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</div>}
                        <div className="px-6 pb-5 flex justify-end gap-2">
                            <button onClick={() => !bulkDeleting && setBulkConfirmOpen(false)} disabled={bulkDeleting} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
                            <button onClick={() => void executeBulkDelete()} disabled={bulkDeleting} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer disabled:opacity-60">
                                {bulkDeleting ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</> : <><Trash2 className="w-4 h-4" />Delete {selectedIds.size}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Single delete confirm */}
            {deleteConfirmItem && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4" onClick={() => !discardingId && setDeleteConfirmItem(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="px-6 pt-5 pb-3 flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                                <Trash2 className="w-5 h-5 text-red-500" />
                            </div>
                            <div className="flex-1">
                                <h2 className="text-base font-semibold text-slate-900">Delete this item?</h2>
                                <p className="text-xs text-slate-500 mt-1 truncate">{deleteConfirmItem.originalFilename ?? deleteConfirmItem.filename}</p>
                                <p className="text-xs text-blue-600 mt-0.5">{deleteConfirmItem.user?.email ?? deleteConfirmItem.userId}</p>
                            </div>
                            <button onClick={() => !discardingId && setDeleteConfirmItem(null)} className="p-1 rounded-md text-slate-400 hover:bg-slate-100 cursor-pointer">
                                <XIcon className="w-5 h-5" />
                            </button>
                        </div>
                        {deleteError && <div className="mx-6 mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{deleteError}</div>}
                        <div className="px-6 pb-5 flex justify-end gap-2">
                            <button onClick={() => !discardingId && setDeleteConfirmItem(null)} disabled={!!discardingId} className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50">Cancel</button>
                            <button onClick={() => void executeDelete(deleteConfirmItem.id)} disabled={!!discardingId} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500 text-white text-sm font-semibold hover:bg-red-600 cursor-pointer disabled:opacity-60">
                                {discardingId === deleteConfirmItem.id ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting...</> : <><Trash2 className="w-4 h-4" />Delete</>}
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
                    onRequestDeleteConfirm={(i) => { setDeleteError(null); setDeleteConfirmItem(i); }}
                />
            )}
        </div>
    );
}
