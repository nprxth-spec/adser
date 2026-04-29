"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { RotateCw } from "lucide-react";

export function LogsSearchClient({
  basePath,
  placeholder = "Search by user, filename, or Drive link",
}: {
  basePath: string;
  placeholder?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(() => searchParams.get("q") ?? "");

  const applySearch = (query: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (query.trim()) {
      params.set("q", query.trim());
      // reset to first page when searching
      params.delete("page");
    } else {
      params.delete("q");
    }
    startTransition(() => {
      router.push(`${basePath}${params.toString() ? `?${params.toString()}` : ""}`);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applySearch(value);
  };

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex items-center gap-2">
      <div className="flex-1 flex items-center gap-2">
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            const next = e.target.value;
            setValue(next);
            // ถ้าลบข้อความจนว่าง ให้เคลียร์การค้นหาและรีเซ็ตผลลัพธ์ทันที
            if (next.trim() === "") {
              applySearch("");
            }
          }}
          className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          {isPending ? "Searching..." : "Search"}
        </button>
      </div>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={isPending}
        className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        aria-label="Refresh logs"
      >
        <RotateCw className={`w-4 h-4 mr-1 ${isPending ? "animate-spin" : ""}`} />
        {isPending ? "Loading..." : "Refresh"}
      </button>
    </form>
  );
}

