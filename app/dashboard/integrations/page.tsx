"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Save, CheckCircle2, Loader2, ExternalLink, Plus, Copy } from "lucide-react";
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
        sheetGid: number | null;        // numeric tab GID สำหรับลิงก์ตรงแท็บ
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

    // Load initial state from server (supports multiple profiles)
    useEffect(() => {
        const load = async () => {
            try {
                const res = await fetch("/api/integrations", { method: "GET" });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error ?? "Failed to load integrations");
                const serverProfiles = (data.data?.profiles as SheetProfile[] | undefined) ?? [];
                const serverActiveId = (data.data?.activeProfileId as string | undefined) ?? "";

                if (serverProfiles.length === 0) {
                    // Fallback: build a single profile from session user fields if available
                    const initial: SheetProfile = {
                        id: "default",
                        name: "Default",
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
                // Don't block UI if listing fails, just show error
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
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Clear tabs when sheetId changes so stale tabs from previous sheet don't show
    const prevSheetIdRef = useRef<string>("");
    useEffect(() => {
        if (prevSheetIdRef.current !== sheetId) {
            prevSheetIdRef.current = sheetId;
            setTabs([]);
        }
    }, [sheetId]);

    // Load tabs on demand (called when user opens the tab dropdown)
    const loadTabsOnDemand = async () => {
        if (!sheetId || loadingTabs) return;
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
                : {
                      sheetId: "",
                      sheetName: "",
                      sheetMapping: defaultMapping,
                  };

        const newProfile: SheetProfile = {
            id,
            name: mode === "duplicate" && activeProfile ? `${activeProfile.name} copy` : `Profile ${profiles.length + 1}`,
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
            // Update active profile in local state before sending
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
            await update(); // refresh session
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
                <h1 className="text-2xl font-bold text-slate-900 mb-1">{t("ตั้งค่า Sheet", "Sheet Settings")}</h1>
                <p className="text-slate-500">{t("เชื่อมต่อ Google Sheets เพื่อรับข้อมูลใบแจ้งหนี้", "Connect Google Sheets to receive invoice data.")}</p>
            </div>

            <div className="bg-white rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/60 p-6 space-y-6">
                {saved && (
                    <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold">
                            ✓
                        </span>
                        <span>{t("บันทึกการเชื่อมต่อ Google Sheets และการแมปคอลัมน์สำเร็จ", "Google Sheets connection and column mapping saved successfully")}</span>
                    </div>
                )}
                <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                    <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src="/sheet.svg"
                            alt="Google Sheets"
                            width={22}
                            height={22}
                            className="w-[22px] h-[22px]"
                        />
                    </div>
                    <div>
                        <p className="font-semibold text-slate-900">{t("การเชื่อมต่อ Google Sheets", "Google Sheets Connection")}</p>
                        <p className="text-sm text-slate-400">{t("เพิ่มแถวใบแจ้งหนี้อัตโนมัติลงชีตที่เลือก", "Append invoice rows automatically into your chosen sheet.")}</p>
                    </div>
                </div>

                {/* Profile selector + name + actions */}
                <div className="space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <div className="flex-1 space-y-2" ref={profileMenuRef}>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                {t("โปรไฟล์ที่ใช้งาน", "Active profile")}
                            </label>
                            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
                                <div className="relative min-w-[160px]">
                                    <button
                                        type="button"
                                        onClick={() => setProfileMenuOpen((v) => !v)}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                                    >
                                        <span className="truncate">
                                            {profiles.find((p) => p.id === activeProfileId)?.name ?? t("เลือกโปรไฟล์", "Select profile")}
                                        </span>
                                    </button>
                                    {profileMenuOpen && (
                                        <div className="absolute left-0 right-0 mt-2 rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60 text-sm overflow-hidden z-20">
                                            {profiles.map((p) => (
                                                <button
                                                    key={p.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setProfileMenuOpen(false);
                                                        handleChangeActiveProfile(p.id);
                                                    }}
                                                    className={`w-full px-3 py-2 text-left hover:bg-slate-50 cursor-pointer ${
                                                        activeProfileId === p.id ? "bg-slate-50 font-medium" : ""
                                                    }`}
                                                >
                                                    {p.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {activeProfile && (
                                    <input
                                        type="text"
                                        value={activeProfile.name}
                                        onChange={(e) => {
                                            const nextProfiles = profiles.map((p) =>
                                                p.id === activeProfile.id ? { ...p, name: e.target.value } : p
                                            );
                                            setProfiles(nextProfiles);
                                        }}
                                        className="mt-2 sm:mt-0 w-full max-w-xs px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        placeholder={t("ชื่อโปรไฟล์", "Profile name")}
                                    />
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <button
                                type="button"
                                onClick={() => handleCreateProfile("blank")}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" /> {t("สร้างใหม่", "New blank")}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleCreateProfile("duplicate")}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                            >
                                <Copy className="w-3.5 h-3.5" /> {t("คัดลอก", "Duplicate")}
                            </button>
                            {activeProfile && (
                                <button
                                    type="button"
                                    disabled={profiles.length <= 1}
                                    onClick={() => {
                                        if (profiles.length <= 1) return;
                                        const filtered = profiles.filter((p) => p.id !== activeProfile.id);
                                        const nextActive =
                                            filtered.find((p) => p.id === activeProfileId) ?? filtered[0];
                                        setProfiles(filtered);
                                        setActiveProfileId(nextActive.id);
                                        syncActiveProfileState(filtered, nextActive.id);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                >
                                    {t("ลบ", "Delete")}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600">
                        {error}
                    </div>
                )}

                <div className="space-y-5">
                    {/* Step 1 & 2: Google Sheet + Target Tab */}
                    <div>
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div className="md:col-span-3 relative" ref={sheetMenuRef}>
                                <label className="flex items-center gap-2 text-sm font-medium text-slate-800 mb-2">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/sheet.webp"
                                        alt=""
                                        width={18}
                                        height={18}
                                        className="shrink-0 rounded-sm"
                                    />
                                    1. Google Sheet
                                </label>
                                <button
                                    type="button"
                                    onClick={() => setSheetMenuOpen((v) => !v)}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm bg-white text-left flex items-center gap-2 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent cursor-pointer"
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src="/sheet.webp"
                                        alt=""
                                        width={16}
                                        height={16}
                                        className="shrink-0"
                                    />
                                    <span
                                        className={`min-w-0 flex-1 truncate ${sheetId ? "text-slate-800" : "text-slate-400"}`}
                                    >
                                        {loadingSheets
                                            ? "Loading sheets..."
                                            : sheets.length === 0
                                                ? "No Google Sheets available"
                                                : sheetId
                                                    ? sheets.find((s) => s.id === sheetId)?.name ?? "Select a sheet"
                                                    : "Select a sheet"}
                                    </span>
                                </button>
                                {sheetMenuOpen && !loadingSheets && sheets.length > 0 && (
                                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60 max-h-64 overflow-auto text-sm">
                                        {sheets.map((s) => (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => {
                                                    setSheetId(s.id);
                                                    setSheetMenuOpen(false);
                                                }}
                                                className={`w-full px-4 py-2 text-left hover:bg-slate-50 cursor-pointer flex items-center gap-2 min-w-0 ${
                                                    sheetId === s.id ? "bg-slate-50 font-medium" : ""
                                                }`}
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                    src="/sheet.webp"
                                                    alt=""
                                                    width={16}
                                                    height={16}
                                                    className="shrink-0"
                                                />
                                                <span className="truncate">{s.name}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <p className="text-xs text-slate-400 mt-2">
                                    Sheets are loaded from your Google Drive account. Make sure the target sheet is shared with this app's Google user.
                                </p>
                            </div>
                            <div className="md:col-span-2 relative" ref={tabMenuRef}>
                                <label className="block text-sm font-medium text-slate-800 mb-2">
                                    2. Target Sheet Tab
                                </label>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        if (tabMenuOpen) { setTabMenuOpen(false); return; }
                                        if (tabs.length === 0) await loadTabsOnDemand();
                                        setTabMenuOpen(true);
                                    }}
                                    disabled={!sheetId || loadingTabs}
                                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm bg-white text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400 cursor-pointer disabled:cursor-not-allowed"
                                >
                                    <span className={sheetName ? "text-slate-800" : "text-slate-400"}>
                                        {loadingTabs ? "Loading…" : sheetName || "Click to load tabs"}
                                    </span>
                                </button>
                                {tabMenuOpen && tabs.length > 0 && (
                                    <div className="absolute z-20 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/60 max-h-56 overflow-auto text-sm">
                                        {tabs.map((t) => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => {
                                                    setSheetName(t.title);
                                                    setSheetGid(t.id ?? null);
                                                    setTabMenuOpen(false);
                                                }}
                                                className={`w-full px-4 py-2 text-left hover:bg-slate-50 cursor-pointer ${
                                                    sheetName === t.title ? "bg-slate-50 font-medium" : ""
                                                }`}
                                            >
                                                {t.title}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Column Mapping */}
                    <div>
                        <label className="block text-sm font-medium text-slate-800 mb-2">
                            3. Column Mapping
                        </label>
                        <div className="bg-slate-50 rounded-lg border border-slate-100 p-5">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-4">
                                {[
                                    { label: "File Name", key: "filename" },
                                    { label: "Invoice Date", key: "date" },
                                    { label: "Billed To", key: "billed_to" },
                                    { label: "Card (Last 4)", key: "card_last_4" },
                                    { label: "Amount (successful)", key: "amount" },
                                    { label: "Amount (unsuccessful)", key: "amountFailed" },
                                    { label: "Currency", key: "currency" },
                                    { label: "Drive Link", key: "driveLink" },
                                    { label: "หมายเลขอ้างอิง", key: "reference" },
                                ].map((field) => (
                                    <div key={field.key} className="flex flex-col gap-1.5">
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                            {field.label}
                                        </span>
                                        <select
                                            value={(sheetMapping as any)[field.key] ?? (defaultMapping as any)[field.key] ?? ""}
                                            onChange={e => updateMapping(field.key as any, e.target.value)}
                                            className="px-3 py-2 rounded-md border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono text-slate-700 w-full"
                                        >
                                            <option value="">- Skip -</option>
                                            {colOptions.map(col => (
                                                <option key={col} value={col}>Column {col}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <p className="text-xs text-slate-400 mt-2">
                            Choose which column (A-Z) each piece of extracted data should be inserted into.
                        </p>
                    </div>

                    <hr className="border-slate-100" />

                    <div className="flex flex-col sm:flex-row items-center gap-4 justify-between pt-2">
                        <a
                            href="https://sheets.google.com/create"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-800 transition-colors order-2 sm:order-1"
                        >
                            Create new Sheet <ExternalLink className="w-3.5 h-3.5" />
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
                            {saved ? "Saved Configuration" : "Save All Changes"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
