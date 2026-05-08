"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

const LIMIT_OPTIONS = [25, 50, 100, 200, 500];

export function LogsPageSizeSelect({
  basePath,
  currentLimit,
}: {
  basePath: string;
  currentLimit: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const buildUrl = (limit: number, resetPage = true) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("limit", String(limit));
    if (resetPage) params.set("page", "1");
    return `${basePath}?${params.toString()}`;
  };

  const handleChange = (limit: number) => {
    startTransition(() => {
      router.push(buildUrl(limit));
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-slate-500 whitespace-nowrap">Per page:</span>
      <select
        value={currentLimit}
        onChange={(e) => handleChange(Number(e.target.value))}
        disabled={isPending}
        className="px-2.5 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:opacity-50 cursor-pointer"
        aria-label="Items per page"
      >
        {LIMIT_OPTIONS.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {isPending && <span className="text-[11px] text-slate-400">Updating…</span>}
    </div>
  );
}
