"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Upload,
    History,
    Settings,
    CreditCard,
    FileText,
    Zap,
    Table2,
    BarChart3,
    ChevronRight,
    ChevronDown,
    AlertTriangle,
    SlidersHorizontal,
    Plug,
    type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";
import ChangelogBell from "@/components/ChangelogBell";
import { APP_NAME } from "@/lib/app-config";

type NavLink = {
    href: string;
    label: string;
    icon: LucideIcon;
    badge?: number;
};

export default function Sidebar() {
    const pathname = usePathname();
    const { t } = useAppPreferences();
    const [collapsed, setCollapsed] = useState(() => {
        if (typeof window === "undefined") return false;
        return window.localStorage.getItem("sidebar-collapsed") === "true" || window.innerWidth < 768;
    });
    const [reviewCount, setReviewCount] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const settingsRootRef = useRef<HTMLDivElement>(null);

    const navLinks: NavLink[] = [
        { href: "/dashboard", label: t("อัปโหลด", "Upload"), icon: Upload },
        { href: "/dashboard/review", label: t("ตรวจสอบ", "Review"), icon: AlertTriangle, badge: reviewCount > 0 ? reviewCount : undefined },
        { href: "/dashboard/history", label: t("รายการ", "Transactions"), icon: History },
        { href: "/analytics", label: t("วิเคราะห์", "Analytics"), icon: BarChart3 },
        { href: "/integrations", label: t("ตั้งค่า Sheet", "Sheet Settings"), icon: Table2 },
        { href: "/naming", label: t("กฎชื่อไฟล์", "Filename Rules"), icon: FileText },
    ];

    const settingsChildLinks = [
        { href: "/settings", label: t("ทั่วไป", "General"), icon: SlidersHorizontal },
        { href: "/connectors", label: t("คอนเนคเตอร์", "Connectors"), icon: Plug },
    ];

    const isUnderSettings =
        pathname === "/settings" ||
        pathname.startsWith("/settings/") ||
        pathname.startsWith("/dashboard/settings") ||
        pathname === "/connectors" ||
        pathname.startsWith("/connectors/") ||
        pathname.startsWith("/dashboard/connectors");

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

    useEffect(() => {
        let cancelled = false;
        const fetchCount = async () => {
            try {
                const res = await fetch("/api/review");
                if (!res.ok) return;
                const data = await res.json();
                if (!cancelled && Array.isArray(data.data)) {
                    setReviewCount(data.data.length);
                }
            } catch {}
        };

        fetchCount();
        const interval = setInterval(fetchCount, 30_000);
        const handleReviewUpdate = () => { void fetchCount(); };
        window.addEventListener("adser:review-update", handleReviewUpdate);

        return () => {
            cancelled = true;
            clearInterval(interval);
            window.removeEventListener("adser:review-update", handleReviewUpdate);
        };
    }, [pathname]);

    useEffect(() => {
        const shouldExpand =
            pathname === "/settings" ||
            pathname.startsWith("/settings/") ||
            pathname.startsWith("/dashboard/settings") ||
            pathname === "/connectors" ||
            pathname.startsWith("/connectors/") ||
            pathname.startsWith("/dashboard/connectors");
        if (!shouldExpand) return;
        const id = window.setTimeout(() => setSettingsOpen(true), 0);
        return () => window.clearTimeout(id);
    }, [pathname]);

    useEffect(() => {
        const closeFlyout = (e: MouseEvent) => {
            const el = settingsRootRef.current;
            if (el && !el.contains(e.target as Node)) setSettingsOpen(false);
        };
        if (collapsed && settingsOpen) {
            document.addEventListener("mousedown", closeFlyout);
            return () => document.removeEventListener("mousedown", closeFlyout);
        }
    }, [collapsed, settingsOpen]);

    return (
        <aside
            className={`${
                collapsed ? "w-16" : "w-16 md:w-64"
            } h-screen bg-gray-900 text-white flex flex-col shrink-0 sticky top-0 overflow-x-visible transition-[width] duration-200 dark:bg-gray-dark`}
        >
            {/* Logo */}
            <div
                className={`h-14 sm:h-16 border-b border-gray-800 flex items-center ${
                    collapsed ? "px-0 justify-center" : "px-4"
                }`}
            >
                <div className={`flex items-center gap-3 min-w-0 ${collapsed ? "justify-center" : ""}`}>
                    <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-900/30 shrink-0">
                        <Zap className="w-5 h-5 text-white" />
                    </div>
                    {!collapsed && (
                        <div className="min-w-0 whitespace-nowrap overflow-hidden">
                            <p className="font-semibold text-base truncate text-white">{APP_NAME}</p>
                            <p className="text-xs text-gray-400 truncate">{t("แปลงใบแจ้งหนี้เข้า Google Sheets", "Invoices to Google Sheets")}</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto overflow-x-visible custom-scrollbar">
                {navLinks.map(({ href, label, icon: Icon, badge }) => {
                    const isActive = pathname === href;
                    return (
                        <Link
                            key={href}
                            href={href}
                            prefetch={true}
                            className={`group flex items-center ${
                                collapsed ? "justify-center" : "gap-3"
                            } px-3 py-2.5 rounded-lg text-theme-sm font-medium transition-colors ${
                                isActive
                                    ? "bg-brand-500 text-white shadow-sm shadow-brand-900/20"
                                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                            }`}
                        >
                            <div className="relative shrink-0">
                                <Icon className="w-5 h-5" />
                                {collapsed && badge !== undefined && (
                                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-warning-500 text-white text-[9px] font-bold px-0.5">
                                        {badge > 99 ? "99+" : badge}
                                    </span>
                                )}
                            </div>
                            {!collapsed && (
                                <>
                                    <span className="flex-1 truncate">{label}</span>
                                    {badge !== undefined && (
                                        <span className="ml-auto min-w-[20px] h-5 flex items-center justify-center rounded-full bg-warning-500 text-white text-[10px] font-bold px-1">
                                            {badge > 99 ? "99+" : badge}
                                        </span>
                                    )}
                                </>
                            )}
                        </Link>
                    );
                })}

                {/* Settings expandable */}
                <div className="relative" ref={settingsRootRef}>
                    <button
                        type="button"
                        onClick={() => setSettingsOpen((v) => !v)}
                        title={collapsed ? t("ตั้งค่า", "Settings") : undefined}
                        className={`w-full group flex items-center ${
                            collapsed ? "justify-center" : "gap-3"
                        } px-3 py-2.5 rounded-lg text-theme-sm font-medium transition-colors text-left cursor-pointer ${
                            isUnderSettings
                                ? "bg-gray-800 text-white"
                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                        } ${collapsed && settingsOpen ? "ring-2 ring-brand-500/60" : ""}`}
                    >
                        <Settings className="w-5 h-5 shrink-0" />
                        {!collapsed && (
                            <>
                                <span className="flex-1 truncate">{t("ตั้งค่า", "Settings")}</span>
                                {settingsOpen ? (
                                    <ChevronDown className="w-4 h-4 shrink-0 opacity-70 transition-opacity" />
                                ) : (
                                    <ChevronRight className="w-4 h-4 shrink-0 opacity-70 transition-opacity" />
                                )}
                            </>
                        )}
                    </button>

                    {!collapsed && settingsOpen && (
                        <div className="mt-0.5 ml-2 pl-3 border-l border-gray-700 space-y-0.5 py-1">
                            {settingsChildLinks.map(({ href, label, icon: Icon }) => {
                                const isActive =
                                    href === "/settings"
                                        ? pathname === "/settings" ||
                                          pathname.startsWith("/settings/") ||
                                          pathname.startsWith("/dashboard/settings")
                                        : pathname === "/connectors" ||
                                          pathname.startsWith("/connectors/") ||
                                          pathname.startsWith("/dashboard/connectors");
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        prefetch={true}
                                        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-theme-sm font-medium transition-colors ${
                                            isActive
                                                ? "bg-brand-500 text-white shadow-sm shadow-brand-900/20"
                                                : "text-gray-400 hover:text-white hover:bg-gray-800"
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0 opacity-90" />
                                        <span className="truncate">{label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

                    {collapsed && settingsOpen && (
                        <div className="absolute left-full top-0 ml-1.5 z-50 min-w-[168px] rounded-lg border border-gray-700 bg-gray-800 py-1 shadow-theme-xl">
                            {settingsChildLinks.map(({ href, label, icon: Icon }) => {
                                const isActive =
                                    href === "/settings"
                                        ? pathname === "/settings" ||
                                          pathname.startsWith("/settings/") ||
                                          pathname.startsWith("/dashboard/settings")
                                        : pathname === "/connectors" ||
                                          pathname.startsWith("/connectors/") ||
                                          pathname.startsWith("/dashboard/connectors");
                                return (
                                    <Link
                                        key={href}
                                        href={href}
                                        prefetch={true}
                                        onClick={() => setSettingsOpen(false)}
                                        className={`flex items-center gap-2.5 px-3 py-2.5 text-theme-sm font-medium transition-colors ${
                                            isActive
                                                ? "bg-brand-500/30 text-white"
                                                : "text-gray-300 hover:bg-gray-700 hover:text-white"
                                        }`}
                                    >
                                        <Icon className="w-4 h-4 shrink-0" />
                                        <span>{label}</span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </div>
            </nav>

            {/* Bottom */}
            <div className="p-3 border-t border-gray-800">
                <ChangelogBell collapsed={collapsed} />
            </div>
        </aside>
    );
}
