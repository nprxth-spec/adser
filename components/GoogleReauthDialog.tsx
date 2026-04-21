"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { AlertCircle } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

export default function GoogleReauthDialog() {
  const { t } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const check = async () => {
      try {
        const res = await fetch("/api/google/connection-status", { cache: "no-store" });
        if (!active) return;
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          if (data?.code === "GOOGLE_REAUTH_REQUIRED" || data?.code === "GOOGLE_SCOPE_MISSING") {
            setMessage(data?.error ?? t("Google token หมดอายุ กรุณาเข้าสู่ระบบใหม่", "Google token expired. Please sign in again."));
            setOpen(true);
          }
        }
      } catch {
        // Ignore network errors in guard polling.
      }
    };

    const onFocus = () => {
      void check();
    };

    void check();
    const timer = window.setInterval(() => {
      void check();
    }, 120000);
    window.addEventListener("focus", onFocus);

    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [t]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <p className="text-base font-semibold text-slate-900">{t("เซสชัน Google หมดอายุ", "Google session expired")}</p>
            <p className="text-sm text-slate-500 mt-1">{message}</p>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 cursor-pointer"
          >
            {t("เข้าสู่ระบบใหม่", "Login again")}
          </button>
        </div>
      </div>
    </div>
  );
}

