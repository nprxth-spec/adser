"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export default function AdminDeleteUserButton({
  userId,
  userLabel,
}: {
  userId: string;
  userLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "ลบไม่สำเร็จ");
        setLoading(false);
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError("เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex flex-col gap-2 text-xs max-w-[200px]">
        <p className="text-amber-700 font-medium">
          ลบ user นี้และข้อมูลทั้งหมด (บัญชี Google, session, ประวัติ) หรือไม่?
        </p>
        <p className="text-gray-500 truncate" title={userLabel}>
          {userLabel}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="px-2 py-1 rounded bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? "กำลังลบ..." : "ยืนยันลบ"}
          </button>
          <button
            type="button"
            onClick={() => { setConfirming(false); setError(null); }}
            disabled={loading}
            className="px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            ยกเลิก
          </button>
        </div>
        {error && <p className="text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="inline-flex h-6 items-center gap-1 rounded border border-red-200 bg-red-50 px-2 text-[11px] font-medium text-red-700 hover:bg-red-100"
      title="ลบ user และข้อมูลทั้งหมด"
    >
      <Trash2 className="w-3.5 h-3.5" />
      ลบ
    </button>
  );
}
