"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Upload,
    History,
    Settings,
    CreditCard,
    Zap,
    FileText,
    Wrench,
    ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

export default function Sidebar() {
    const pathname = usePathname();
    const { t } = useAppPreferences();
    const [collapsed, setCollapsed] = useState(false);
    const navLinks = [
        { href: "/dashboard", label: t("อัปโหลด", "Upload"), icon: Upload },
        { href: "/history", label: t("ประวัติ", "History"), icon: History },
        { href: "/integrations", label: t("การเชื่อมต่อ", "Integrations"), icon: Wrench },
        { href: "/naming", label: t("กฎชื่อไฟล์", "Filename Rules"), icon: FileText },
        { href: "/billing", label: t("แพ็กเกจ", "Billing"), icon: CreditCard },
        { href: "/settings", label: t("ตั้งค่า", "Settings"), icon: Settings },
    ];

    // Restore collapsed state from localStorage; on small screens start collapsed
    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem("sidebar-collapsed");
        const isNarrow = window.innerWidth < 768;
        if (stored === "true" || isNarrow) {
            setCollapsed(true);
        }
    }, []);
    
    useEffect(() => {
        if (typeof window === "undefined") return;
        const syncCollapsed = () => {
            const stored = window.localStorage.getItem("sidebar-collapsed");
            setCollapsed(stored === "true");
        };
        const handleStorage = (e: StorageEvent) => {
            if (e.key === "sidebar-collapsed") syncCollapsed();
        };
        window.addEventListener("storage", handleStorage);
        window.addEventListener("sidebar-collapsed-changed", syncCollapsed as EventListener);
        return () => {
            window.removeEventListener("storage", handleStorage);
            window.removeEventListener("sidebar-collapsed-changed", syncCollapsed as EventListener);
        };
    }, []);

    return (
        <aside
            className={`${
                collapsed ? "w-16" : "w-16 md:w-64"
            } h-screen bg-slate-900 text-white flex flex-col shrink-0 sticky top-0 overflow-x-hidden transition-[width] duration-200`}
        >
            {/* Logo */}
            <div className="px-4 py-4 border-b border-slate-800 flex items-center">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-9 h-9 rounded-xl landing-accent-bg flex items-center justify-center shadow-lg shadow-teal-900/30">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    {!collapsed && (
                        <div className="whitespace-nowrap">
                            <p className="font-bold text-base">Files Go</p>
                            <p className="text-xs text-slate-400">{t("แปลงใบแจ้งหนี้เข้า Google Sheets", "Invoices to Google Sheets")}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Nav Links */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navLinks.map(({ href, label, icon: Icon }) => {
                    const isActive = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex items-center ${
                                collapsed ? "justify-center" : "gap-3"
                            } px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                                isActive
                                    ? "landing-accent-bg text-white shadow-lg shadow-teal-900/30"
                                    : "text-slate-400 hover:text-white hover:bg-slate-800"
                            }`}
                        >
                            <Icon className="w-5 h-5 shrink-0" />
                            {!collapsed && (
                                <>
                                    <span className="flex-1 truncate">{label}</span>
                                    {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-60" />}
                                </>
                            )}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
