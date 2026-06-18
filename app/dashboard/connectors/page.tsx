"use client";

import React, { useEffect, useRef, useState } from "react";
import {
    CheckCircle2,
    Loader2,
    RefreshCw,
    Plug,
    AlertTriangle,
    Link2Off,
    Settings2,
    X,
    Building2,
    Search,
    CreditCard,
    ChevronDown,
} from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

type FundingSource = {
    id?: string;
    display_string?: string;
    type?: number;
};

type AdAccount = {
    id: string;
    accountId: string;
    name: string | null;
    accountStatus: number | null;
    accountStatusLabel: string;
    timezoneName: string | null;
    currency: string | null;
    businessId: string | null;
    businessName: string | null;
    agencies: { id: string; name: string }[];
    enabled: boolean;
    amountSpent: number | null;
    spendCap: number | null;
    fundingSource: FundingSource | null;
};

type MetaData = {
    configured: boolean;
    connected: boolean;
    connection: {
        fbUserName: string | null;
        tokenExpiresAt: string | null;
        lastSyncedAt: string | null;
    } | null;
    adAccounts: AdAccount[];
};

type BusinessGroup = {
    key: string;
    label: string;
    accounts: AdAccount[];
};

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */
const statusTone = (status: number | null): string => {
    if (status === 1) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status == null) return "bg-gray-50 text-gray-500 border-gray-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
};

function formatTimezone(tz: string | null): string {
    if (!tz) return "—";
    try {
        const parts = new Intl.DateTimeFormat("en", {
            timeZone: tz,
            timeZoneName: "shortOffset",
        }).formatToParts(new Date());
        const gmt = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
        const offset = gmt.replace("GMT", "") || "+0";
        return `${offset} | ${tz}`;
    } catch {
        return tz;
    }
}

function formatMoney(amount: number | null, currency: string | null): string {
    if (amount == null) return "—";
    const curr = currency ?? "USD";
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: curr,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${amount.toFixed(2)} ${curr}`;
    }
}

function detectCardBrand(src: FundingSource | null): "visa" | "mastercard" | "unionpay" | "amex" | "paypal" | "other" | null {
    if (!src) return null;
    const s = (src.display_string ?? "").toLowerCase();
    if (s.includes("visa")) return "visa";
    if (s.includes("mastercard") || s.includes("master card")) return "mastercard";
    if (s.includes("unionpay") || s.includes("union pay")) return "unionpay";
    if (s.includes("amex") || s.includes("american express")) return "amex";
    if (s.includes("paypal")) return "paypal";
    if (src.type != null) return "other";
    return null;
}

function extractLast4(display: string | undefined): string {
    if (!display) return "";
    // "Visa ending in 1234" or "Visa ****1234"
    const m = display.match(/(\d{4})(?:\s*$|\s*[^0-9])/);
    return m ? m[1] : "";
}

function groupByBusiness(accounts: AdAccount[]): BusinessGroup[] {
    const map = new Map<string, BusinessGroup>();
    for (const a of accounts) {
        const key = a.businessId ?? a.agencies[0]?.id ?? "__none__";
        const label = a.businessName ?? a.agencies[0]?.name ?? "ไม่มีบัญชีธุรกิจ";
        if (!map.has(key)) map.set(key, { key, label, accounts: [] });
        map.get(key)!.accounts.push(a);
    }
    return Array.from(map.values());
}

/* ------------------------------------------------------------------ */
/* Page                                                                 */
/* ------------------------------------------------------------------ */
export default function ConnectorsPage() {
    const { t } = useAppPreferences();
    const [meta, setMeta] = useState<MetaData | null>(null);
    const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [showMore, setShowMore] = useState(false);

    const isExpired = meta?.connection?.tokenExpiresAt
        ? new Date(meta.connection.tokenExpiresAt) < new Date()
        : false;

    const loadMeta = async () => {
        const res = await fetch("/api/connectors/meta");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Meta connection");
        setMeta(data.data as MetaData);
    };

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get("meta") === "connected")
            setNotice(t("เชื่อมต่อ Meta Ads สำเร็จ", "Meta Ads connected successfully"));
        const metaError = params.get("meta_error");
        if (metaError) {
            const map: Record<string, string> = {
                not_configured: t("ยังไม่ได้ตั้งค่า Meta App", "Meta app is not configured"),
                denied: t("คุณปฏิเสธการเชื่อมต่อ", "Connection was denied"),
                invalid_state: t("เซสชันไม่ถูกต้อง ลองใหม่อีกครั้ง", "Invalid session, please try again"),
                exchange_failed: t("แลกโทเค็นไม่สำเร็จ", "Failed to exchange token"),
            };
            setError(map[metaError] ?? t("เชื่อมต่อ Meta ไม่สำเร็จ", "Meta connection failed"));
        }
        if (params.has("meta") || params.has("meta_error"))
            window.history.replaceState(null, "", window.location.pathname);
    }, [t]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try { await loadMeta(); }
            catch (err) { setError(err instanceof Error ? err.message : "Failed to load connectors"); }
            setLoading(false);
        };
        load();
        fetch("/api/google/connection-status")
            .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
            .then(({ ok, j }) => setGoogleConnected(ok && Boolean(j?.data?.connected)))
            .catch(() => setGoogleConnected(false));
    }, []);

    const handleSync = async () => {
        setSyncing(true); setError(""); setNotice("");
        try {
            const res = await fetch("/api/connectors/meta/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Sync failed");
            await loadMeta();
            setNotice(t(`ดึงข้อมูลสำเร็จ: ${data.data.count} บัญชีโฆษณา`, `Synced ${data.data.count} ad accounts`));
        } catch (err) { setError(err instanceof Error ? err.message : "Sync failed"); }
        setSyncing(false);
    };

    const handleDisconnect = async () => {
        setDisconnecting(true); setError(""); setNotice("");
        try {
            const res = await fetch("/api/connectors/meta", { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Disconnect failed");
            await loadMeta();
            setDialogOpen(false);
            setNotice(t("ตัดการเชื่อมต่อ Meta แล้ว", "Meta disconnected"));
        } catch (err) { setError(err instanceof Error ? err.message : "Disconnect failed"); }
        setDisconnecting(false);
    };

    const handleToggleAccount = async (id: string, enabled: boolean) => {
        setMeta((prev) =>
            prev ? { ...prev, adAccounts: prev.adAccounts.map((a) => (a.id === id ? { ...a, enabled } : a)) } : prev,
        );
        setTogglingId(id);
        try {
            await fetch(`/api/connectors/meta/ad-accounts/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled }),
            });
        } finally { setTogglingId(null); }
    };

    return (
        <div className="max-w-4xl mx-auto pb-12 w-full min-w-0">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t("คอนเนคเตอร์", "Connectors")}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t("เชื่อมต่อแหล่งข้อมูลเพื่อดึงและส่งข้อมูลเข้า Google Sheets", "Connect data sources to pull and push data into Google Sheets.")}</p>
            </div>

            {notice && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" /><span>{notice}</span>
                </div>
            )}
            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/30 dark:bg-red-950/20 dark:text-red-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" /><span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <ConnectorCard iconSrc="/drive.svg" title="Google Drive"
                    subtitle={t("อัปโหลดไฟล์ใบแจ้งหนี้", "Stores invoice files")} status={googleConnected}
                    connectedLabel={t("เชื่อมต่อแล้ว (ผ่านบัญชี Google)", "Connected (via Google sign-in)")}
                    disconnectedLabel={t("ยังไม่เชื่อมต่อ", "Not connected")} />
                <ConnectorCard iconSrc="/sheet.svg" title="Google Sheets"
                    subtitle={t("บันทึกข้อมูลเป็นแถว", "Receives data rows")} status={googleConnected}
                    connectedLabel={t("เชื่อมต่อแล้ว (ผ่านบัญชี Google)", "Connected (via Google sign-in)")}
                    disconnectedLabel={t("ยังไม่เชื่อมต่อ", "Not connected")} />
            </div>

            <div className="flex justify-center mb-6">
                <button
                    type="button"
                    onClick={() => setShowMore(!showMore)}
                    className="inline-flex items-center gap-2 px-5 py-2 rounded-full border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-all shadow-sm hover:shadow-md cursor-pointer"
                >
                    <span>{showMore ? t("ดูน้อยลง", "See less") : t("ดูเพิ่มเติม", "See more")}</span>
                    <ChevronDown className={`w-4 h-4 transition-transform duration-300 text-gray-500 ${showMore ? "rotate-180" : ""}`} />
                </button>
            </div>

            {/* Collapsible container for Meta Ads */}
            <div className={`transition-all duration-500 ease-in-out overflow-hidden ${showMore ? "max-h-[500px] opacity-100 mb-4 scale-100 translate-y-0" : "max-h-0 opacity-0 mb-0 scale-95 -translate-y-2 pointer-events-none"}`}>
                <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/60 dark:shadow-none p-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center shrink-0">
                            <MetaIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">Meta Ads</p>
                            <p className="text-sm text-gray-400 dark:text-gray-400">{t("เชื่อม Facebook เพื่อดึงบัญชีโฆษณา", "Connect Facebook to pull ad accounts")}</p>
                        </div>
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin text-gray-400 shrink-0" />
                        ) : !meta?.configured ? (
                            <span className="text-xs text-gray-400 shrink-0">{t("ยังไม่ได้ตั้งค่า", "Not configured")}</span>
                        ) : !meta.connected ? (
                            <a href="/api/connectors/meta/connect"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1877F2] text-white text-sm font-medium hover:opacity-95 transition-all shadow-sm cursor-pointer shrink-0">
                                <Plug className="w-4 h-4" />{t("เชื่อมต่อ", "Connect")}
                            </a>
                        ) : (
                            <div className="flex items-center gap-2 shrink-0">
                                {isExpired ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 dark:border-amber-900/30 dark:bg-amber-950/20 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 shrink-0">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        {t("หมดอายุ", "Expired")}
                                    </span>
                                ) : (
                                    <StatusBadge connected={true} label={t("เชื่อมต่อแล้ว", "Connected")} />
                                )}
                                <a href="/api/connectors/meta/connect"
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm cursor-pointer shrink-0">
                                    <RefreshCw className="w-3.5 h-3.5" />{t("เชื่อมต่อใหม่", "Reconnect")}
                                </a>
                                <button type="button" onClick={() => setDialogOpen(true)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                                    <Settings2 className="w-4 h-4" />{t("จัดการ", "Manage")}
                                </button>
                            </div>
                        )}
                    </div>
                    {!loading && !meta?.configured && (
                        <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">{t("กรุณาตั้งค่า FACEBOOK_APP_ID และ FACEBOOK_APP_SECRET", "Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to enable.")}</p>
                    )}
                    {!loading && meta?.configured && !meta.connected && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">{t("ดึงข้อมูล: ID บัญชีโฆษณา, สถานะ, ไทม์โซน, บัญชีธุรกิจที่ดูแล", "Pulls: ad account IDs, status, timezone, and managed business accounts.")}</p>
                    )}
                </div>
            </div>

            {dialogOpen && meta && (
                <MetaManageDialog meta={meta} syncing={syncing} disconnecting={disconnecting}
                    togglingId={togglingId} onSync={handleSync} onDisconnect={handleDisconnect}
                    onToggleAccount={handleToggleAccount} onClose={() => setDialogOpen(false)} t={t} />
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                               */
/* ------------------------------------------------------------------ */
function MetaManageDialog({ meta, syncing, disconnecting, togglingId, onSync, onDisconnect, onToggleAccount, onClose, t }: {
    meta: MetaData; syncing: boolean; disconnecting: boolean; togglingId: string | null;
    onSync: () => void; onDisconnect: () => void;
    onToggleAccount: (id: string, enabled: boolean) => void;
    onClose: () => void; t: (th: string, en: string) => string;
}) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const [search, setSearch] = useState("");

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, [onClose]);

    const q = search.trim().toLowerCase();
    const filtered = q
        ? meta.adAccounts.filter(
              (a) =>
                  (a.name ?? "").toLowerCase().includes(q) ||
                  a.accountId.toLowerCase().includes(q) ||
                  (a.businessName ?? "").toLowerCase().includes(q) ||
                  a.agencies.some((ag) => ag.name.toLowerCase().includes(q)) ||
                  (a.fundingSource?.display_string ?? "").toLowerCase().includes(q),
          )
        : meta.adAccounts;

    const enabledCount = meta.adAccounts.filter((a) => a.enabled).length;
    const groups = groupByBusiness(filtered);
    const COL = 7;

    return (
        <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onMouseDown={(e) => { if (e.target === overlayRef.current) onClose(); }}>
            <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-2xl shadow-theme-xl w-full max-w-6xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center shrink-0">
                            <MetaIcon className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{t("จัดการ Meta Ads", "Manage Meta Ads")}</p>
                            {meta.connection?.fbUserName && <p className="text-xs text-gray-400 dark:text-gray-400">{meta.connection.fbUserName}</p>}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors cursor-pointer" aria-label="Close">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                    {/* Search */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t("ค้นหาบัญชี, ชื่อธุรกิจ, บัตร...", "Search accounts, business, card...")}
                            className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 transition-colors"
                        />
                    </div>
                    {/* Stats + actions */}
                    <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs text-gray-400 dark:text-gray-400">
                            {t(`เปิด ${enabledCount}/${meta.adAccounts.length} บัญชี`, `${enabledCount}/${meta.adAccounts.length} enabled`)}
                            {q && filtered.length !== meta.adAccounts.length && (
                                <span className="ml-1 text-brand-500">· {t(`พบ ${filtered.length} รายการ`, `${filtered.length} results`)}</span>
                            )}
                        </span>
                        <button type="button" onClick={onSync} disabled={syncing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-500 text-white text-xs font-medium hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed">
                            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                            {t("ดึงข้อมูล", "Sync")}
                        </button>
                        <a href="/api/connectors/meta/connect"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 transition-all cursor-pointer shrink-0">
                            <RefreshCw className="w-3.5 h-3.5" />
                            {t("เชื่อมต่อใหม่", "Reconnect")}
                        </a>
                        <button type="button" onClick={onDisconnect} disabled={disconnecting}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-50 dark:hover:bg-red-950/20 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed">
                            {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2Off className="w-3.5 h-3.5" />}
                            {t("ตัดการเชื่อมต่อ", "Disconnect")}
                        </button>
                    </div>
                </div>

                {/* Sync timestamp */}
                {meta.connection?.lastSyncedAt && (
                    <div className="px-6 py-1.5 bg-gray-50 dark:bg-gray-800/40 border-b border-gray-100 dark:border-gray-800 shrink-0">
                        <p className="text-xs text-gray-400 dark:text-gray-400">
                            {t(`ดึงข้อมูลล่าสุด: ${new Date(meta.connection.lastSyncedAt).toLocaleString()}`,
                               `Last synced: ${new Date(meta.connection.lastSyncedAt).toLocaleString()}`)}
                        </p>
                    </div>
                )}

                {/* Table */}
                <div className="overflow-auto flex-1 bg-white dark:bg-gray-900">
                    {meta.adAccounts.length === 0 ? (
                        <div className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                            {t('ยังไม่มีข้อมูล — กด "ดึงข้อมูล" เพื่อโหลดบัญชีโฆษณา', 'No data yet — click "Sync" to load ad accounts.')}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="px-6 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                            {t("ไม่พบรายการที่ตรงกัน", "No matching accounts")}
                        </div>
                    ) : (
                        <table className="w-full text-sm bg-white dark:bg-gray-900">
                            <thead className="sticky top-0 z-10 bg-white dark:bg-gray-900">
                                <tr className="text-left text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                                    <th className="px-5 py-3 w-14">{t("ใช้", "On")}</th>
                                    <th className="px-4 py-3">{t("บัญชีโฆษณา", "Ad Account")}</th>
                                    <th className="px-4 py-3">{t("สถานะ", "Status")}</th>
                                    <th className="px-4 py-3 hidden md:table-cell">{t("Payment", "Payment")}</th>
                                    <th className="px-4 py-3 hidden md:table-cell">{t("Spend / Limit", "Spend / Limit")}</th>
                                    <th className="px-4 py-3 hidden xl:table-cell">{t("ไทม์โซน", "Timezone")}</th>
                                    <th className="px-4 py-3 hidden xl:table-cell">{t("สกุลเงิน", "Currency")}</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900">
                                {groups.map((group, gi) => (
                                    <React.Fragment key={group.key}>
                                        {/* Business group header */}
                                        <tr className={gi > 0 ? "border-t-2 border-gray-100 dark:border-gray-800" : ""}>
                                            <td colSpan={COL} className="px-5 py-2 bg-gray-50 dark:bg-gray-800/40">
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="w-3.5 h-3.5 text-gray-400 dark:text-gray-400 shrink-0" />
                                                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{group.label}</span>
                                                    <span className="text-xs text-gray-400 dark:text-gray-400">({group.accounts.length} {t("บัญชี", "accounts")})</span>
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Account rows */}
                                        {group.accounts.map((a) => (
                                            <tr key={a.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-t border-gray-100 dark:border-gray-800">
                                                {/* Toggle */}
                                                <td className="px-5 py-3">
                                                    <button type="button" role="switch" aria-checked={a.enabled}
                                                        disabled={togglingId === a.id}
                                                        onClick={() => onToggleAccount(a.id, !a.enabled)}
                                                        className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed ${a.enabled ? "bg-brand-500" : "bg-gray-300 dark:bg-gray-700"}`}>
                                                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${a.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                                                    </button>
                                                </td>

                                                {/* Name + ID */}
                                                <td className="px-4 py-3">
                                                    <div className="font-medium text-gray-900 dark:text-gray-100">{a.name || "—"}</div>
                                                    <div className="font-mono text-xs text-gray-400 dark:text-gray-400">{a.accountId}</div>
                                                </td>

                                                {/* Status */}
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(a.accountStatus)}`}>
                                                        {a.accountStatusLabel}
                                                    </span>
                                                </td>

                                                {/* Payment method */}
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    <PaymentCell src={a.fundingSource} />
                                                </td>

                                                {/* Spend / Limit */}
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    <SpendCell spent={a.amountSpent} cap={a.spendCap} currency={a.currency} t={t} />
                                                </td>

                                                {/* Timezone */}
                                                <td className="px-4 py-3 hidden xl:table-cell">
                                                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTimezone(a.timezoneName)}</span>
                                                </td>

                                                {/* Currency */}
                                                <td className="px-4 py-3 hidden xl:table-cell text-xs text-gray-500 dark:text-gray-400">
                                                    {a.currency || "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0 flex justify-end bg-white dark:bg-gray-900 rounded-b-2xl">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                        {t("ปิด", "Close")}
                    </button>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Payment cell                                                         */
/* ------------------------------------------------------------------ */
const BRAND_ICON: Record<string, string> = {
    visa: "/visa.svg",
    mastercard: "/mastercard.svg",
    unionpay: "/unionpay.svg",
};

const BRAND_FALLBACK_LABEL: Record<string, string> = {
    amex: "AMEX",
    paypal: "PayPal",
    other: "Card",
};

function PaymentCell({ src }: { src: FundingSource | null }) {
    const brand = detectCardBrand(src);
    if (!brand || !src) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>;

    const last4 = extractLast4(src.display_string);
    const iconSrc = BRAND_ICON[brand];

    return (
        <div className="flex items-center gap-1.5">
            {iconSrc ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={iconSrc} alt={brand} className="h-5 w-auto object-contain" />
            ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
                    {BRAND_FALLBACK_LABEL[brand] ?? brand.toUpperCase()}
                </span>
            )}
            {last4 && <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">****{last4}</span>}
            {!last4 && src.display_string && (
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[100px]">{src.display_string}</span>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Spend / Limit cell                                                   */
/* ------------------------------------------------------------------ */
function SpendCell({ spent, cap, currency, t }: {
    spent: number | null; cap: number | null; currency: string | null;
    t: (th: string, en: string) => string;
}) {
    if (spent == null) return <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>;

    const hasLimit = cap != null && cap > 0;
    const pct = hasLimit ? Math.min((spent / cap!) * 100, 100) : 0;
    const barColor = pct >= 90 ? "bg-red-400" : pct >= 70 ? "bg-amber-400" : "bg-brand-500";

    return (
        <div className="min-w-[120px]">
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="text-gray-700 dark:text-gray-300 font-medium">{formatMoney(spent, currency)}</span>
                {hasLimit ? (
                    <span className="text-gray-400 dark:text-gray-500">{formatMoney(cap, currency)}</span>
                ) : (
                    <span className="text-gray-300 dark:text-gray-600">{t("ไม่จำกัด", "No limit")}</span>
                )}
            </div>
            {hasLimit && (
                <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
            )}
            {hasLimit && (
                <div className="text-right text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{pct.toFixed(0)}%</div>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                       */
/* ------------------------------------------------------------------ */
function MetaIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" className={className} aria-hidden="true">
            <path fill="#1877F2" d="M640 381.9C640 473.2 600.6 530.4 529.7 530.4C467.1 530.4 433.9 495.8 372.8 393.8L341.4 341.2C333.1 328.7 326.9 317 320.2 306.2C300.1 340 273.1 389.2 273.1 389.2C206.1 505.8 168.5 530.4 116.2 530.4C43.4 530.4 0 473.1 0 384.5C0 241.5 79.8 106.4 183.9 106.4C234.1 106.4 277.7 131.1 328.7 195.9C365.8 145.8 406.8 106.4 459.3 106.4C558.4 106.4 640 232.1 640 381.9zM287.4 256.2C244.5 194.1 216.5 175.7 183 175.7C121.1 175.7 69.2 281.8 69.2 385.7C69.2 434.2 87.7 461.4 118.8 461.4C149 461.4 167.8 442.4 222 357.6C222 357.6 246.7 318.5 287.4 256.2zM531.2 461.4C563.4 461.4 578.1 433.9 578.1 386.5C578.1 262.3 523.8 161.1 454.9 161.1C421.7 161.1 393.8 187 360 239.1C369.4 252.9 379.1 268.1 389.3 284.5L426.8 346.9C485.5 441 500.3 461.4 531.2 461.4z" />
        </svg>
    );
}

function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${connected ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30" : "bg-gray-50 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-400"}`} />
            {label}
        </span>
    );
}

function ConnectorCard({ iconSrc, title, subtitle, status, connectedLabel, disconnectedLabel }: {
    iconSrc: string; title: string; subtitle: string; status: boolean | null;
    connectedLabel: string; disconnectedLabel: string;
}) {
    return (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/60 dark:shadow-none p-5">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconSrc} alt={title} width={22} height={22} className="w-[22px] h-[22px]" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</p>
                    <p className="text-sm text-gray-400 dark:text-gray-400 truncate">{subtitle}</p>
                </div>
            </div>
            <div className="mt-4">
                {status === null ? (
                    <span className="inline-flex items-center gap-2 text-xs text-gray-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </span>
                ) : (
                    <StatusBadge connected={status} label={status ? connectedLabel : disconnectedLabel} />
                )}
            </div>
        </div>
    );
}
