"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Loader2, Save, Trash2 } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

type ConnectionStatus = {
  connected: boolean;
  missingScopes: string[];
};

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const { theme, setTheme, language, setLanguage, t } = useAppPreferences();
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [driveFolderId, setDriveFolderId] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>({ connected: false, missingScopes: [] });
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDisplayName(session?.user?.name ?? "");
  }, [session?.user?.name]);

  useEffect(() => {
    const loadStatus = async () => {
      setLoadingStatus(true);
      try {
        const res = await fetch("/api/google/connection-status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (res.ok) {
          setStatus({
            connected: Boolean(data?.ok),
            missingScopes: data?.data?.missingScopes ?? [],
          });
        } else {
          setStatus({
            connected: false,
            missingScopes: data?.missingScopes ?? data?.data?.missingScopes ?? [],
          });
        }
      } finally {
        setLoadingStatus(false);
      }
    };

    const loadIntegrations = async () => {
      try {
        const [driveRes, integrationsRes] = await Promise.all([
          fetch("/api/drive-folder"),
          fetch("/api/integrations"),
        ]);
        const driveData = await driveRes.json().catch(() => null);
        const integrationsData = await integrationsRes.json().catch(() => null);
        setDriveFolderId(driveData?.data?.driveFolderId ?? null);
        const activeId = integrationsData?.data?.activeProfileId ?? "";
        const profiles = integrationsData?.data?.profiles ?? [];
        const activeProfile = profiles.find((p: any) => p.id === activeId) ?? profiles[0] ?? null;
        setSheetName(activeProfile?.sheetName ?? null);
        setSheetId(activeProfile?.sheetId ?? null);
      } catch {
        // noop
      }
    };

    void loadStatus();
    void loadIntegrations();
  }, []);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setNotice("");
    try {
      const res = await fetch("/api/account/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error ?? "Failed to save profile");
      await update();
      setNotice("บันทึกชื่อบัญชีแล้ว");
    } catch (err: any) {
      window.alert(err?.message ?? "Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeleteAccount = async () => {
    const ok = window.confirm(t("ลบบัญชีแบบถาวรใช่ไหม? การกระทำนี้ย้อนกลับไม่ได้", "Delete your account permanently? This action cannot be undone."));
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to delete account");
      }
      await signOut({ callbackUrl: "/" });
    } catch (err: any) {
      window.alert(err?.message ?? t("ลบบัญชีไม่สำเร็จ", "Failed to delete account"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t("ตั้งค่า", "Settings")}</h1>
        <p className="text-slate-500 text-sm mt-1">{t("จัดการบัญชี ธีม ภาษา และสถานะการเชื่อมต่อ", "Manage account, theme, language, and connection status.")}</p>
      </div>
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">{t("ตั้งค่าบัญชี", "Account Settings")}</h2>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">{t("เข้าสู่ระบบด้วย:", "Signed in as:")} {session?.user?.email ?? "-"}</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm flex-1"
              placeholder={t("ชื่อที่แสดง", "Display name")}
            />
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl landing-accent-bg text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
            >
              {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {t("บันทึกชื่อ", "Save name")}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">{t("ตั้งค่าสีธีม", "Theme")}</h2>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value as "light" | "dark");
              setNotice(t("บันทึกธีมอัตโนมัติแล้ว", "Theme saved automatically"));
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <option value="light">{t("สว่าง", "Light")}</option>
            <option value="dark">{t("มืด", "Dark")}</option>
          </select>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">{t("ตั้งค่าภาษา", "Language")}</h2>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as "th" | "en");
              setNotice(e.target.value === "th" ? "บันทึกภาษาอัตโนมัติแล้ว" : "Language saved automatically");
            }}
            className="px-3 py-2 rounded-lg border border-slate-200 text-sm"
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">{t("สถานะการเชื่อมต่อ", "Connection Status")}</h2>
        {loadingStatus ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> {t("กำลังตรวจสอบ...", "Checking...")}
          </div>
        ) : status.connected ? (
          <div className="space-y-1.5">
            <p className="text-sm text-green-700">{t("Google เชื่อมต่อแล้ว", "Google connected.")}</p>
            <p className="text-sm text-slate-600">
              {t("Sheets:", "Sheets:")} {sheetId ? `${sheetName ?? t("เชื่อมต่อแล้ว", "Connected")} (${sheetId.slice(0, 8)}...)` : t("ยังไม่ตั้งค่า", "Not configured")}
            </p>
            <p className="text-sm text-slate-600">
              {t("ปลายทาง Drive:", "Drive destination:")} {driveFolderId ? `${driveFolderId.slice(0, 12)}...` : t("อัตโนมัติ / ยังไม่ตั้งค่า", "Automatic / not set")}
            </p>
            {status.missingScopes.length > 0 && (
              <p className="text-xs text-amber-600">{t("คำเตือนสิทธิ์:", "Permission warning:")} {status.missingScopes.join(", ")}</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-600">{t("Google token หรือสิทธิ์ไม่ถูกต้อง", "Google token or permissions are invalid.")}</p>
            {status.missingScopes.length > 0 && (
              <p className="text-xs text-red-500">
                {t("สิทธิ์ที่ขาด:", "Missing scopes:")} {status.missingScopes.join(", ")}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="bg-white rounded-2xl border border-red-100 p-5">
        <h2 className="font-semibold text-red-700 mb-3">{t("ลบบัญชี", "Delete Account")}</h2>
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          {t("ลบบัญชี", "Delete account")}
        </button>
      </section>
    </div>
  );
}

