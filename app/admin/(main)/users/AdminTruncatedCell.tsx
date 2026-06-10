"use client";

import { useMemo, useState } from "react";

type AdminTruncatedCellProps = {
  value: unknown;
  emptyLabel?: string;
};

export default function AdminTruncatedCell({
  value,
  emptyLabel = "—",
}: AdminTruncatedCellProps) {
  const [open, setOpen] = useState(false);

  const textValue = useMemo(() => {
    if (value === null || value === undefined) return "";
    if (typeof value === "string") return value;
    return JSON.stringify(value);
  }, [value]);

  if (!textValue) {
    return <span className="text-gray-600">{emptyLabel}</span>;
  }

  return (
    <>
      <button
        type="button"
        onDoubleClick={() => setOpen(true)}
        className="block max-w-xs overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent p-0 text-left text-gray-600 leading-5 hover:text-gray-800"
        title="Double click to view full value"
      >
        {textValue}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-md bg-white p-4 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Full value</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
            <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-3 text-xs text-gray-700">
              {textValue}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
