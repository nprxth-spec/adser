"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScrollText, Users, LogOut, ClipboardList, BarChart3, ClipboardCheck } from "lucide-react";
import { APP_NAME } from "@/lib/app-config";

const navLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/analytics", label: "วิเคราะห์การใช้จ่าย", icon: BarChart3 },
  { href: "/admin/logs", label: "ประมวลผลใบแจ้งหนี้", icon: ScrollText },
  { href: "/admin/review", label: "ตรวจสอบบิล", icon: ClipboardCheck },
  { href: "/admin/audit-logs", label: "การล็อกอิน / Config", icon: ClipboardList },
  { href: "/admin/users", label: "Users & Credits", icon: Users },
];

export default function AdminSidebar({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={`h-screen sticky top-0 bg-gray-900 text-white flex flex-col shrink-0 transition-all duration-200 overflow-hidden dark:bg-gray-dark ${
        isOpen ? "w-56" : "w-16"
      }`}
    >
      <div className="h-14 border-b border-gray-800 px-4 flex items-center">
        {isOpen ? (
          <div>
            <p className="font-semibold text-white text-theme-sm">{APP_NAME} Admin</p>
            <p className="text-xs text-gray-400 mt-0.5">Admin panel</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto custom-scrollbar">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/admin" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              title={label}
              aria-label={label}
              className={`flex items-center px-2 py-2.5 rounded-lg text-theme-sm font-medium transition-colors ${
                isOpen ? "justify-start gap-3" : "justify-center"
              } ${
                isActive
                  ? "bg-brand-500 text-white shadow-sm shadow-brand-900/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {isOpen ? <span>{label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-gray-800">
        <form action="/api/admin/logout" method="POST">
          <button
            type="submit"
            title="Log out"
            aria-label="Log out"
            className={`w-full flex items-center px-2 py-2.5 rounded-lg text-theme-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer ${
              isOpen ? "justify-start gap-3" : "justify-center"
            }`}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {isOpen ? <span>Log out</span> : null}
          </button>
        </form>
      </div>
    </aside>
  );
}
