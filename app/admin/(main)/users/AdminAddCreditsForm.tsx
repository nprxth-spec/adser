"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminAddCreditsForm({
  userId,
  userEmail,
}: {
  userId: string;
  userEmail: string;
}) {
  const [amount, setAmount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ type: "err", text: data.error ?? "Failed" });
        setLoading(false);
        return;
      }
      setMessage({ type: "ok", text: `Added ${amount} credits. New total: ${data.credits ?? "—"}` });
      setLoading(false);
      router.refresh();
    } catch {
      setMessage({ type: "err", text: "Network error" });
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1">
      <input
        type="number"
        min={1}
        max={9999}
        value={amount}
        onChange={(e) => setAmount(parseInt(e.target.value, 10) || 1)}
        className="h-6 w-16 rounded border border-slate-200 px-2 text-[11px] text-slate-800"
      />
      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-6 items-center rounded bg-teal-600 px-2 text-[11px] font-medium text-white hover:bg-teal-700 disabled:opacity-50"
      >
        {loading ? "..." : "Add"}
      </button>
      {message && (
        <span className={`text-xs ${message.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {message.text}
        </span>
      )}
    </form>
  );
}
