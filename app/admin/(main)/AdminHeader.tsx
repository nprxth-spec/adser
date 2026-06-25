"use client";

import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";

const TITLE_BY_PATH: Array<{ prefix: string; title: string }> = [
  { prefix: "/admin/logs", title: "ประมวลผลใบแจ้งหนี้" },
  { prefix: "/admin/audit-logs", title: "การล็อกอิน / แก้ไข config" },
  { prefix: "/admin/users", title: "Users & Credits" },
  { prefix: "/admin", title: "Dashboard" },
];

export default function AdminHeader({
  sidebarOpen,
  onToggleSidebar,
}: {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const pathname = usePathname();
  const matched = TITLE_BY_PATH.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)
  );
  const title = matched?.title ?? "Admin";

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur dark:border-gray-800 dark:bg-gray-900/95">
      <div className="flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-400 dark:hover:bg-gray-800"
            aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
            title={sidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {APP_NAME} Admin
            </p>
            <h1 className="text-theme-sm font-semibold text-gray-900 dark:text-white">{title}</h1>
          </div>
        </div>
      </div>
    </header>
  );
}
