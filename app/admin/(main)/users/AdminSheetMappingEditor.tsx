"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const COL_OPTIONS = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));

const FIELDS: { key: string; label: string }[] = [
  { key: "date",       label: "Invoice Date" },
  { key: "billed_to", label: "Billed To" },
  { key: "card_last_4", label: "Card (Last 4)" },
  { key: "amount",    label: "Amount (success)" },
  { key: "amountFailed", label: "Amount (failed)" },
  { key: "currency",  label: "Currency" },
  { key: "filename",  label: "File Name" },
  { key: "driveLink", label: "Drive Link" },
  { key: "reference", label: "หมายเลขอ้างอิง" },
];

const DEFAULT_MAPPING: Record<string, string> = {
  date: "A",
  billed_to: "B",
  card_last_4: "O",
  amount: "G",
  amountFailed: "H",
  currency: "",
  filename: "",
  driveLink: "J",
  reference: "T",
};

type Props = {
  userId: string;
  userLabel: string;
  value: unknown;
};

function toMapping(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const m: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = (value as any)[f.key];
      m[f.key] = typeof v === "string" ? v : DEFAULT_MAPPING[f.key] ?? "";
    }
    return m;
  }
  return { ...DEFAULT_MAPPING };
}

function previewText(value: unknown): string {
  const m = toMapping(value);
  const parts = FIELDS
    .filter((f) => m[f.key])
    .map((f) => `${f.label.split(" ")[0]}→${m[f.key]}`);
  return parts.length > 0 ? parts.join(", ") : "";
}

export default function AdminSheetMappingEditor({ userId, userLabel, value }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(toMapping(value));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const openDialog = () => {
    setDraft(toMapping(value));
    setError(null);
    setOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setOpen(false);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetMapping: draft }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Failed to save");
        setSaving(false);
        return;
      }
      setSaving(false);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Network error");
      setSaving(false);
    }
  };

  const preview = previewText(value);

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="Click to edit sheetMapping"
        className="block max-w-xs overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent p-0 text-left text-slate-600 leading-5 hover:text-teal-700 text-xs"
      >
        {preview || <span className="text-slate-400">— (click to set)</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-lg rounded-md bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">Edit Sheet Column Mapping</h3>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={userLabel}>
                  {userLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                  <select
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">— Skip —</option>
                    {COL_OPTIONS.map((col) => (
                      <option key={col} value={col}>Column {col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
