"use client";

import { useEffect, useState } from "react";
import {
    CheckCircle2,
    Loader2,
    RefreshCw,
    Plug,
    AlertTriangle,
    Link2Off,
} from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

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

const statusTone = (status: number | null): string => {
    if (status === 1) return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (status == null) return "bg-slate-50 text-slate-500 border-slate-200";
    return "bg-amber-50 text-amber-700 border-amber-200";
};

export default function ConnectorsPage() {
    const { t } = useAppPreferences();

    const [meta, setMeta] = useState<MetaData | null>(null);
    const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [disconnecting, setDisconnecting] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    const loadMeta = async () => {
        const res = await fetch("/api/connectors/meta");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load Meta connection");
        setMeta(data.data as MetaData);
    };

    useEffect(() => {
        // Surface OAuth result from the callback redirect, then clean the URL.
        const params = new URLSearchParams(window.location.search);
        if (params.get("meta") === "connected") {
            setNotice(t("เชื่อมต่อ Meta Ads สำเร็จ", "Meta Ads connected successfully"));
        }
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
        if (params.has("meta") || params.has("meta_error")) {
            window.history.replaceState(null, "", window.location.pathname);
        }
    }, [t]);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                await loadMeta();
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to load connectors");
            }
            setLoading(false);
        };
        load();

        // Reflect real Google connection status (Drive + Sheets share the Google login).
        fetch("/api/google/connection-status")
            .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
            .then(({ ok, j }) => setGoogleConnected(ok && Boolean(j?.data?.connected)))
            .catch(() => setGoogleConnected(false));
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        setError("");
        setNotice("");
        try {
            const res = await fetch("/api/connectors/meta/sync", { method: "POST" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Sync failed");
            await loadMeta();
            setNotice(
                t(
                    `ดึงข้อมูลสำเร็จ: ${data.data.count} บัญชีโฆษณา`,
                    `Synced ${data.data.count} ad accounts`,
                ),
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Sync failed");
        }
        setSyncing(false);
    };

    const handleDisconnect = async () => {
        setDisconnecting(true);
        setError("");
        setNotice("");
        try {
            const res = await fetch("/api/connectors/meta", { method: "DELETE" });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Disconnect failed");
            await loadMeta();
            setNotice(t("ตัดการเชื่อมต่อ Meta แล้ว", "Meta disconnected"));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Disconnect failed");
        }
        setDisconnecting(false);
    };

    return (
        <div className="max-w-4xl mx-auto pb-12 w-full min-w-0">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 mb-1">
                    {t("คอนเนคเตอร์", "Connectors")}
                </h1>
                <p className="text-slate-500">
                    {t(
                        "เชื่อมต่อแหล่งข้อมูลเพื่อดึงและส่งข้อมูลเข้า Google Sheets",
                        "Connect data sources to pull and push data into Google Sheets.",
                    )}
                </p>
            </div>

            {notice && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{notice}</span>
                </div>
            )}
            {error && (
                <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Google Drive */}
                <ConnectorCard
                    iconSrc="/drive.svg"
                    title="Google Drive"
                    subtitle={t("อัปโหลดไฟล์ใบแจ้งหนี้", "Stores invoice files")}
                    status={googleConnected}
                    connectedLabel={t("เชื่อมต่อแล้ว (ผ่านบัญชี Google)", "Connected (via Google sign-in)")}
                    disconnectedLabel={t("ยังไม่เชื่อมต่อ", "Not connected")}
                />
                {/* Google Sheets */}
                <ConnectorCard
                    iconSrc="/sheet.svg"
                    title="Google Sheets"
                    subtitle={t("บันทึกข้อมูลเป็นแถว", "Receives data rows")}
                    status={googleConnected}
                    connectedLabel={t("เชื่อมต่อแล้ว (ผ่านบัญชี Google)", "Connected (via Google sign-in)")}
                    disconnectedLabel={t("ยังไม่เชื่อมต่อ", "Not connected")}
                />
            </div>

            {/* Meta Ads */}
            <div className="bg-white rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/60 p-6">
                <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                            <span className="text-blue-600 font-bold text-lg">f</span>
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-slate-900">Meta Ads</p>
                            <p className="text-sm text-slate-400">
                                {t(
                                    "เชื่อม Facebook เพื่อดึงบัญชีโฆษณา",
                                    "Connect Facebook to pull ad accounts",
                                )}
                            </p>
                        </div>
                    </div>
                    {meta && (
                        <StatusBadge
                            connected={meta.connected}
                            label={
                                meta.connected
                                    ? t("เชื่อมต่อแล้ว", "Connected")
                                    : t("ยังไม่เชื่อมต่อ", "Not connected")
                            }
                        />
                    )}
                </div>

                {loading ? (
                    <div className="py-10 flex items-center justify-center text-slate-400">
                        <Loader2 className="w-5 h-5 animate-spin" />
                    </div>
                ) : !meta?.configured ? (
                    <div className="py-6 text-sm text-slate-500">
                        {t(
                            "ยังไม่ได้ตั้งค่า Meta App — กรุณาตั้งค่า FACEBOOK_APP_ID และ FACEBOOK_APP_SECRET",
                            "Meta app is not configured — set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET.",
                        )}
                    </div>
                ) : !meta.connected ? (
                    <div className="py-6">
                        <a
                            href="/api/connectors/meta/connect"
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1877F2] text-white text-sm font-medium hover:opacity-95 transition-all shadow-sm cursor-pointer"
                        >
                            <Plug className="w-4 h-4" />
                            {t("เชื่อมต่อ Facebook", "Connect Facebook")}
                        </a>
                        <p className="text-xs text-slate-400 mt-3">
                            {t(
                                "ดึงข้อมูล: ID บัญชีโฆษณา, สถานะ, ไทม์โซน, บัญชีธุรกิจที่ดูแล",
                                "Pulls: ad account IDs, status, timezone, and managed business accounts.",
                            )}
                        </p>
                    </div>
                ) : (
                    <div className="pt-4 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                            <div className="text-sm text-slate-600">
                                {meta.connection?.fbUserName && (
                                    <p>
                                        <span className="text-slate-400">{t("บัญชี", "Account")}: </span>
                                        <span className="font-medium text-slate-800">
                                            {meta.connection.fbUserName}
                                        </span>
                                    </p>
                                )}
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {meta.connection?.lastSyncedAt
                                        ? t(
                                              `ดึงข้อมูลล่าสุด: ${new Date(meta.connection.lastSyncedAt).toLocaleString()}`,
                                              `Last synced: ${new Date(meta.connection.lastSyncedAt).toLocaleString()}`,
                                          )
                                        : t("ยังไม่เคยดึงข้อมูล", "Not synced yet")}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={handleSync}
                                    disabled={syncing}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg landing-accent-bg text-white text-sm font-medium hover:opacity-95 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {syncing ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <RefreshCw className="w-4 h-4" />
                                    )}
                                    {t("ดึงข้อมูล", "Sync now")}
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDisconnect}
                                    disabled={disconnecting}
                                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 disabled:opacity-50 transition-all cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {disconnecting ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Link2Off className="w-4 h-4" />
                                    )}
                                    {t("ตัดการเชื่อมต่อ", "Disconnect")}
                                </button>
                            </div>
                        </div>

                        {meta.adAccounts.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm text-slate-400">
                                {t(
                                    'ยังไม่มีข้อมูล — กด "ดึงข้อมูล" เพื่อโหลดบัญชีโฆษณา',
                                    'No data yet — click "Sync now" to load ad accounts.',
                                )}
                            </div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                            <th className="px-4 py-2.5">{t("บัญชีโฆษณา", "Ad account")}</th>
                                            <th className="px-4 py-2.5">{t("สถานะ", "Status")}</th>
                                            <th className="px-4 py-2.5">{t("ไทม์โซน", "Timezone")}</th>
                                            <th className="px-4 py-2.5">{t("บัญชีธุรกิจ", "Business")}</th>
                                            <th className="px-4 py-2.5">{t("สกุลเงิน", "Currency")}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {meta.adAccounts.map((a) => (
                                            <tr key={a.id} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-2.5">
                                                    <div className="font-medium text-slate-800">
                                                        {a.name || "—"}
                                                    </div>
                                                    <div className="font-mono text-xs text-slate-400">
                                                        {a.accountId}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <span
                                                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusTone(a.accountStatus)}`}
                                                    >
                                                        {a.accountStatusLabel}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-600">
                                                    {a.timezoneName || "—"}
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-600">
                                                    {a.businessName || "—"}
                                                    {a.businessId && (
                                                        <span className="block font-mono text-xs text-slate-400">
                                                            {a.businessId}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5 text-slate-600">
                                                    {a.currency || "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

function StatusBadge({ connected, label }: { connected: boolean; label: string }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${
                connected
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-slate-50 text-slate-500 border-slate-200"
            }`}
        >
            <span
                className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-slate-400"}`}
            />
            {label}
        </span>
    );
}

function ConnectorCard({
    iconSrc,
    title,
    subtitle,
    status,
    connectedLabel,
    disconnectedLabel,
}: {
    iconSrc: string;
    title: string;
    subtitle: string;
    status: boolean | null;
    connectedLabel: string;
    disconnectedLabel: string;
}) {
    return (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/60 p-5">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={iconSrc} alt={title} width={22} height={22} className="w-[22px] h-[22px]" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 truncate">{title}</p>
                    <p className="text-sm text-slate-400 truncate">{subtitle}</p>
                </div>
            </div>
            <div className="mt-4">
                {status === null ? (
                    <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    </span>
                ) : (
                    <StatusBadge connected={status} label={status ? connectedLabel : disconnectedLabel} />
                )}
            </div>
        </div>
    );
}
