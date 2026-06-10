"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DayPicker, type DateRange } from "react-day-picker";
import "react-day-picker/dist/style.css";

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseYmd(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}

export default function AdminDateRangeFilter({
  currentFrom,
  currentTo,
}: {
  currentFrom?: string;
  currentTo?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  const selected = useMemo<DateRange | undefined>(() => {
    const from = parseYmd(currentFrom);
    const to = parseYmd(currentTo);
    if (!from && !to) return undefined;
    return { from, to };
  }, [currentFrom, currentTo]);

  const applyRange = (range: DateRange | undefined) => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("range");
    if (range?.from) params.set("from", toYmd(range.from));
    else params.delete("from");
    if (range?.to) params.set("to", toYmd(range.to));
    else params.delete("to");
    params.delete("page");
    const url = params.toString() ? `/admin?${params.toString()}` : "/admin";
    router.push(url);
  };

  const label =
    selected?.from && selected?.to
      ? `${toYmd(selected.from)} → ${toYmd(selected.to)}`
      : selected?.from
      ? `${toYmd(selected.from)} → ...`
      : "Custom range";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
      >
        {label}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[620px] max-w-[calc(100vw-2rem)] rounded-lg border border-gray-200 bg-white p-2.5 shadow-lg">
          <DayPicker
            mode="range"
            selected={selected}
            onSelect={applyRange}
            numberOfMonths={2}
            pagedNavigation
            disabled={(date) => date > new Date() || date < new Date("1900-01-01")}
            className="w-full"
            classNames={{
              months: "flex flex-col gap-3 sm:flex-row sm:gap-4",
              month: "space-y-3",
              month_caption: "flex items-center justify-between pt-1",
              caption_label: "text-sm font-semibold text-gray-900",
              nav: "flex items-center gap-1",
              button_previous:
                "h-6 w-6 inline-flex items-center justify-center rounded border border-transparent text-gray-600 hover:bg-gray-100",
              button_next:
                "h-6 w-6 inline-flex items-center justify-center rounded border border-transparent text-gray-600 hover:bg-gray-100",
              month_grid: "w-full border-collapse",
              weekdays: "flex",
              weekday:
                "w-9 text-center text-[11px] font-medium text-gray-500",
              week: "mt-1 flex w-full",
              day: "h-9 w-9 text-xs p-0 font-normal text-gray-700",
              day_button:
                "h-9 w-9 rounded hover:bg-gray-100 aria-selected:opacity-100",
              selected:
                "bg-sky-500 text-white hover:bg-sky-500 focus:bg-sky-500",
              range_start: "rounded-l-md bg-sky-500 text-white",
              range_end: "rounded-r-md bg-sky-500 text-white",
              range_middle: "bg-sky-100 text-sky-900",
              today: "font-semibold text-gray-900",
              outside: "text-gray-300",
              disabled: "text-gray-300 opacity-60",
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                applyRange(undefined);
                setOpen(false);
              }}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
