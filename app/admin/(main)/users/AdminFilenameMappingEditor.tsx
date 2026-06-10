"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type AdminFilenameMappingEditorProps = {
  userId: string;
  userLabel: string;
  value: unknown;
};

function toEditableJson(value: unknown): string {
  if (value === null || value === undefined) return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function previewText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries.map(([k, v]) => `${k}→${v}`).join(", ");
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default function AdminFilenameMappingEditor({
  userId,
  userLabel,
  value,
}: AdminFilenameMappingEditorProps) {
  const initialJson = useMemo(() => toEditableJson(value), [value]);
  const initialPreview = useMemo(() => previewText(value), [value]);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(initialJson);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const openDialog = () => {
    setDraft(initialJson);
    setError(null);
    setOpen(true);
  };

  const closeDialog = () => {
    if (saving) return;
    setOpen(false);
  };

  const handleSave = async () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = draft.trim() === "" ? {} : JSON.parse(draft);
    } catch {
      setError("Invalid JSON");
      return;
    }
    if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
      setError("Must be a JSON object like { \"1234\": \"PREFIX\" }");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filenameMapping: parsed }),
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

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title="Click to edit filenameMapping"
        className="block max-w-xs overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent p-0 text-left text-gray-600 leading-5 hover:text-brand-700"
      >
        {initialPreview || <span className="text-gray-400">— (click to add)</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeDialog}
        >
          <div
            className="w-full max-w-2xl rounded-md bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">Edit filenameMapping</h3>
                <p className="mt-0.5 truncate text-xs text-gray-500" title={userLabel}>
                  {userLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Close
              </button>
            </div>

            <p className="mb-2 text-xs text-gray-500">
              JSON object mapping last digits of card → filename prefix.
              Example: <code className="rounded bg-gray-100 px-1 py-0.5">{`{ "1234": "VISA-A", "5678": "MC-B" }`}</code>
            </p>

            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="block h-64 w-full resize-y rounded border border-gray-300 bg-gray-50 p-3 font-mono text-xs text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            {error && (
              <p className="mt-2 text-xs text-red-600">{error}</p>
            )}

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                disabled={saving}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
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
