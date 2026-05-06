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
    ChevronDown,
    Trash2,
    Zap,
    TrendingUp,
    DollarSign,
    ExternalLink,
} from "lucide-react";
import { useDashboardUpload, type UploadStage } from "@/components/DashboardUploadContext";
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
    const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
    const [confirmId, setConfirmId] = useState<string | null>(null);

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

    const handleDelete = async (id: string) => {
        setDeletingIds((prev) => {
            const next = new Set(prev);
            next.add(id);
            return next;
        });
        setConfirmId(null);
        try {
            const res = await fetch(`/api/history/${id}`, { method: "DELETE" });
            const data = await res.json().catch(() => null);
            if (!res.ok) throw new Error(data?.error ?? t("ลบไม่สำเร็จ", "Failed to delete"));
            setFiles((prev) => prev.filter((f) => f.id !== id));
        } catch (err: any) {
            window.alert(err?.message ?? t("ลบรายการไม่สำเร็จ", "Failed to delete record"));
        } finally {
            setDeletingIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
                <h2 className="font-semibold text-slate-900">{t("ไฟล์ล่าสุด", "Recent Files")}</h2>
                <Link
                    href="/history"
                    className="text-sm text-teal-600 hover:text-teal-800 font-medium transition-colors"
                >
                    {t("ดูทั้งหมด", "View all")} →
                </Link>
            </div>

            {/* Body */}
            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-teal-500 animate-spin" />
                </div>
            ) : files.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                        <FileText className="w-6 h-6 text-slate-400" />
                    </div>
                    <p className="text-slate-500 text-sm font-medium">{t("ยังไม่มีไฟล์ที่ประมวลผล", "No files processed yet")}</p>
                    <p className="text-slate-400 text-xs mt-1">
                        {t("อัปโหลดใบแจ้งหนี้ PDF ไฟล์แรกเพื่อเริ่มต้น", "Drop your first PDF invoice to get started.")}
                    </p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[1180px] text-sm table-auto">
                        <colgroup>
                            <col style={{ width: "150px" }} />
                            <col style={{ width: "34%" }} />
                            <col style={{ width: "120px" }} />
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "120px" }} />
                            <col style={{ width: "95px" }} />
                            <col style={{ width: "80px" }} />
                            <col style={{ width: "110px" }} />
                        </colgroup>
                        <thead>
                            <tr className="border-b border-slate-100">
                                {[
                                    t("วันที่", "Date"),
                                    t("ชื่อไฟล์", "Filename"),
                                    t("วันที่เรียกเก็บ", "Invoice Date"),
                                    t("บัตร", "Card"),
                                    t("จำนวนเงิน", "Amount"),
                                    t("สถานะ", "Status"),
                                    t("ไฟล์", "File"),
                                    t("การทำงาน", "Action"),
                                ].map((h) => (
                                    <th
                                        key={h}
                                        className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap"
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
                                    className={`border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                                        i % 2 === 0 ? "bg-white" : "bg-slate-50/30"
                                    } ${deletingIds.has(log.id) ? "opacity-40" : ""}`}
                                >
                                    {/* Processed date */}
                                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap text-xs">
                                        {new Date(log.createdAt).toLocaleString(undefined, {
                                            dateStyle: "short",
                                            timeStyle: "short",
                                        })}
                                    </td>

                                    {/* Filename */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-md bg-teal-50 flex items-center justify-center shrink-0">
                                                <FileText className="w-3 h-3 text-teal-500" />
                                            </div>
                                            <span
                                                className="font-medium text-slate-800 block max-w-[380px] truncate text-xs"
                                                title={log.filename}
                                            >
                                                {log.filename}
                                            </span>
                                        </div>
                                    </td>

                                    {/* Invoice Date */}
                                    <td className="px-4 py-3 text-slate-600 text-xs whitespace-nowrap">
                                        {log.invoiceDate ?? <span className="text-slate-300">—</span>}
                                    </td>

                                    {/* Card */}
                                    <td className="px-4 py-3 text-slate-600 font-mono text-xs whitespace-nowrap">
                                        {log.cardLast4 ? log.cardLast4 : <span className="text-slate-300">—</span>}
                                    </td>

                                    {/* Amount */}
                                    <td className="px-4 py-3 text-slate-800 font-semibold text-xs whitespace-nowrap">
                                        {log.amount != null ? (
                                            <>
                                                <span className="text-slate-400 font-normal mr-1">{log.currency}</span>
                                                {log.amount.toLocaleString()}
                                            </>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* Status */}
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                            log.status === "success"
                                                ? "bg-green-50 text-green-700"
                                                : "bg-red-50 text-red-600"
                                        }`}>
                                            {log.status === "error" && <AlertCircle className="w-3 h-3" />}
                                            {log.status}
                                        </span>
                                    </td>

                                    {/* Drive link */}
                                    <td className="px-4 py-3">
                                        {log.driveLink ? (
                                            <a
                                                href={log.driveLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-teal-600 hover:text-teal-800 font-medium text-xs transition-colors"
                                            >
                                                {t("เปิด", "View")} <ExternalLink className="w-3 h-3" />
                                            </a>
                                        ) : (
                                            <span className="text-slate-300">—</span>
                                        )}
                                    </td>

                                    {/* Action */}
                                    <td className="px-4 py-3">
                                        {confirmId === log.id ? (
                                            <div className="flex items-center gap-1.5">
                                                <button
                                                    onClick={() => handleDelete(log.id)}
                                                    disabled={deletingIds.has(log.id)}
                                                    className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-600 disabled:opacity-50 cursor-pointer inline-flex items-center gap-1"
                                                >
                                                    {deletingIds.has(log.id) ? (
                                                        <>
                                                            <Loader2 className="w-3 h-3 animate-spin" />
                                                            {t("กำลังลบ...", "Deleting...")}
                                                        </>
                                                    ) : (
                                                        t("ยืนยัน", "Confirm")
                                                    )}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmId(null)}
                                                    className="px-2 py-0.5 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-50 cursor-pointer"
                                                >
                                                    {t("ยกเลิก", "Cancel")}
                                                </button>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => setConfirmId(log.id)}
                                                disabled={deletingIds.has(log.id)}
                                                title={t("ลบรายการ ไฟล์ใน Drive และแถวใน Sheets", "Delete record, Drive file, and Sheets row")}
                                                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 cursor-pointer"
                                            >
                                                {deletingIds.has(log.id) ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-4 h-4" />
                                                )}
                                            </button>
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
    } = upload;

    const [refreshKey, setRefreshKey] = useState(0);


    // Bump refreshKey when a batch finishes (results change from 0 → N)
    const prevResultsLen = useRef(0);
    useEffect(() => {
        if (results.length > 0 && results.length !== prevResultsLen.current) {
            setRefreshKey((k) => k + 1);
        }
        prevResultsLen.current = results.length;
    }, [results.length]);

    // Drive folder selection
    const [driveFolderId, setDriveFolderId] = useState("");
    const [driveFolderMode, setDriveFolderMode] = useState<"auto" | "custom" | "date-subfolder">("auto");
    const [modeInitialized, setModeInitialized] = useState(false);
    const [modeMenuOpen, setModeMenuOpen] = useState(false);
    const modeMenuRef = useRef<HTMLDivElement | null>(null);
    const [folderError, setFolderError] = useState("");
    const [driveFolderLabel, setDriveFolderLabel] = useState("");
    const [spreadsheetTitle, setSpreadsheetTitle] = useState<string | null>(null);
    const [effectiveSheetId, setEffectiveSheetId] = useState<string>("");
    const [effectiveSheetName, setEffectiveSheetName] = useState<string>("");
    const [effectiveSheetGid, setEffectiveSheetGid] = useState<number | null>(null);

    const PICKER_ROOT_FOLDER_ID = "11-naB49cPhno_HpKcTbrmYPhNz_R8oJk";

    // Close mode dropdown when clicking outside
    useEffect(() => {
        if (!modeMenuOpen) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (modeMenuRef.current && !modeMenuRef.current.contains(e.target as Node)) {
                setModeMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [modeMenuOpen]);

    // ── helpers: localStorage cache สำหรับ folder label ──────────────────────
    const getFolderLabelCache = (id: string) => {
        try { return localStorage.getItem(`drive-folder-label:${id}`) ?? ""; } catch { return ""; }
    };
    const setFolderLabelCache = (id: string, label: string) => {
        try { localStorage.setItem(`drive-folder-label:${id}`, label); } catch { /* ignore */ }
    };
    const clearFolderLabelCache = (id: string) => {
        try { localStorage.removeItem(`drive-folder-label:${id}`); } catch { /* ignore */ }
    };

    // ── Initialize folder ID, mode, และ label จาก session / API ─────────────
    useEffect(() => {
        if (modeInitialized && (driveFolderId ? driveFolderLabel !== "" : true)) return;
        const load = async () => {
            let id = driveFolderId;
            let mode: "auto" | "custom" | "date-subfolder" | null = null;

            const sessionFolderId = (session?.user as any)?.driveFolderId as string | undefined;
            const sessionFolderMode = (session?.user as any)?.driveFolderMode as string | undefined;
            if (sessionFolderId) id = sessionFolderId;
            if (sessionFolderMode === "auto" || sessionFolderMode === "custom" || sessionFolderMode === "date-subfolder") {
                mode = sessionFolderMode;
            }

            if (!id || !mode) {
                try {
                    const res = await fetch("/api/drive-folder");
                    const data = await res.json();
                    if (res.ok) {
                        if (data?.data?.driveFolderId) id = data.data.driveFolderId as string;
                        const apiMode = data?.data?.driveFolderMode as string | undefined;
                        if (apiMode === "auto" || apiMode === "custom" || apiMode === "date-subfolder") {
                            mode = apiMode;
                        }
                    }
                } catch { /* ignore */ }
            }

            if (id && !driveFolderId) setDriveFolderId(id);

            if (!modeInitialized) {
                setDriveFolderMode(mode ?? (id ? "custom" : "auto"));
                setModeInitialized(true);
            }

            if (id && !driveFolderLabel) {
                // 1) ลอง localStorage ก่อน — แสดงทันที ไม่ต้องรอ API
                const cached = getFolderLabelCache(id);
                if (cached) {
                    setDriveFolderLabel(cached);
                    return; // ไม่ต้อง fetch ใหม่
                }

                // 2) ไม่มี cache → fetch จาก API แล้ว cache ไว้
                try {
                    const res = await fetch(`/api/drive/folder-meta?id=${encodeURIComponent(id)}`);
                    const data = await res.json();
                    if (res.ok && data?.data) {
                        const label = (data.data.path as string) || (data.data.name as string) || id;
                        setDriveFolderLabel(label);
                        setFolderLabelCache(id, label);
                    }
                } catch { /* ignore */ }
            }
        };
        void load();
    }, [session, modeInitialized, driveFolderId, driveFolderLabel]);

    // Resolve current sheet destination from active integrations profile (fallback to session fields)
    useEffect(() => {
        let cancelled = false;
        const loadSheetDestination = async () => {
            const sessionSheetId = ((session?.user as any)?.sheetId as string | undefined) ?? "";
            const sessionSheetName = ((session?.user as any)?.sheetName as string | undefined) ?? "";
            const sessionSheetGid = ((session?.user as any)?.sheetGid as number | null | undefined) ?? null;

            setEffectiveSheetId(sessionSheetId);
            setEffectiveSheetName(sessionSheetName);
            setEffectiveSheetGid(sessionSheetGid);

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

                if (!activeProfile) return;
                setEffectiveSheetId(String(activeProfile.sheetId ?? ""));
                setEffectiveSheetName(String(activeProfile.sheetName ?? ""));
                setEffectiveSheetGid(
                    typeof activeProfile.sheetGid === "number" ? activeProfile.sheetGid : null
                );
            } catch {
                // Keep session-based fallback
            }
        };

        void loadSheetDestination();
        return () => {
            cancelled = true;
        };
    }, [session?.user]);

    // Load spreadsheet title
    useEffect(() => {
        const sheetId = effectiveSheetId || undefined;
        if (!sheetId) { setSpreadsheetTitle(null); return; }
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/google/sheets/title?sheetId=${encodeURIComponent(sheetId)}`);
                const data = await res.json();
                if (!cancelled && res.ok && data?.data?.title !== undefined) {
                    setSpreadsheetTitle(data.data.title as string);
                } else if (!cancelled) {
                    setSpreadsheetTitle("");
                }
            } catch {
                if (!cancelled) setSpreadsheetTitle("");
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

    const handleOpenDrivePicker = async () => {
        setFolderError("");
        try {
            if (typeof window === "undefined") return;
            const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
            let accessToken = (session as any)?.accessToken as string | undefined;

            if (!apiKey) { setFolderError("Missing NEXT_PUBLIC_GOOGLE_API_KEY in environment."); return; }

            if (!accessToken) {
                const res = await fetch("/api/google/access-token");
                const data = await res.json();
                if (!res.ok || !data?.data?.accessToken) {
                    setFolderError(data?.error ?? "Google access token missing. Please sign in again.");
                    return;
                }
                accessToken = data.data.accessToken as string;
            }

            await loadGoogleApiScript();

            const googleObj = (window as any).google;
            if (!googleObj || !googleObj.picker) {
                setFolderError("Google Picker API not available (picker library not loaded).");
                return;
            }

            const view = new googleObj.picker.DocsView(googleObj.picker.ViewId.FOLDERS)
                .setIncludeFolders(true)
                .setSelectFolderEnabled(true)
                .setParent(PICKER_ROOT_FOLDER_ID);

            const picker = new googleObj.picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(accessToken)
                .setDeveloperKey(apiKey)
                .setCallback((data: any) => {
                    if (data.action === googleObj.picker.Action.PICKED && data.docs?.length > 0) {
                        const picked = data.docs[0];
                        if (picked?.id) {
                            // คงโหมดเดิมไว้ถ้าเป็น date-subfolder ไม่อัปเดตเป็น custom
                            const pickedMode = driveFolderMode === "date-subfolder" ? "date-subfolder" : "custom";
                            setDriveFolderId(picked.id);
                            setDriveFolderMode(pickedMode);
                            // แสดงชื่อโฟลเดอร์ทันทีจาก picker (ไม่ต้องรอ API)
                            const leafName: string = picked.name || picked.id;
                            setDriveFolderLabel(leafName);

                            // ── เริ่ม meta fetch ทันที (ไม่รอ save) ──────────────────
                            const metaParams = new URLSearchParams({ id: picked.id, leafName });
                            if (picked.parentId) metaParams.set("parentId", picked.parentId);
                            const metaPromise = fetch(`/api/drive/folder-meta?${metaParams}`)
                                .then((r) => (r.ok ? r.json() : null))
                                .catch(() => null);

                            (async () => {
                                try {
                                    // save + session update ไปพร้อมๆ กับที่ meta กำลัง fetch
                                    const res = await fetch("/api/drive-folder", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ driveFolderId: picked.id, driveFolderMode: pickedMode }),
                                    });
                                    const resData = await res.json();
                                    if (!res.ok) {
                                        setFolderError(resData.error ?? "Failed to save folder");
                                    } else {
                                        await requestSessionUpdate();
                                    }
                                } catch (err: any) {
                                    setFolderError(err.message ?? "Failed to save folder");
                                }

                                // รับผล meta (มักจะ resolve แล้วตอนนี้)
                                try {
                                    const metaData = await metaPromise;
                                    if (metaData?.data) {
                                        const label =
                                            (metaData.data.path as string) ||
                                            (metaData.data.name as string) ||
                                            leafName;
                                        setDriveFolderLabel(label);
                                        setFolderLabelCache(picked.id, label);
                                    }
                                } catch { /* ignore */ }
                            })();
                        }
                    }
                })
                .build();

            picker.setVisible(true);
        } catch (err: any) {
            setFolderError(err.message ?? "Failed to open Google Picker.");
        }
    };

    // Warn before leaving during upload
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isProcessing) e.preventDefault();
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [isProcessing]);

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6">
                {/* ── Duplicate Alert ── */}
                {duplicateAlertFilename && (
                    <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                        <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                        <p className="flex-1 text-sm font-medium">
                            ไฟล์ <span className="font-semibold">{duplicateAlertFilename}</span> ซ้ำแล้ว — ประมวลผลไปแล้ว ไม่มีการอัปโหลดซ้ำ
                        </p>
                        <button
                            type="button"
                            onClick={dismissDuplicateAlert}
                            className="shrink-0 rounded-lg p-1.5 text-amber-600 hover:bg-amber-100 transition-colors cursor-pointer"
                            aria-label={t("ปิด", "Close")}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

                {/* ── Dashboard Header ── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">{t("อัปโหลด", "Upload")}</h1>
                        <p className="text-slate-500 text-sm mt-0.5">
                            {t("ติดตามการประมวลผลใบแจ้งหนี้ของคุณ", "Monitor your invoice processing pipeline")}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {isProcessing && (
                            <button
                                onClick={cancelUpload}
                                className="flex items-center gap-1.5 px-4 py-2 bg-red-50 rounded-xl border border-red-200 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors shadow-sm cursor-pointer"
                            >
                                <X className="w-4 h-4" /> {t("ยกเลิกอัปโหลด", "Cancel Upload")}
                            </button>
                        )}
                        {(stage === "done" || results.length > 0) && (
                            <button
                                onClick={resetState}
                                className="flex items-center gap-1.5 px-4 py-2 bg-white rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-sm cursor-pointer"
                            >
                                <X className="w-4 h-4" /> {t("ล้าง", "Clear")}
                            </button>
                        )}
                    </div>
                </div>


                {/* ── Row 1: Drive destination (left) + Drop Zone (right) ── */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

                    {/* Drive destination */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4">
                            <p className="text-sm font-semibold text-slate-800 mb-1">{t("ปลายทาง Drive", "Drive destination")}</p>
                            <p className="text-xs text-slate-400 mb-3">
                                {t("เลือกโฟลเดอร์รายเดือนอัตโนมัติ หรือเลือกโฟลเดอร์เองใน Drive", "Choose automatic monthly folder or a custom Drive folder.")}
                            </p>

                            <div className="flex gap-2">
                                <div className="relative flex-1 min-w-0" ref={modeMenuRef}>
                                    <button
                                    type="button"
                                    onClick={() => setModeMenuOpen((v) => !v)}
                                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs text-slate-700 flex items-center justify-between hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-sm cursor-pointer"
                                >
                                    <span>
                                        {driveFolderMode === "auto"
                                            ? t("อัตโนมัติ — FB_Invoices_YYYY-MM", "Automatic — FB_Invoices_YYYY-MM")
                                            : driveFolderMode === "date-subfolder"
                                            ? t("สร้างโฟลเดอร์ตามวันที่ใบเสร็จ", "Auto subfolder by receipt date")
                                            : t("โฟลเดอร์กำหนดเอง", "Custom folder")}
                                    </span>
                                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                </button>
                                {modeMenuOpen && (
                                    <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg py-1 text-xs text-slate-700">
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setModeMenuOpen(false);
                                                setDriveFolderMode("auto");
                                                setFolderError("");
                                                try {
                                                    await fetch("/api/drive-folder", {
                                                        method: "POST",
                                                        headers: { "Content-Type": "application/json" },
                                                        body: JSON.stringify({ driveFolderId: null, driveFolderMode: "auto" }),
                                                    });
                                                    if (driveFolderId) clearFolderLabelCache(driveFolderId);
                                                    setDriveFolderId("");
                                                    setDriveFolderLabel("");
                                                    await requestSessionUpdate();
                                                } catch { /* ignore */ }
                                            }}
                                            className={`w-full px-3 py-2 text-left hover:bg-slate-50 rounded-xl cursor-pointer ${driveFolderMode === "auto" ? "bg-slate-50" : ""}`}
                                        >
                                            <span className="font-semibold">{t("อัตโนมัติ", "Automatic")}</span>{" "}
                                            <span className="text-slate-500">— FB_Invoices_YYYY-MM</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setModeMenuOpen(false);
                                                setDriveFolderMode("custom");
                                                setFolderError("");
                                                if (driveFolderId) {
                                                    try {
                                                        await fetch("/api/drive-folder", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ driveFolderId, driveFolderMode: "custom" }),
                                                        });
                                                        await requestSessionUpdate();
                                                    } catch { /* ignore */ }
                                                }
                                            }}
                                            className={`w-full px-3 py-2 text-left hover:bg-slate-50 rounded-xl cursor-pointer ${driveFolderMode === "custom" ? "bg-slate-50" : ""}`}
                                        >
                                            <span className="font-semibold">{t("โฟลเดอร์กำหนดเอง", "Custom folder")}</span>{" "}
                                            <span className="text-slate-500">— {t("เลือกจาก Drive", "pick from Drive")}</span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                setModeMenuOpen(false);
                                                setDriveFolderMode("date-subfolder");
                                                setFolderError("");
                                                if (driveFolderId) {
                                                    try {
                                                        await fetch("/api/drive-folder", {
                                                            method: "POST",
                                                            headers: { "Content-Type": "application/json" },
                                                            body: JSON.stringify({ driveFolderId, driveFolderMode: "date-subfolder" }),
                                                        });
                                                        await requestSessionUpdate();
                                                    } catch { /* ignore */ }
                                                }
                                            }}
                                            className={`w-full px-3 py-2 text-left hover:bg-slate-50 rounded-xl cursor-pointer ${driveFolderMode === "date-subfolder" ? "bg-slate-50" : ""}`}
                                        >
                                            <span className="font-semibold">{t("สร้างโฟลเดอร์ตามวันที่ใบเสร็จ", "Auto subfolder by receipt date")}</span>{" "}
                                            <span className="text-slate-500">— {t("DD/MM/YYYY ภายในโฟลเดอร์ที่เลือก", "DD/MM/YYYY inside picked folder")}</span>
                                        </button>
                                    </div>
                                )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleOpenDrivePicker}
                                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 shadow-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed h-[34px]"
                                    disabled={driveFolderMode !== "custom" && driveFolderMode !== "date-subfolder"}
                                >
                                    <HardDrive className="w-3.5 h-3.5" />
                                    {t("เลือกจาก Drive", "Pick from Drive")}
                                </button>
                            </div>

                            {/* Error */}
                            {folderError && (
                                <div className="mt-2 space-y-1">
                                    <p className="text-xs text-red-600">{folderError}</p>
                                    <p className="text-xs text-amber-700">
                                        ถ้าเห็น 403 อาจต้อง{" "}
                                        <button
                                            type="button"
                                            onClick={() => signOut({ callbackUrl: "/login" })}
                                            className="underline font-medium hover:text-amber-900 cursor-pointer"
                                        >
                                            ออกจากระบบแล้วล็อกอินใหม่
                                        </button>
                                    </p>
                                </div>
                            )}

                            {/* Sync destination — styled like receiptflow-ai */}
                            <div className="mt-3 rounded-lg bg-slate-50 border border-slate-100 px-3.5 py-2.5 space-y-1.5">
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{t("ปลายทางซิงก์", "Sync destination")}</p>

                                {/* Drive folder row */}
                                <div className="flex flex-wrap items-center gap-1 text-xs">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="https://img.icons8.com/color/20/folder-invoices--v1.png"
                                        alt="Google Drive folder"
                                        width={16}
                                        height={16}
                                        className="flex-shrink-0"
                                    />
                                    {driveFolderMode === "auto" ? (
                                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                                            FB_Invoices_YYYY-MM
                                        </span>
                                    ) : driveFolderMode === "date-subfolder" && driveFolderId ? (
                                        (() => {
                                            const segs = driveFolderLabel
                                                ? driveFolderLabel.split(" / ")
                                                : [driveFolderId];
                                            return (
                                                <span className="flex flex-wrap items-center gap-1">
                                                    {segs.map((seg, i, arr) => (
                                                        <span key={i} className="flex items-center gap-1">
                                                            <span className={`px-1.5 py-0.5 rounded ${i === arr.length - 1 ? "bg-blue-100 text-blue-700 font-medium" : "text-slate-400"}`}>
                                                                {seg}
                                                            </span>
                                                            {i < arr.length - 1 && (
                                                                <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            )}
                                                        </span>
                                                    ))}
                                                    <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                    <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium italic">
                                                        {t("DD/MM/YYYY (วันที่ใบเสร็จ)", "DD/MM/YYYY (receipt date)")}
                                                    </span>
                                                </span>
                                            );
                                        })()
                                    ) : driveFolderMode === "date-subfolder" && !driveFolderId ? (
                                        <span className="text-slate-400 italic">{t("ยังไม่ตั้งค่า — เลือกโฟลเดอร์หลักด้านบน", "Not set — pick a parent folder above")}</span>
                                    ) : driveFolderId ? (
                                        (() => {
                                            const segs = driveFolderLabel
                                                ? driveFolderLabel.split(" / ")
                                                : [driveFolderId];
                                            return segs.map((seg, i, arr) => (
                                                <span key={i} className="flex items-center gap-1">
                                                    <a
                                                        href={i === arr.length - 1
                                                            ? `https://drive.google.com/drive/folders/${driveFolderId}`
                                                            : undefined}
                                                        target={i === arr.length - 1 ? "_blank" : undefined}
                                                        rel="noopener noreferrer"
                                                        className={`px-1.5 py-0.5 rounded ${
                                                            i === arr.length - 1
                                                                ? "bg-blue-100 text-blue-700 font-medium hover:bg-blue-200 transition-colors"
                                                                : "text-slate-400"
                                                        }`}
                                                    >
                                                        {seg}
                                                    </a>
                                                    {i < arr.length - 1 && (
                                                        <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                        </svg>
                                                    )}
                                                </span>
                                            ));
                                        })()
                                    ) : (
                                        <span className="text-slate-400 italic">{t("ยังไม่ตั้งค่า — เลือกโฟลเดอร์ด้านบน", "Not set — pick a folder above")}</span>
                                    )}
                                </div>

                                {/* Google Sheet row */}
                                <div className="flex flex-wrap items-center gap-1 text-xs">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="https://img.icons8.com/color/20/google-sheets.png"
                                        alt="Google Sheets"
                                        width={16}
                                        height={16}
                                        className="flex-shrink-0"
                                    />
                                    {effectiveSheetId ? (
                                        <>
                                            {spreadsheetTitle !== null && spreadsheetTitle !== "" && (
                                                <span className="px-1.5 py-0.5 rounded text-slate-400">
                                                    {spreadsheetTitle}
                                                </span>
                                            )}
                                            {spreadsheetTitle !== null && spreadsheetTitle !== "" && effectiveSheetName && (
                                                <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                                                        className="px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium hover:bg-green-200 transition-colors"
                                                    >
                                                        {effectiveSheetName}
                                                    </a>
                                                );
                                            })()}
                                            {spreadsheetTitle === null && (
                                                <span className="text-slate-400">Loading…</span>
                                            )}
                                        </>
                                    ) : (
                                        <span className="text-slate-400 italic">{t("ยังไม่ตั้งค่า — ไปตั้งค่าใน Integrations", "Not set — configure in Integrations")}</span>
                                    )}
                                </div>
                            </div>

                        </div>

                    {/* Drop Zone + Results */}
                    <div className="flex flex-col gap-4 h-full">
                        <div
                            {...getRootProps()}
                            className={`flex-1 flex flex-col items-center justify-center min-h-[220px] relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all duration-200 ${
                                isDragActive
                                    ? "border-teal-500 bg-teal-50"
                                    : stage === "done"
                                    ? "border-green-400 bg-green-50"
                                    : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/30"
                            }`}
                        >
                            <input {...getInputProps()} />

                            {stage === "idle" && (
                                <div>
                                    <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
                                        <Upload className="w-6 h-6 text-teal-500" />
                                    </div>
                                    <p className="text-sm font-semibold text-slate-700 mb-1">
                                        {isDragActive ? t("วางไฟล์ PDF ที่นี่…", "Drop PDFs here…") : t("ลากและวางไฟล์ใบแจ้งหนี้ PDF", "Drag & drop invoice PDFs")}
                                    </p>
                                    <p className="text-xs text-slate-400 mb-3">
                                        Select or drop multiple files at once
                                    </p>
                                    <span className="inline-block px-3 py-1 rounded-full bg-slate-100 text-xs text-slate-500">
                                        {t("เฉพาะ PDF", "PDF only")}
                                    </span>
                                </div>
                            )}

                            {isProcessing && currentFile && (
                                <div>
                                    <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mx-auto mb-3 relative">
                                        <FileText className="w-6 h-6 text-teal-500" />
                                        <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full landing-accent-bg flex items-center justify-center text-white text-[9px] font-bold">
                                            {currentIndex + 1}/{queue.length}
                                        </div>
                                    </div>
                                    <p className="font-medium text-slate-700 text-xs mb-1 truncate max-w-[180px] mx-auto">
                                        {currentFile.name}
                                    </p>
                                    <p className="text-slate-400 text-xs mt-1 flex items-center justify-center gap-1.5">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        <span>
                                            {{
                                                uploading: t("กำลังอัปโหลด", "Uploading"),
                                                extracting: t("AI กำลังดึงข้อมูล", "AI Extracting"),
                                                drive: t("กำลังบันทึกไปยัง Drive", "Saving to Drive"),
                                                sheets: t("กำลังอัปเดต Sheet", "Updating Sheet"),
                                            }[stage as "uploading" | "extracting" | "drive" | "sheets"] || t("กำลังทำงาน...", "Working...")}
                                            <span className="font-semibold text-teal-600 ml-1">
                                                {stage === "uploading" ? 25 : stage === "extracting" ? 60 : stage === "drive" ? 85 : stage === "sheets" ? 95 : stage === "done" ? 100 : 0}%
                                            </span>
                                        </span>
                                    </p>
                                    {/* Fake Progress Bar */}
                                    <div className="w-full max-w-[160px] mx-auto mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                                        <div 
                                            className="h-full bg-teal-500 rounded-full transition-all duration-700 ease-out" 
                                            style={{ 
                                                width: `${stage === "uploading" ? 25 : stage === "extracting" ? 60 : stage === "drive" ? 85 : stage === "sheets" ? 95 : stage === "done" ? 100 : 0}%` 
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {stage === "done" && (
                                <div>
                                    <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-2">
                                        <CheckCircle2 className="w-6 h-6 text-green-600" />
                                    </div>
                                    <p className="font-semibold text-green-700 mb-1">{t("เสร็จสิ้นทั้งชุด!", "Batch Complete!")}</p>
                                    <p className="text-slate-500 text-xs">
                                        {t(`ประมวลผลแล้ว ${results.length} ไฟล์`, `Processed ${results.length} file${results.length > 1 ? "s" : ""}`)}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Results List (compact) */}
                        {results.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-slate-700">{t("ผลการประมวลผล", "Processing Results")}</h3>
                                {results.map((res, idx) => {
                                    if ("error" in res) {
                                        return (
                                            <div key={idx} className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-3">
                                                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-semibold text-red-900 truncate">{res.filename}</p>
                                                    <p className="text-xs text-red-600 mt-0.5">{res.error}</p>
                                                </div>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={idx} className="bg-white border border-slate-100 rounded-xl p-3 flex items-center gap-3 shadow-sm">
                                            <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center shrink-0">
                                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-semibold text-slate-900 truncate">{res.filename}</p>
                                                <p className="text-xs text-slate-500">
                                                    {res.amount?.toLocaleString()} {res.currency} · {res.date}
                                                </p>
                                            </div>
                                            {res.driveLink && (
                                                <a
                                                    href={res.driveLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border border-teal-100 bg-teal-50 text-teal-600 text-xs font-semibold hover:bg-teal-100"
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
                        <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                </div>
                                <div>
                                    <p className="text-base font-semibold text-slate-900">{t("เสร็จสิ้นทั้งชุด!", "Batch Complete!")}</p>
                                    <p className="text-xs text-slate-500">
                                        {t(`ประมวลผลแล้ว ${results.length} ไฟล์ ดูรายละเอียดด้านล่าง`, `Processed ${results.length} file${results.length > 1 ? "s" : ""}. See the details below.`)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={acknowledgeBatchComplete}
                                    className="px-4 py-2 rounded-xl landing-accent-bg text-white text-sm font-medium hover:opacity-95 cursor-pointer"
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
