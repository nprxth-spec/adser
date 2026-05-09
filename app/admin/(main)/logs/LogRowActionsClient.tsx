"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X as XIcon, Loader2 } from "lucide-react";

interface LogFields {
    invoiceDate: string;
    cardLast4: string;
    amount: string;
    currency: string;
    filename: string;
    driveLink: string;
    sheetRow: string;
    status: string;
}

function EditModal({
    logId,
    initial,
    onClose,
    onSaved,
}: {
    logId: string;
    initial: LogFields;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [fields, setFields] = useState<LogFields>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [warnings, setWarnings] = useState<string[]>([]);
    const [debugInfo, setDebugInfo] = useState<Record<string, any> | null>(null);

    const set = (key: keyof LogFields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setFields((prev) => ({ ...prev, [key]: e.target.value }));

    const handleSave = async () => {
        setSaving(true);
        setError("");
        setWarnings([]);
        try {
            const res = await fetch(`/api/admin/log-entry/${logId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    invoiceDate: fields.invoiceDate,
                    cardLast4:   fields.cardLast4,
                    amount:      fields.amount !== "" ? fields.amount : null,
                    currency:    fields.currency,
                    filename:    fields.filename,
                    driveLink:   fields.driveLink,
                    sheetRow:    fields.sheetRow !== "" ? fields.sheetRow : null,
                    status:      fields.status,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to save");
            onSaved(); // refresh table
            if (data.debug) setDebugInfo(data.debug);
            if (data.warnings?.length) {
                setWarnings(data.warnings); // keep modal open to show warnings
            } else {
                onClose();
            }
        } catch (e: any) {
            setError(e.message ?? "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <h2 className="text-sm font-semibold text-slate-900">Edit Log Entry</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 cursor-pointer"
                    >
                        <XIcon className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="px-5 py-4 grid grid-cols-2 gap-3">
                    {([
                        { key: "invoiceDate", label: "Invoice Date", placeholder: "YYYY-MM-DD" },
                        { key: "cardLast4",   label: "Card Last 4",  placeholder: "1234" },
                        { key: "amount",      label: "Amount",       placeholder: "0.00" },
                        { key: "currency",    label: "Currency",     placeholder: "THB" },
                        { key: "sheetRow",    label: "Sheet Row",    placeholder: "5" },
                    ] as { key: keyof LogFields; label: string; placeholder: string }[]).map(({ key, label, placeholder }) => (
                        <div key={key}>
                            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                            <input
                                type="text"
                                value={fields[key]}
                                onChange={set(key)}
                                placeholder={placeholder}
                                className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                            />
                        </div>
                    ))}

                    <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                        <select
                            value={fields.status}
                            onChange={set("status")}
                            className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        >
                            <option value="success">success</option>
                            <option value="review">review</option>
                            <option value="error">error</option>
                        </select>
                    </div>

                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Filename</label>
                        <input
                            type="text"
                            value={fields.filename}
                            onChange={set("filename")}
                            className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                    </div>

                    <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-600 mb-1">Drive Link</label>
                        <input
                            type="text"
                            value={fields.driveLink}
                            onChange={set("driveLink")}
                            placeholder="https://drive.google.com/..."
                            className="w-full px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                    </div>
                </div>

                {warnings.length > 0 && (
                    <div className="mx-5 mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 space-y-1">
                        <p className="text-xs font-semibold text-amber-700">Saved to DB — but Google sync had issues:</p>
                        {warnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-700">{w}</p>
                        ))}
                        {debugInfo && (
                            <details className="mt-1">
                                <summary className="text-[11px] text-amber-600 cursor-pointer">Debug info</summary>
                                <pre className="text-[10px] text-amber-800 mt-1 whitespace-pre-wrap break-all">
                                    {JSON.stringify(debugInfo, null, 2)}
                                </pre>
                            </details>
                        )}
                    </div>
                )}
                {error && (
                    <p className="mx-5 mb-3 text-xs text-red-600 bg-red-50 rounded-md px-3 py-2">{error}</p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 cursor-pointer disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
}

export function LogRowActionsClient({
    logId,
    invoiceDate,
    cardLast4,
    amount,
    currency,
    filename,
    driveLink,
    sheetRow,
    status,
}: {
    logId: string;
    invoiceDate?: string | null;
    cardLast4?: string | null;
    amount?: number | null;
    currency?: string | null;
    filename?: string | null;
    driveLink?: string | null;
    sheetRow?: number | null;
    status?: string | null;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [editOpen, setEditOpen] = useState(false);

    const handleDelete = async () => {
        const confirmed = window.confirm("Delete this log entry? This cannot be undone.");
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/admin/log-entry/${logId}`, { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) { alert(data.error ?? "Failed to delete log"); return; }
            startTransition(() => { router.refresh(); });
        } catch (err: any) {
            alert(err?.message ?? "Failed to delete log");
        }
    };

    const initial: LogFields = {
        invoiceDate: invoiceDate ?? "",
        cardLast4:   cardLast4   ?? "",
        amount:      amount      != null ? String(amount) : "",
        currency:    currency    ?? "",
        filename:    filename    ?? "",
        driveLink:   driveLink   ?? "",
        sheetRow:    sheetRow    != null ? String(sheetRow) : "",
        status:      status      ?? "success",
    };

    return (
        <>
            <div className="flex items-center gap-1.5">
                <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="inline-flex items-center justify-center px-2 py-1 rounded border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                    title="Edit log entry"
                >
                    <Pencil className="w-3 h-3 mr-0.5" />
                    Edit
                </button>
                <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="inline-flex items-center justify-center px-2 py-1 rounded border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                    Delete
                </button>
            </div>

            {editOpen && (
                <EditModal
                    logId={logId}
                    initial={initial}
                    onClose={() => setEditOpen(false)}
                    onSaved={() => startTransition(() => router.refresh())}
                />
            )}
        </>
    );
}
