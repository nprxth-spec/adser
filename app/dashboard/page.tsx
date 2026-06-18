"use client";

import { useState, useEffect, useRef } from "react";
import { useSession, signOut } from "next-auth/react";
import {
    Upload,
    FileText,
    CheckCircle2,
    AlertCircle,
    Loader2,
    CloudUpload,
    Sparkles,
    HardDrive,
    Sheet,
    X,
    Zap,
    TrendingUp,
    DollarSign,
    ExternalLink,
} from "lucide-react";
import { useDashboardUpload, type UploadStage, type ActiveFile } from "@/components/DashboardUploadContext";
import Link from "next/link";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

const stages: { key: UploadStage; icon: any }[] = [
    { key: "uploading", icon: CloudUpload },
    { key: "extracting", icon: Sparkles },
    { key: "drive", icon: HardDrive },
    { key: "sheets", icon: Sheet },
];

// ─── Types ────────────────────────────────────────────────────────────────────
interface RecentUpload {
    id: string;
    filename: string;
    invoiceDate: string | null;
    cardLast4: string | null;
    amount: number | null;
    currency: string | null;
    driveLink: string | null;
    status: string;
    createdAt: string;
}

// ─── Recent Uploads Panel (table style — same as history page) ───────────────
function RecentUploads({ refreshKey }: { refreshKey: number }) {
    const { t } = useAppPreferences();
    const [files, setFiles] = useState<RecentUpload[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch("/api/history?limit=10")
            .then((r) => r.json())
            .then((data) => {
                setFiles(data.logs ?? []);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [refreshKey]);

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between shrink-0">
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("ไฟล์ล่าสุด", "Recent Files")}</h2>
                <Link
                    href="/history"
                    className="text-sm text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium transition-colors"
                >
                    {t("ดูทั้งหมด", "View all")} →
                </Link>
            </div>

            {/* Body */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
                </div>
            ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
                        <FileText className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">{t("ยังไม่มีไฟล์ที่ประมวลผล", "No files processed yet")}</p>
                    <p className="text-gray-400 dark:text-gray-500 text-xs mt-1">
                        {t("อัปโหลดใบแจ้งหนี้ PDF ไฟล์แรกเพื่อเริ่มต้น", "Drop your first PDF invoice to get started.")}
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1080px] text-sm table-auto">
                        <colgroup>
                            <col style={{ width: "150px" }} />
                            <col style={{ width: "34%" }} />
                            <col style={{ width: "120px" }} />
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "120px" }} />
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "80px" }} />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                {[
                                    t("วันที่", "Date"),
                                    t("ชื่อไฟล์", "Filename"),
                                    t("วันที่เรียกเก็บ", "Invoice Date"),
                                    t("บัตร", "Card"),
                                    t("จำนวนเงิน", "Amount"),
                                    t("สถานะ", "Status"),
                                    t("ไฟล์", "File"),
                                ].map((h) => (
                                    <th
                                        key={h}
                                        className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide whitespace-nowrap"
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {files.map((log, i) => (
                                <tr
                                    key={log.id}
                                    className={`border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors ${
                                        i % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/50"
                                    }`}
                                >
                                    {/* Processed date */}
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                                        {new Date(log.createdAt).toLocaleString(undefined, {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                        })}
                                    </td>

                                    {/* Filename */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center shrink-0">
                                                <FileText className="w-3 h-3 text-brand-500 dark:text-brand-400" />
                                            </div>
                                            <span
                                                className="font-medium text-gray-800 dark:text-gray-200 block max-w-[380px] truncate text-xs"
                                                title={log.filename}
                                            >
                                                {log.filename}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Invoice Date */}
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 text-xs whitespace-nowrap">
                                        {log.invoiceDate ?? <span className="text-gray-300 dark:text-gray-700">—</span>}
                                    </td>

                                    {/* Card */}
                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400 font-mono text-xs whitespace-nowrap">
                                        {log.cardLast4 ? log.cardLast4 : <span className="text-gray-300 dark:text-gray-700">—</span>}
                                    </td>

                                    {/* Amount */}
                                    <td className="px-4 py-3 text-gray-800 dark:text-gray-200 font-semibold text-xs whitespace-nowrap">
                                        {log.amount != null ? (
                                            <>
                                                <span className="text-gray-400 dark:text-gray-500 font-normal mr-1">{log.currency}</span>
                                                {log.amount.toLocaleString()}
                                            </>
                                        ) : (
                                            <span className="text-gray-300 dark:text-gray-700">—</span>
                                        )}
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                                            log.status === "success"
                                                ? "bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                                                : log.status === "review"
                                                ? "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                                                : "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                                        }`}>
                                            {log.status === "error" && <AlertCircle className="w-3 h-3 text-red-500 dark:text-red-400" />}
                                            {log.status === "success" ? t("สำเร็จ", "Success")
                                                : log.status === "review" ? t("รอตรวจสอบ", "Review")
                                                : t("ผิดพลาด", "Error")}
                                        </span>
                                    </td>

                                    {/* Drive link */}
                                    <td className="px-4 py-3">
                                        {log.driveLink ? (
                                            <a
                                                href={log.driveLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 font-medium text-xs transition-colors"
                                            >
                                                {t("เปิด", "View")} <ExternalLink className="w-3 h-3" />
                                            </a>
                                        ) : (
                                            <span className="text-gray-300 dark:text-gray-700">—</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Main Dashboard Page ──────────────────────────────────────────────────────
export default function DashboardPage() {
    const { t } = useAppPreferences();
    const { data: session } = useSession();
    const upload = useDashboardUpload();
    const {
        queue,
        currentIndex,
        results,
        stage,
        showBatchComplete,
        duplicateAlertFilename,
        dismissDuplicateAlert,
        getRootProps,
        getInputProps,
        isDragActive,
        resetState,
        acknowledgeBatchComplete,
        requestSessionUpdate,
        isProcessing,
        currentFile,
        cancelUpload,
        activeFiles,
        completedCount,
    } = upload;

    const [refreshKey, setRefreshKey] = useState(0);

    const missingFieldLabels: Record<string, string> = {
        card_prefix: t("รหัสบัตร", "Card prefix"),
        date: t("วันที่", "Date"),
        reference_number: t("เลขอ้างอิง", "Reference number"),
        billed_to: t("ผู้ถูกเรียกเก็บ", "Billed to"),
    };

    const batchSummary = results.reduce(
        (summary, item) => {
            if ("error" in item) {
                const isDuplicate =
                    item.code === "DUPLICATE_FILE" ||
                    item.status === 409 ||
                    /duplicate|ไฟล์ซ้ำ|ซ้ำ/i.test(item.error);
                if (isDuplicate) summary.duplicate += 1;
                else summary.failed += 1;
                return summary;
            }

            if (item.requiresReview) {
                summary.review += 1;
                for (const field of item.missingFields ?? []) {
                    summary.missingFields[field] = (summary.missingFields[field] ?? 0) + 1;
                }
            } else {
                summary.success += 1;
            }
            return summary;
        },
        {
            success: 0,
            review: 0,
            duplicate: 0,
            failed: 0,
            missingFields: {} as Record<string, number>,
        },
    );

    const missingFieldSummary = Object.entries(batchSummary.missingFields)
        .sort((a, b) => b[1] - a[1])
        .map(([field, count]) => `${missingFieldLabels[field] ?? field} ${count}`);


    // Bump refreshKey when a batch finishes (results change from 0 → N)
    const prevResultsLen = useRef(0);
    useEffect(() => {
        if (results.length > 0 && results.length !== prevResultsLen.current) {
            setRefreshKey((k) => k + 1);
        }
        prevResultsLen.current = results.length;
    }, [results.length]);

    const [spreadsheetTitle, setSpreadsheetTitle] = useState<string | null>(null);
    const [effectiveSheetId, setEffectiveSheetId] = useState<string>("");
    const [effectiveSheetName, setEffectiveSheetName] = useState<string>("");
    const [effectiveSheetGid, setEffectiveSheetGid] = useState<number | null>(null);

    // Cache of titles already resolved per sheetId — prevents re-flashing "Loading…" between re-renders
    const titleCacheRef = useRef<Map<string, string>>(new Map());
    const userId = (session?.user as any)?.id as string | undefined;
    const sessionSheetId = ((session?.user as any)?.sheetId as string | undefined) ?? "";
    const sessionSheetName = ((session?.user as any)?.sheetName as string | undefined) ?? "";
    const sessionSheetGid = ((session?.user as any)?.sheetGid as number | null | undefined) ?? null;

    // Resolve current sheet destination from active integrations profile (fallback to session fields).
    // Re-runs only when the user changes — not on every NextAuth session refresh — so the sheet
    // pill doesn't flicker when the tab regains focus.
    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const setIfChanged = <T,>(setter: (v: T) => void, prev: T, next: T) => {
            if (prev !== next) setter(next);
        };
        const loadSheetDestination = async () => {
            try {
                const res = await fetch("/api/integrations", { method: "GET" });
                const data = await res.json();
                if (!res.ok || cancelled) return;
                const profiles = Array.isArray(data?.data?.profiles) ? data.data.profiles : [];
                const activeProfileId = (data?.data?.activeProfileId as string | null | undefined) ?? null;
                const activeProfile =
                    profiles.find((p: any) => p?.id === activeProfileId) ??
                    profiles[0] ??
                    null;

                if (activeProfile) {
                    const nextId = String(activeProfile.sheetId ?? "");
                    const nextName = String(activeProfile.sheetName ?? "");
                    const nextGid = typeof activeProfile.sheetGid === "number" ? activeProfile.sheetGid : null;
                    setEffectiveSheetId((cur) => (cur === nextId ? cur : nextId));
                    setEffectiveSheetName((cur) => (cur === nextName ? cur : nextName));
                    setEffectiveSheetGid((cur) => (cur === nextGid ? cur : nextGid));
                    return;
                }
                // No active integration profile — fall back to session values.
                setIfChanged(setEffectiveSheetId, effectiveSheetId, sessionSheetId);
                setIfChanged(setEffectiveSheetName, effectiveSheetName, sessionSheetName);
                setIfChanged(setEffectiveSheetGid, effectiveSheetGid, sessionSheetGid);
            } catch {
                // On network error, only seed from session if we have nothing yet.
                setEffectiveSheetId((cur) => (cur ? cur : sessionSheetId));
                setEffectiveSheetName((cur) => (cur ? cur : sessionSheetName));
                setEffectiveSheetGid((cur) => (cur != null ? cur : sessionSheetGid));
            }
        };

        void loadSheetDestination();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // Load spreadsheet title — uses an in-memory cache so re-renders don't flash "Loading…".
    useEffect(() => {
        const sheetId = effectiveSheetId || undefined;
        if (!sheetId) { setSpreadsheetTitle(null); return; }
        const cached = titleCacheRef.current.get(sheetId);
        if (cached !== undefined) {
            setSpreadsheetTitle(cached);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/google/sheets/title?sheetId=${encodeURIComponent(sheetId)}`);
                const data = await res.json();
                if (cancelled) return;
                if (res.ok && data?.data?.title !== undefined) {
                    const title = data.data.title as string;
                    titleCacheRef.current.set(sheetId, title);
                    setSpreadsheetTitle(title);
                } else {
                    titleCacheRef.current.set(sheetId, "");
                    setSpreadsheetTitle("");
                }
            } catch {
                if (!cancelled) {
                    titleCacheRef.current.set(sheetId, "");
                    setSpreadsheetTitle("");
                }
            }
        })();
        return () => { cancelled = true; };
    }, [effectiveSheetId]);

    const loadGoogleApiScript = () =>
        new Promise<void>((resolve, reject) => {
            if (typeof window === "undefined") return reject(new Error("Window not available"));

            const onReady = () => {
                const gapi = (window as any).gapi;
                if (!gapi || !gapi.load) { reject(new Error("gapi not available")); return; }
                gapi.load("picker", { callback: () => resolve() });
            };

            if ((window as any).gapi && (window as any).google && (window as any).google.picker) {
                resolve(); return;
            }
            if ((window as any).gapi) { onReady(); return; }

            const existing = document.querySelector<HTMLScriptElement>("script[data-google-api='true']");
            if (existing) {
                existing.addEventListener("load", onReady);
                existing.addEventListener("error", () => reject(new Error("Failed to load Google API script")));
                return;
            }

            const script = document.createElement("script");
            script.src = "https://apis.google.com/js/api.js";
            script.async = true;
            script.defer = true;
            script.dataset.googleApi = "true";
            script.onload = onReady;
            script.onerror = () => reject(new Error("Failed to load Google API script"));
            document.body.appendChild(script);
        });

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
                {/* ── Duplicate Alert ── */}
                {duplicateAlertFilename && (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 text-amber-800 dark:text-amber-300">
                        <AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="flex-1 text-sm font-medium">
                            ไฟล์ <span className="font-semibold">{duplicateAlertFilename}</span> ซ้ำแล้ว — ประมวลผลไปแล้ว ไม่มีการอัปโหลดซ้ำ
                        </p>
                        <button
                            type="button"
                            onClick={dismissDuplicateAlert}
                            className="shrink-0 rounded-md p-1.5 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors cursor-pointer"
                            aria-label={t("ปิด", "Close")}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* ── Dashboard Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("อัปโหลด", "Upload")}</h1>
                        <p className="text-gray-500 dark:text-gray-450 text-sm mt-0.5">
                            {t("ติดตามการประมวลผลใบแจ้งหนี้ของคุณ", "Monitor your invoice processing pipeline")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isProcessing && (
                            <button
                                onClick={cancelUpload}
                                className="flex items-center gap-1.5 px-4 py-2 bg-red-50 dark:bg-red-950/20 rounded-lg border border-red-200 dark:border-red-900/50 text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/30 transition-colors shadow-sm cursor-pointer"
                            >
                                <X className="w-4 h-4" /> {t("ยกเลิกอัปโหลด", "Cancel Upload")}
                            </button>
                        )}
                        {(stage === "done" || results.length > 0) && (
                            <button
                                onClick={resetState}
                                className="flex items-center gap-1.5 px-4 py-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shadow-sm cursor-pointer"
                            >
                                <X className="w-4 h-4" /> {t("ล้าง", "Clear")}
                            </button>
                        )}
                    </div>
                </div>


                {/* ── Row 1: Drive destination (left) + Drop Zone (right) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* Drive destination — locked */}
                    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
                        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">{t("ปลายทาง Drive", "Drive destination")}</p>

                        <div className="mt-2 rounded-md bg-gray-50 dark:bg-gray-950 border border-gray-100 dark:border-gray-850 px-3.5 py-2.5 space-y-1.5">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{t("ปลายทางซิงก์", "Sync destination")}</p>

                            {/* Drive folder row — auto-managed */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src="/drive.svg"
                                    alt="Google Drive folder"
                                    width={16}
                                    height={16}
                                    className="flex-shrink-0"
                                />
                                <span className="text-gray-500 dark:text-gray-400">
                                    {t("ระบบจัดเก็บอัตโนมัติตามวันที่ใบเสร็จ", "Auto-organised by receipt date")}
                                </span>
                                <span className="text-gray-300 dark:text-gray-750">·</span>
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t("ปี", "Year")}</span>
                                <svg className="w-3 h-3 text-gray-300 dark:text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t("เดือน", "Month")}</span>
                                <svg className="w-3 h-3 text-gray-300 dark:text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 font-medium">
                                    {t("DD/MM/YYYY", "DD/MM/YYYY")}
                                </span>
                            </div>

                            {/* Google Sheet row */}
                                <div className="flex flex-wrap items-center gap-1 text-xs">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/sheet.webp"
                                        alt="Google Sheets"
                                        width={16}
                                        height={16}
                                        className="flex-shrink-0"
                                    />
                                    {effectiveSheetId ? (
                                        <>
                                            {spreadsheetTitle !== null && spreadsheetTitle !== "" && (
                                                <span className="px-1.5 py-0.5 rounded text-gray-400 dark:text-gray-500">
                                                    {spreadsheetTitle}
                                                </span>
                                            )}
                                            {spreadsheetTitle !== null && spreadsheetTitle !== "" && effectiveSheetName && (
                                                <svg className="w-3 h-3 text-gray-300 dark:text-gray-750" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            )}
                                            {effectiveSheetName && (() => {
                                                const spreadsheetId = effectiveSheetId;
                                                const gid = effectiveSheetGid;
                                                const sheetUrl = gid != null
                                                    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${gid}`
                                                    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
                                                return (
                                                    <a
                                                        href={sheetUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400 font-medium hover:bg-green-200 dark:hover:bg-green-900/40 transition-colors"
                                                    >
                                                        {effectiveSheetName}
                                                    </a>
                                                );
                                            })()}
                                            {spreadsheetTitle === null && (
                                                <span className="text-gray-400 dark:text-gray-550">Loading…</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-gray-400 dark:text-gray-550 italic">{t("ยังไม่ตั้งค่า — ไปตั้งค่าใน Integrations", "Not set — configure in Integrations")}</span>
                                    )}
                                </div>
                            </div>

                        </div>
                                        {/* Drop Zone + Results */}
                    <div className="flex flex-col gap-4 h-full">
                        <div
                            {...getRootProps()}
                            className={`flex-1 flex flex-col items-center justify-center min-h-[220px] relative rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
                                isDragActive
                                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20"
                                    : stage === "done"
                                    ? "border-green-400 bg-green-50 dark:border-green-500 dark:bg-green-950/20"
                                    : "border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50/30 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-brand-400 dark:hover:bg-brand-950/10"
                            }`}
                        >
                            <input {...getInputProps()} />

                            {stage === "idle" && (
                                <div>
                                    <div className="w-12 h-12 rounded-lg bg-brand-50 dark:bg-brand-950/30 flex items-center justify-center mx-auto mb-3">
                                        <Upload className="w-6 h-6 text-brand-500 dark:text-brand-400" />
                                    </div>
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">
                                        {isDragActive ? t("วางไฟล์ PDF ที่นี่…", "Drop PDFs here…") : t("ลากและวางไฟล์ใบแจ้งหนี้ PDF", "Drag & drop invoice PDFs")}
                                    </p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                                        Select or drop multiple files at once
                                    </p>
                                    <span className="inline-block px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500 dark:text-gray-400">
                                        {t("เฉพาะ PDF", "PDF only")}
                                    </span>
                                </div>
                            )}

                            {isProcessing && activeFiles.length > 0 && (
                                <div className="w-full space-y-2">
                                    <div className="flex items-center justify-between mb-1">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                            {t("กำลังประมวลผล", "Processing")}
                                            <span className="ml-1 text-brand-600 dark:text-brand-400">{completedCount}/{queue.length}</span>
                                            <span className="ml-1 text-gray-400 dark:text-gray-500">{t("ไฟล์", "files")}</span>
                                        </p>
                                        <Loader2 className="w-3 h-3 animate-spin text-brand-500 dark:text-brand-400" />
                                    </div>
                                    {activeFiles.map((af: ActiveFile) => {
                                        const pct = af.stage === "uploading" ? 25 : af.stage === "extracting" ? 60 : af.stage === "drive" ? 85 : af.stage === "sheets" ? 95 : 100;
                                        const stageLabel = af.stage === "uploading" ? t("อัปโหลด", "Uploading") : af.stage === "extracting" ? t("AI ดึงข้อมูล", "AI Extract") : af.stage === "drive" ? t("Drive", "Drive") : af.stage === "sheets" ? t("Sheets", "Sheets") : t("เสร็จ", "Done");
                                        return (
                                            <div key={af.index} className="bg-gray-50 dark:bg-gray-800/50 rounded-md px-3 py-2">
                                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                                    <p className="text-[11px] font-medium text-gray-700 dark:text-gray-300 truncate flex-1">{af.file.name}</p>
                                                    <span className="text-[10px] text-brand-600 dark:text-brand-400 font-semibold shrink-0">{stageLabel}</span>
                                                </div>
                                                <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-brand-500 dark:bg-brand-400 rounded-full transition-all duration-700 ease-out"
                                                        style={{ width: `${pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {completedCount > 0 && (
                                        <p className="text-[10px] text-gray-400 dark:text-gray-550 text-center">
                                            {t(`เสร็จแล้ว ${completedCount} ไฟล์`, `${completedCount} file${completedCount > 1 ? "s" : ""} done`)}
                                        </p>
                                    )}
                                </div>
                            )}

                            {stage === "done" && (
                                <div>
                                    <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center mx-auto mb-2">
                                        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                                    </div>
                                    <p className="font-semibold text-green-700 dark:text-green-400 mb-1">{t("เสร็จสิ้นทั้งชุด!", "Batch Complete!")}</p>
                                    <p className="text-gray-500 dark:text-gray-400 text-xs">
                                        {t(`ประมวลผลแล้ว ${results.length} ไฟล์`, `Processed ${results.length} file${results.length > 1 ? "s" : ""}`)}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Results List (compact) */}
                        {results.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-355">{t("ผลการประมวลผล", "Processing Results")}</h3>
                                {results.map((res, idx) => {
                                    if ("error" in res) {
                                        return (
                                            <div key={idx} className="bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 rounded-lg p-3 flex items-start gap-3">
                                                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-red-900 dark:text-red-200 truncate">{res.filename}</p>
                                                    <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">{res.error}</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={idx} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg p-3 flex items-center gap-3 shadow-sm">
                                            <div className="w-8 h-8 rounded-full bg-green-50 dark:bg-green-950/30 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-green-500 dark:text-green-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">{res.filename}</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                    {res.amount?.toLocaleString()} {res.currency} · {res.date}
                                                </p>
                                            </div>
                                            {res.driveLink && (
                                                <a
                                                    href={res.driveLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-md border border-brand-100 dark:border-brand-900/50 bg-brand-50 dark:bg-brand-950/30 text-brand-600 dark:text-brand-400 text-xs font-semibold hover:bg-brand-100"
                                                >
                                                    <HardDrive className="w-3 h-3" /> Drive
                                                </a>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Row 2: Recent Files (full width) ── */}
                <RecentUploads refreshKey={refreshKey} />

                {/* ── Batch Complete Modal ── */}
                {showBatchComplete && (
                    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
                        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 border dark:border-gray-800">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-9 h-9 rounded-full bg-green-100 dark:bg-green-950/30 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                                </div>
                                <div>
                                    <p className="text-base font-semibold text-gray-900 dark:text-gray-100">{t("เสร็จสิ้นทั้งชุด!", "Batch Complete!")}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {t(`ประมวลผลแล้ว ${results.length} ไฟล์ ดูรายละเอียดด้านล่าง`, `Processed ${results.length} file${results.length > 1 ? "s" : ""}. See the details below.`)}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <div className="rounded-lg border border-green-100 dark:border-green-900/30 bg-green-50 dark:bg-green-950/20 px-3 py-2">
                                    <p className="text-[11px] font-medium text-green-700 dark:text-green-400">{t("สำเร็จ", "Success")}</p>
                                    <p className="text-lg font-semibold text-green-900 dark:text-green-200">{batchSummary.success}</p>
                                </div>
                                <div className="rounded-lg border border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                                    <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{t("ต้องตรวจสอบ", "Needs Review")}</p>
                                    <p className="text-lg font-semibold text-green-900 dark:text-green-200">{batchSummary.review}</p>
                                </div>
                                <div className="rounded-lg border border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-950/20 px-3 py-2">
                                    <p className="text-[11px] font-medium text-orange-700 dark:text-orange-400">{t("ไฟล์ซ้ำ", "Duplicate")}</p>
                                    <p className="text-lg font-semibold text-green-900 dark:text-green-200">{batchSummary.duplicate}</p>
                                </div>
                                <div className="rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-950/20 px-3 py-2">
                                    <p className="text-[11px] font-medium text-red-700 dark:text-red-400">{t("ไม่สำเร็จ", "Failed")}</p>
                                    <p className="text-lg font-semibold text-green-900 dark:text-green-200">{batchSummary.failed}</p>
                                </div>
                            </div>
                            {missingFieldSummary.length > 0 && (
                                <div className="mb-4 rounded-lg border border-amber-100 dark:border-amber-900/30 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
                                    <p className="text-xs font-semibold text-amber-900 dark:text-amber-300 mb-1">
                                        {t("ข้อมูลที่ขาด", "Missing fields")}
                                    </p>
                                    <p className="text-xs text-amber-800 dark:text-amber-400 leading-relaxed">
                                        {missingFieldSummary.join(" / ")}
                                    </p>
                                </div>
                            )}
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={acknowledgeBatchComplete}
                                    className="px-4 py-2 rounded-lg landing-accent-bg text-white text-sm font-medium hover:opacity-95 cursor-pointer"
                                >
                                    {t("ตกลง", "OK")}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
    );
}
