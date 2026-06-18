"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Save, CheckCircle2, Loader2, ExternalLink } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

const colOptions = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
const defaultMapping = {
    filename: "",
    date: "A",
    billed_to: "B",
    card_last_4: "O",
    amount: "G",
    amountFailed: "H",
    currency: "",
    driveLink: "J",
    reference: "T",
};

const mergeMapping = (stored: unknown): typeof defaultMapping =>
    ({ ...defaultMapping, ...(stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {}) } as typeof defaultMapping);

export default function IntegrationsPage() {
    const { t } = useAppPreferences();
    const { data: session, update } = useSession();
    const user = session?.user as any;

    type SheetProfile = {
        id: string;
        name: string;
        sheetId: string;
        sheetName: string | null;
        sheetGid: number | null;
        sheetMapping: typeof defaultMapping | null;
    };

    const [profiles, setProfiles] = useState<SheetProfile[]>([]);
    const [activeProfileId, setActiveProfileId] = useState<string>("");

    const activeProfile = profiles.find(p => p.id === activeProfileId) ?? null;

    const [sheetId, setSheetId] = useState("");
    const [sheetName, setSheetName] = useState<string>("");
    const [sheetGid, setSheetGid] = useState<number | null>(null);
    const [sheetMapping, setSheetMapping] = useState<typeof defaultMapping>(defaultMapping);

    const [sheets, setSheets] = useState<{ id: string; name: string }[]>([]);
    const [tabs, setTabs] = useState<{id: number, title: string}[]>([]);
    const [loadingSheets, setLoadingSheets] = useState(false);
    const [loadingTabs, setLoadingTabs] = useState(false);

    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState("");
    const [sheetMenuOpen, setSheetMenuOpen] = useState(false);
    const [tabMenuOpen, setTabMenuOpen] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    const profileMenuRef = useRef<HTMLDivElement | null>(null);
    const sheetMenuRef = useRef<HTMLDivElement | null>(null);
    const tabMenuRef = useRef<HTMLDivElement | null>(null);

    // Load initial state from server
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/integrations", { method: "GET" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed to load integrations");
                const serverProfiles = (data.data?.profiles as SheetProfile[] | undefined) ?? [];
                const serverActiveId = (data.data?.activeProfileId as string | undefined) ?? "";

                if (serverProfiles.length === 0) {
                    const initial: SheetProfile = {
                        id: "default",
                        name: t("ค่าเริ่มต้น", "Default"),
                        sheetId: user?.sheetId ?? "",
                        sheetName: user?.sheetName ?? "",
                        sheetGid: null,
                        sheetMapping: mergeMapping(user?.sheetMapping),
                    };
                    setProfiles([initial]);
                    setActiveProfileId(initial.id);
                    setSheetId(initial.sheetId);
                    setSheetName(initial.sheetName || "");
                    setSheetGid(null);
                    setSheetMapping(mergeMapping(initial.sheetMapping));
                } else {
                    setProfiles(serverProfiles);
                    const useId = serverActiveId || serverProfiles[0].id;
                    setActiveProfileId(useId);
                    const p = serverProfiles.find(p => p.id === useId) ?? serverProfiles[0];
                    setSheetId(p.sheetId || "");
                    setSheetName(p.sheetName || "");
                    setSheetGid(p.sheetGid ?? null);
                    setSheetMapping(mergeMapping(p.sheetMapping));
                }
            } catch (err: any) {
                setError(err.message ?? "Failed to load integrations");
            }
        };
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Load list of available Google Sheets
    useEffect(() => {
        const loadSheets = async () => {
            setLoadingSheets(true);
            try {
                const res = await fetch("/api/google/sheets/list");
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed to load sheets");
                setSheets((data.data as { id: string; name: string }[]) ?? []);
            } catch (err: any) {
                setError(err.message ?? "Failed to load sheets");
            }
            setLoadingSheets(false);
        };
        loadSheets();
    }, []);

    // Close menus when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (profileMenuRef.current && !profileMenuRef.current.contains(target)) {
                setProfileMenuOpen(false);
            }
            if (sheetMenuRef.current && !sheetMenuRef.current.contains(target)) {
                setSheetMenuOpen(false);
            }
            if (tabMenuRef.current && !tabMenuRef.current.contains(target)) {
                setTabMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Auto-load tabs whenever sheetId changes
    const prevSheetIdRef = useRef<string>("");
    useEffect(() => {
        if (prevSheetIdRef.current === sheetId) return;
        prevSheetIdRef.current = sheetId;
        setTabs([]);
        setTabMenuOpen(false);
        if (!sheetId) return;
        let cancelled = false;
        setLoadingTabs(true);
        setError("");
        fetch(`/api/google/sheets?sheetId=${sheetId}`)
            .then((res) => res.json())
            .then((data) => {
                if (cancelled) return;
                if (!data.ok && data.error) throw new Error(data.error);
                const loadedTabs = (data.data as { id: number; title: string }[]) ?? [];
                setTabs(loadedTabs);
                if (loadedTabs.length > 0 && !sheetName) {
                    setSheetName(loadedTabs[0].title);
                    setSheetGid(loadedTabs[0].id ?? null);
                }
            })
            .catch((err: any) => { if (!cancelled) setError(err.message); })
            .finally(() => { if (!cancelled) setLoadingTabs(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sheetId]);

    // Fallback: load tabs on demand if auto-load hasn't fired yet
    const loadTabsOnDemand = async () => {
        if (!sheetId || loadingTabs || tabs.length > 0) return;
        setLoadingTabs(true);
        setError("");
        try {
            const res = await fetch(`/api/google/sheets?sheetId=${sheetId}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to load sheets");
            const loadedTabs = (data.data as { id: number; title: string }[]) ?? [];
            setTabs(loadedTabs);
            if (loadedTabs.length > 0 && !sheetName) {
                setSheetName(loadedTabs[0].title);
                setSheetGid(loadedTabs[0].id ?? null);
            }
        } catch (err: any) {
            setError(err.message);
        }
        setLoadingTabs(false);
    };

    const syncActiveProfileState = (nextProfiles: SheetProfile[], nextActiveId: string) => {
        const p = nextProfiles.find(p => p.id === nextActiveId);
        if (!p) return;
        setSheetId(p.sheetId || "");
        setSheetName(p.sheetName || "");
        setSheetGid(p.sheetGid ?? null);
        setSheetMapping(mergeMapping(p.sheetMapping));
    };

    const handleChangeActiveProfile = (profileId: string) => {
        setActiveProfileId(profileId);
        const p = profiles.find(p => p.id === profileId);
        if (!p) return;
        setSheetId(p.sheetId || "");
        setSheetName(p.sheetName || "");
        setSheetGid(p.sheetGid ?? null);
        setSheetMapping(mergeMapping(p.sheetMapping));
    };

    const handleCreateProfile = (mode: "blank" | "duplicate") => {
        const id = `profile-${Date.now()}`;
        const base =
            mode === "duplicate" && activeProfile
                ? activeProfile
                : { sheetId: "", sheetName: "", sheetMapping: defaultMapping };

        const newProfile: SheetProfile = {
            id,
            name: mode === "duplicate" && activeProfile ? `${activeProfile.name} (${t("คัดลอก", "copy")})` : `${t("โปรไฟล์", "Profile")} ${profiles.length + 1}`,
            sheetId: base.sheetId || "",
            sheetName: base.sheetName || "",
            sheetGid: (base as SheetProfile).sheetGid ?? null,
            sheetMapping: mergeMapping(base.sheetMapping),
        };

        const nextProfiles = [...profiles, newProfile];
        setProfiles(nextProfiles);
        setActiveProfileId(id);
        syncActiveProfileState(nextProfiles, id);
    };

    const handleSave = async () => {
        setSaving(true);
        setSaved(false);
        setError("");
        try {
            const updatedProfiles = profiles.map(p =>
                p.id === activeProfileId
                    ? { ...p, sheetId, sheetName, sheetGid, sheetMapping }
                    : p
            );
            setProfiles(updatedProfiles);

            const res = await fetch("/api/integrations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ profiles: updatedProfiles, activeProfileId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to save");
            setSaved(true);
            await update();
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            setError(err.message);
        }
        setSaving(false);
    };

    const updateMapping = (key: keyof typeof defaultMapping, val: string) => {
        setSheetMapping(prev => ({ ...prev, [key]: val }));
    };

    return (
        <div className="max-w-3xl mx-auto pb-12 w-full min-w-0">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">{t("ตั้งค่า Sheet", "Sheet Settings")}</h1>
                <p className="text-gray-500 dark:text-gray-400">{t("เชื่อมต่อ Google Sheets เพื่อรับข้อมูลใบแจ้งหนี้", "Connect Google Sheets to receive invoice data.")}</p>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/60 dark:shadow-none p-6 space-y-6">
                {saved && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-bold">
                            ✓
                        </span>
                        <span>{t("บันทึกการเชื่อมต่อ Google Sheets และการแมปคอลัมน์สำเร็จ", "Google Sheets connection and column mapping saved successfully")}</span>
                    </div>
                )}

                <div className="flex items-center gap-3 pb-2 border-b border-gray-100 dark:border-gray-800">
                    <div className="w-10 h-10 rounded-xl bg-green-50 dark:bg-green-950/20 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/sheet.svg" alt="Google Sheets" width={22} height={22} className="w-[22px] h-[22px]" />
                    </div>
                    <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{t("การเชื่อมต่อ Google Sheets", "Google Sheets Connection")}</p>
                        <p className="text-sm text-gray-400 dark:text-gray-400">{t("เพิ่มแถวใบแจ้งหนี้อัตโนมัติลงชีตที่เลือก", "Append invoice rows automatically into your chosen sheet.")}</p>
                    </div>
                </div>



                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 text-xs text-red-600 dark:text-red-400">{error}</div>
                )}

                <div className="space-y-5">
                    {/* Step 1 & 2: Google Sheet + Target Tab */}
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="md:col-span-3 relative" ref={sheetMenuRef}>
                                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/sheet.webp" alt="" width={18} height={18} className="shrink-0 rounded-sm" />
                                    1. Google Sheet
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setSheetMenuOpen((v) => !v)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-left flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent cursor-pointer text-gray-800 dark:text-gray-200"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src="/sheet.webp" alt="" width={16} height={16} className="shrink-0" />
                                    <span className={`min-w-0 flex-1 truncate ${sheetId ? "text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}`}>
                                        {loadingSheets
                                            ? t("กำลังโหลดสเปรดชีต...", "Loading sheets...")
                                            : sheets.length === 0
                                                ? t("ไม่มีไฟล์ Google Sheets", "No Google Sheets available")
                                                : sheetId
                                                    ? sheets.find((s) => s.id === sheetId)?.name ?? t("เลือกสเปรดชีต", "Select a sheet")
                                                    : t("เลือกสเปรดชีต", "Select a sheet")}
                                    </span>
                                </button>
                                {sheetMenuOpen && !loadingSheets && sheets.length > 0 && (
                                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg shadow-gray-200/60 dark:shadow-none max-h-64 overflow-auto text-sm">
                                        {sheets.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => { setSheetId(s.id); setSheetMenuOpen(false); }}
                                                className={`w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer flex items-center gap-2 min-w-0 ${sheetId === s.id ? "bg-gray-50 dark:bg-gray-700/50 font-medium text-gray-900 dark:text-gray-100" : "text-gray-700 dark:text-gray-300"}`}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src="/sheet.webp" alt="" width={16} height={16} className="shrink-0" />
                                                <span className="truncate">{s.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                                    {t("ไฟล์สเปรดชีตถูกดึงมาจากบัญชี Google Drive ของคุณ โปรดตรวจสอบว่าเปิดการแชร์ให้แอปแล้ว", "Sheets are loaded from your Google Drive account. Make sure the target sheet is shared with this app.")}
                                </p>
                            </div>

                            <div className="md:col-span-2 relative" ref={tabMenuRef}>
                                <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                                    2. Target Sheet Tab
                                </label>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (tabMenuOpen) { setTabMenuOpen(false); return; }
                                        if (tabs.length === 0 && !loadingTabs) await loadTabsOnDemand();
                                        setTabMenuOpen(true);
                                    }}
                                    disabled={!sheetId}
                                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-left hover:bg-gray-50 dark:hover:bg-gray-750 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:bg-gray-50 dark:disabled:bg-gray-900/50 disabled:text-gray-400 dark:disabled:text-gray-650 cursor-pointer disabled:cursor-not-allowed text-gray-800 dark:text-gray-200"
                                >
                                    <span className={sheetName ? "text-gray-800 dark:text-gray-200" : "text-gray-400 dark:text-gray-500"}>
                                        {loadingTabs ? t("กำลังโหลดแท็บ...", "Loading tabs…") : sheetName || (tabs.length > 0 ? t("เลือกแท็บ", "Select a tab") : t("กรุณาเลือกไฟล์สเปรดชีตก่อน", "Select a sheet first"))}
                                    </span>
                                </button>
                                {tabMenuOpen && tabs.length > 0 && (
                                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg shadow-gray-200/60 dark:shadow-none max-h-56 overflow-auto text-sm">
                                        {tabs.map((tab) => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => { setSheetName(tab.title); setSheetGid(tab.id ?? null); setTabMenuOpen(false); }}
                                                className={`w-full px-4 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer text-gray-700 dark:text-gray-300 ${sheetName === tab.title ? "bg-gray-50 dark:bg-gray-700/50 font-medium text-gray-900 dark:text-gray-100" : ""}`}
                                            >
                                                {tab.title}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Column Mapping */}
                    <div>
                        <label className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">
                            {t("3. แมปคอลัมน์", "3. Column Mapping")}
                        </label>
                        <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-100 dark:border-gray-850 p-5">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-4">
                                {[
                                    { label: t("ชื่อไฟล์", "File Name"), key: "filename" },
                                    { label: t("วันที่ในใบแจ้งหนี้", "Invoice Date"), key: "date" },
                                    { label: t("ชื่อผู้รับบิล", "Billed To"), key: "billed_to" },
                                    { label: t("เลขท้ายบัตร (4 หลัก)", "Card (Last 4)"), key: "card_last_4" },
                                    { label: t("ยอดเงิน (สำเร็จ)", "Amount (successful)"), key: "amount" },
                                    { label: t("ยอดเงิน (ไม่สำเร็จ)", "Amount (unsuccessful)"), key: "amountFailed" },
                                    { label: t("สกุลเงิน", "Currency"), key: "currency" },
                                    { label: t("ลิงก์ Drive", "Drive Link"), key: "driveLink" },
                                    { label: t("เลขที่อ้างอิง", "Reference No."), key: "reference" },
                                ].map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1.5">
                                        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            {field.label}
                                        </span>
                                        <select
                                            value={(sheetMapping as any)[field.key] ?? (defaultMapping as any)[field.key] ?? ""}
                                            onChange={e => updateMapping(field.key as any, e.target.value)}
                                            className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono w-full"
                                        >
                                            <option value="">{t("- ข้าม -", "- Skip -")}</option>
                                            {colOptions.map(col => (
                                                <option key={col} value={col}>{t(`คอลัมน์ ${col}`, `Column ${col}`)}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            {t("เลือกคอลัมน์ (A-Z) ที่ต้องการบันทึกข้อมูลแต่ละประเภทที่ดึงได้จากใบแจ้งหนี้", "Choose which column (A-Z) each piece of extracted data should be inserted into.")}
                        </p>
                    </div>

                    <hr className="border-gray-100 dark:border-gray-800" />

                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between pt-2">
                        <a
                            href="https://sheets.google.com/create"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-brand-600 dark:text-brand-400 hover:text-brand-800 dark:hover:text-brand-300 transition-colors order-2 sm:order-1"
                        >
                            {t("สร้างไฟล์ Sheet ใหม่", "Create new Sheet")} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                            onClick={handleSave}
                            disabled={saving || !sheetId}
                            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg landing-accent-bg text-white text-sm font-medium hover:opacity-95 disabled:opacity-50 transition-all shadow-sm order-1 sm:order-2 w-full sm:w-auto cursor-pointer disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : saved ? (
                                <CheckCircle2 className="w-4 h-4" />
                            ) : (
                                <Save className="w-4 h-4" />
                            )}
                            {saved ? t("บันทึกการตั้งค่าแล้ว", "Saved Configuration") : t("บันทึกการเปลี่ยนแปลงทั้งหมด", "Save All Changes")}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
