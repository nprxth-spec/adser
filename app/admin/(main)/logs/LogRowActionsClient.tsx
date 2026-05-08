"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function LogRowActionsClient({ logId }: { logId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleDelete = async () => {
    const confirmed = window.confirm("Delete this log entry? This cannot be undone.");
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/admin/log-entry/${logId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Failed to delete log");
        return;
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (err: any) {
      alert(err?.message ?? "Failed to delete log");
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="inline-flex items-center justify-center px-2 py-1 rounded border border-red-200 text-[11px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      Delete
    </button>
  );
}

