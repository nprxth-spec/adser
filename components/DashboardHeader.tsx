"use client";

import { Zap, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

type HeaderUser = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function DashboardHeader({
  user,
  credits,
  plan = "free",
}: {
  user: HeaderUser | null | undefined;
  credits: number;
  plan?: string;
}) {
  const { t } = useAppPreferences();
  const [menuOpen, setMenuOpen] = useState(false);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const handleConfirmSignOut = async () => {
    setShowSignOutConfirm(false);
    await signOut({ callbackUrl: "/" });
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCollapsed = () => {
      setSidebarCollapsed(window.localStorage.getItem("sidebar-collapsed") === "true");
    };
    syncCollapsed();
    window.addEventListener("storage", syncCollapsed);
    window.addEventListener("sidebar-collapsed-changed", syncCollapsed as EventListener);
    return () => {
      window.removeEventListener("storage", syncCollapsed);
      window.removeEventListener("sidebar-collapsed-changed", syncCollapsed as EventListener);
    };
  }, []);

  const handleToggleSidebar = () => {
    if (typeof window === "undefined") return;
    const next = !sidebarCollapsed;
    window.localStorage.setItem("sidebar-collapsed", String(next));
    window.dispatchEvent(new Event("sidebar-collapsed-changed"));
    setSidebarCollapsed(next);
  };

  return (
    <>
      <header className="h-14 sm:h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20 shrink-0 dark:bg-gray-900 dark:border-gray-800">
        <button
          type="button"
          onClick={handleToggleSidebar}
          className="inline-flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors cursor-pointer dark:text-gray-400 dark:hover:text-white"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="w-6 h-6" />
          ) : (
            <PanelLeftClose className="w-6 h-6" />
          )}
        </button>

        <div className="flex items-center gap-2 sm:gap-4 relative" ref={menuRef}>
          <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-brand-50 border border-brand-100 dark:bg-brand-500/10 dark:border-brand-500/20">
            <Zap className="w-3.5 h-3.5 text-brand-600 shrink-0 dark:text-brand-400" />
            <span className="text-xs sm:text-sm font-semibold text-brand-700 dark:text-brand-400">
              {plan === "pro" ? t("ไม่จำกัด", "Unlimited") : credits}
            </span>
            <span className="hidden sm:inline text-xs text-brand-500 dark:text-brand-500">
              {t("เครดิต", "credits")}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full hover:ring-2 hover:ring-gray-200 transition-all cursor-pointer shrink-0 dark:hover:ring-gray-700"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name ?? "User"}
                width={36}
                height={36}
                className="rounded-full ring-2 ring-white shadow w-8 h-8 sm:w-9 sm:h-9 object-cover dark:ring-gray-800"
              />
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
                {user?.name?.[0] ?? "U"}
              </div>
            )}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 sm:w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-gray-200 bg-white shadow-theme-lg text-theme-sm z-20 dark:border-gray-800 dark:bg-gray-900">
              <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {t("บัญชี", "Account")}
                </p>
                <p className="text-theme-sm font-medium text-gray-900 truncate dark:text-white">
                  {user?.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); setShowSignOutConfirm(true); }}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-gray-50 cursor-pointer dark:hover:bg-gray-800"
              >
                <LogOut className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <span className="text-gray-700 dark:text-gray-300">{t("ออกจากระบบ", "Sign out")}</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {showSignOutConfirm && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-theme-xl max-w-sm w-full mx-4 p-6 dark:bg-gray-900 dark:border dark:border-gray-800">
            <p className="text-base font-semibold text-gray-900 mb-2 dark:text-white">
              {t("ออกจากระบบ?", "Sign out?")}
            </p>
            <p className="text-theme-sm text-gray-500 mb-5 dark:text-gray-400">
              {t("คุณจะออกจากระบบ Files Go และต้องเข้าสู่ระบบใหม่เพื่อใช้งานต่อ", "You will be signed out of Files Go and need to sign in again to continue.")}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSignOutConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-theme-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                {t("ยกเลิก", "Cancel")}
              </button>
              <button
                type="button"
                onClick={handleConfirmSignOut}
                className="px-4 py-2 rounded-lg bg-error-600 text-white text-theme-sm font-medium hover:bg-error-700 cursor-pointer"
              >
                {t("ออกจากระบบ", "Sign out")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
