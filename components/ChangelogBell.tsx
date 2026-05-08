"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, Sparkles, Wrench, Bug, X } from "lucide-react";
import { CHANGELOG, LATEST_VERSION, type ChangelogEntryType } from "@/lib/changelog";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

const STORAGE_KEY = "filesgo:lastSeenChangelogVersion";

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai - bi;
  }
  return 0;
}

function typeStyle(type: ChangelogEntryType) {
  switch (type) {
    case "feature":
      return {
        Icon: Sparkles,
        label: { th: "ใหม่", en: "New" },
        cls: "bg-teal-50 text-teal-700 border-teal-200",
      };
    case "improvement":
      return {
        Icon: Wrench,
        label: { th: "ปรับปรุง", en: "Improved" },
        cls: "bg-violet-50 text-violet-700 border-violet-200",
      };
    case "fix":
      return {
        Icon: Bug,
        label: { th: "แก้ไข", en: "Fixed" },
        cls: "bg-amber-50 text-amber-700 border-amber-200",
      };
  }
}

export default function ChangelogBell({ collapsed }: { collapsed: boolean }) {
  const { t, language } = useAppPreferences();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load last-seen version from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    setLastSeen(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  // Mark as read when dialog opens
  useEffect(() => {
    if (!open) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, LATEST_VERSION);
    setLastSeen(LATEST_VERSION);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const unreadCount = useMemo(() => {
    if (lastSeen === null) return CHANGELOG.length;
    return CHANGELOG.filter((e) => compareVersions(e.version, lastSeen) > 0).length;
  }, [lastSeen]);

  const hasUnread = unreadCount > 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t("มีอะไรใหม่", "What's new")}
        className={`w-full flex items-center ${
          collapsed ? "justify-center" : "gap-3"
        } px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left cursor-pointer text-slate-400 hover:text-white hover:bg-slate-800`}
      >
        <div className="relative shrink-0">
          <Bell className="w-5 h-5" />
          {hasUnread && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-rose-500 text-white text-[9px] font-bold px-0.5">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{t("มีอะไรใหม่", "What's new")}</span>
            {hasUnread && (
              <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold px-1">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </>
        )}
      </button>

      {open && mounted && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 sm:px-6 pt-5 pb-4 border-b border-slate-100 flex items-start gap-3 shrink-0">
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-slate-900">
                  {t("มีอะไรใหม่ใน Files Go", "What's new in Files Go")}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t(
                    `เวอร์ชันล่าสุด ${LATEST_VERSION}`,
                    `Latest version ${LATEST_VERSION}`
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
              {CHANGELOG.map((entry) => {
                const isUnread =
                  lastSeen === null || compareVersions(entry.version, lastSeen) > 0;
                return (
                  <section key={entry.version}>
                    <div className="flex items-baseline gap-2 mb-3">
                      <h3 className="text-sm font-semibold text-slate-900">
                        v{entry.version}
                      </h3>
                      <span className="text-xs text-slate-400">{entry.date}</span>
                      {isUnread && (
                        <span className="ml-auto px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-semibold">
                          {t("ใหม่", "NEW")}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-2">
                      {entry.items.map((item, i) => {
                        const style = typeStyle(item.type);
                        const Icon = style.Icon;
                        return (
                          <li key={i} className="flex items-start gap-3">
                            <span
                              className={`inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded border text-[10px] font-semibold uppercase tracking-wide ${style.cls}`}
                            >
                              <Icon className="w-3 h-3" />
                              {language === "th" ? style.label.th : style.label.en}
                            </span>
                            <p className="text-sm text-slate-700 leading-relaxed flex-1">
                              {language === "th" ? item.th : item.en}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>

            <div className="px-5 sm:px-6 py-3 border-t border-slate-100 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-lg landing-accent-bg text-white text-sm font-semibold hover:opacity-95 cursor-pointer"
              >
                {t("ปิด", "Close")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
