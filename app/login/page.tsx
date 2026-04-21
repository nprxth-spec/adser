"use client";

import { signIn } from "next-auth/react";
import { Zap, Shield, FileText } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

export default function LoginPage() {
    const { t } = useAppPreferences();
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 flex items-center justify-center p-6">
            {/* Background orbs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-teal-600/10 blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl">
                    {/* Logo */}
                    <div className="flex items-center justify-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl landing-accent-bg flex items-center justify-center shadow-lg">
                            <Zap className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xl font-bold text-white">Files Go</span>
                    </div>

                    {/* Heading */}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white mb-2">{t("ยินดีต้อนรับกลับ", "Welcome back")}</h1>
                        <p className="text-slate-400 text-sm">
                            {t("เข้าสู่ระบบเพื่อเริ่มทำงานใบแจ้งหนี้อัตโนมัติ", "Sign in to start automating your invoice workflow")}
                        </p>
                    </div>

                    {/* Google Button */}
                    <button
                        onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                        className="w-full flex items-center justify-center gap-3 py-3.5 px-6 rounded-xl bg-white text-slate-800 font-semibold text-base hover:bg-slate-50 active:scale-95 transition-all shadow-lg mb-6 cursor-pointer"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                fill="#4285F4"
                                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                            />
                            <path
                                fill="#34A853"
                                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                                fill="#FBBC05"
                                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                                fill="#EA4335"
                                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                        </svg>
                        {t("ดำเนินการต่อด้วย Google", "Continue with Google")}
                    </button>

                    {/* Divider */}
                    <div className="relative mb-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-white/10" />
                        </div>
                        <div className="relative flex justify-center">
                            <span className="px-3 text-xs text-slate-500 bg-transparent">
                                {t("สิทธิ์ที่เราเข้าถึง", "What we access")}
                            </span>
                        </div>
                    </div>

                    {/* Permissions */}
                    <div className="space-y-3">
                        {[
                            {
                                icon: FileText,
                                title: "Google Drive",
                                desc: t("อัปโหลดใบแจ้งหนี้ไปยังโฟลเดอร์เฉพาะใน Drive ของคุณ", "Upload invoices to a dedicated folder in your Drive."),
                            },
                            {
                                icon: Shield,
                                title: "Google Sheets",
                                desc: t("เพิ่มแถวข้อมูลที่ดึงแล้วลงในสเปรดชีตของคุณ", "Append extracted data rows to your spreadsheet."),
                            },
                        ].map(({ icon: Icon, title, desc }) => (
                            <div
                                key={title}
                                className="flex items-start gap-3 p-3 rounded-xl bg-white/5 border border-white/5"
                            >
                                <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                                    <Icon className="w-4 h-4 text-teal-500" />
                                </div>
                                <div>
                                    <p className="text-white text-sm font-medium">{title}</p>
                                    <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Privacy notice */}
                    <p className="text-center text-xs text-slate-500 mt-6 leading-relaxed">
                        {t("เมื่อดำเนินการต่อ เท่ากับคุณยอมรับ", "By continuing, you agree to our")}{" "}
                        <a href="#" className="text-teal-500 hover:underline">
                            {t("ข้อกำหนดการใช้งาน", "Terms of Service")}
                        </a>{" "}
                        {t("และ", "and")}{" "}
                        <a href="#" className="text-teal-500 hover:underline">
                            {t("นโยบายความเป็นส่วนตัว", "Privacy Policy")}
                        </a>
                        {t("เราเข้าถึงเฉพาะไฟล์ Drive และ Sheets ที่สร้างโดย Files Go เท่านั้น", ". We only access Drive and Sheets files created by Files Go.")}
                    </p>
                </div>
            </div>
        </div>
    );
}
