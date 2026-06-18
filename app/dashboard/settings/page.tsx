"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  Loader2,
  Save,
  Trash2,
  User,
  Paintbrush,
  Languages,
} from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";



export default function SettingsPage() {
  const { data: session, update } = useSession();
  const { theme, setTheme, language, setLanguage, t } = useAppPreferences();
  const [displayName, setDisplayName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setDisplayName(session?.user?.name ?? "");
  }, [session?.user?.name]);



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
      setNotice(t("บันทึกชื่อบัญชีแล้ว", "Profile name saved"));
    } catch (err: any) {
      window.alert(err?.message ?? t("บันทึกโปรไฟล์ไม่สำเร็จ", "Failed to save profile"));
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
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t("ตั้งค่า", "Settings")}</h1>
        <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t("จัดการบัญชี ธีม และภาษา", "Manage account, theme, and language.")}</p>
      </div>
      {notice && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900/30 dark:bg-emerald-950/20 dark:text-emerald-400">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5 lg:col-span-3">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("โปรไฟล์บัญชี", "Account profile")}</h2>
          </div>
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-300">{t("อีเมลที่ใช้เข้าสู่ระบบ:", "Signed in as:")} {session?.user?.email ?? "-"}</p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm flex-1 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                placeholder={t("ชื่อที่แสดง", "Display name")}
              />
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg landing-accent-bg text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
              >
                {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t("บันทึกชื่อ", "Save name")}
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Paintbrush className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("การแสดงผล", "Appearance")}</h2>
          </div>
          <div className="space-y-3">
            <input
              value={theme}
              readOnly
              className="hidden"
            />
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t("ธีม", "Theme")}</label>
            <select
              value={theme}
              onChange={(e) => {
                setTheme(e.target.value as "light" | "dark");
                setNotice(t("บันทึกธีมอัตโนมัติแล้ว", "Theme saved automatically"));
              }}
              className="w-full px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
            >
              <option value="light">{t("สว่าง", "Light")}</option>
              <option value="dark">{t("มืด", "Dark")}</option>
            </select>
          </div>
        </section>

        <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Languages className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">{t("ภาษา", "Language")}</h2>
          </div>
          <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t("ภาษาระบบ", "Application language")}</label>
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value as "th" | "en");
              setNotice(e.target.value === "th" ? "บันทึกภาษาอัตโนมัติแล้ว" : "Language saved automatically");
            }}
            className="w-full px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </section>
      </div>



      <section className="bg-white dark:bg-gray-900 rounded-xl border border-red-100 dark:border-red-950/30 p-5">
        <h2 className="font-semibold text-red-700 dark:text-red-400 mb-3">{t("ลบบัญชี", "Delete Account")}</h2>
        <p className="text-sm text-red-600 dark:text-red-400/80 mb-3">
          {t("การลบบัญชีจะลบข้อมูลทั้งหมดแบบถาวร รวมถึงประวัติการประมวลผล", "Deleting your account permanently removes all associated data, including processing history.")}
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          disabled={deleting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50 cursor-pointer"
        >
          {deleting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4" />
          )}
          {t("ลบบัญชี", "Delete account")}
        </button>
      </section>
    </div>
  );
}
