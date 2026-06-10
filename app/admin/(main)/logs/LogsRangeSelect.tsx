"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Calendar, ChevronDown } from "lucide-react";

const RANGE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "this_year", label: "This year" },
];

export default function LogsRangeSelect({
  basePath,
  currentRange,
  dateLabel = "Date:",
}: {
  basePath: string;
  currentRange: string;
  dateLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleChange = (range: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (range && range !== "all") params.set("range", range);
    else params.delete("range");
    params.set("page", "1");
    const url = params.toString() ? `${basePath}?${params.toString()}` : basePath;
    startTransition(() => router.push(url));
  };

  return (
    <div className="flex items-center gap-2">
      <Calendar className="w-4 h-4 text-gray-500 shrink-0" />
      <span className="text-sm font-medium text-gray-600">{dateLabel}</span>
      <div className="relative">
        <select
          value={currentRange}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          className="appearance-none pl-3 pr-8 py-2 rounded-md border border-gray-200 bg-white text-gray-800 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-400 min-w-[140px] cursor-pointer disabled:opacity-50"
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}
