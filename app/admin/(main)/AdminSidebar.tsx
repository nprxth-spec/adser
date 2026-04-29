"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ScrollText, Users, LogOut, ClipboardList } from "lucide-react";

const navLinks = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/logs", label: "ประมวลผลใบแจ้งหนี้", icon: ScrollText },
  { href: "/admin/audit-logs", label: "การล็อกอิน / Config", icon: ClipboardList },
  { href: "/admin/users", label: "Users & Credits", icon: Users },
];

export default function AdminSidebar({ isOpen }: { isOpen: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={`h-screen sticky top-0 bg-slate-800 text-white flex flex-col shrink-0 transition-all duration-200 overflow-hidden ${
        isOpen ? "w-56" : "w-16"
      }`}
    >
      <div className="h-14 border-b border-slate-700 px-4 flex items-center">
        {isOpen ? (
          <div>
            <p className="font-bold text-slate-100">Files Go Admin</p>
            <p className="text-xs text-slate-400 mt-0.5">Admin panel</p>
          </div>
        ) : null}
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navLinks.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || (href !== "/admin" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              prefetch={true}
              title={label}
              aria-label={label}
              className={`flex items-center px-2 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isOpen ? "justify-start gap-3" : "justify-center"
              } ${
                isActive
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/70"
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {isOpen ? <span>{label}</span> : null}
            </Link>
          );
        })}
      </nav>

      <div className="p-2 border-t border-slate-700">
        <form action="/api/admin/logout" method="POST">
          <button
            type="submit"
            title="Log out"
            aria-label="Log out"
            className={`w-full flex items-center px-2 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-slate-700/70 transition-colors cursor-pointer ${
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
