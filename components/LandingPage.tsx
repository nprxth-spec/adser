"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import {
  ArrowRight,
  CheckCircle2,
  Zap,
  Shield,
  Clock,
  FileText,
  Sparkles,
  Table,
} from "lucide-react";
import PublicNav from "@/components/PublicNav";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

export default function LandingPage() {
  const { t } = useAppPreferences();
  return (
    <div className="min-h-screen landing-bg">
      <PublicNav />

      {/* Hero */}
      <section className="pt-28 sm:pt-36 pb-20 sm:pb-28 px-4 sm:px-6 relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 w-[min(80vw,600px)] h-[min(80vw,600px)] rounded-full bg-teal-100/60 blur-3xl -translate-y-1/4 translate-x-1/4" />
          <div className="absolute bottom-0 left-0 w-[min(60vw,400px)] h-[min(60vw,400px)] rounded-full bg-amber-100/40 blur-3xl translate-y-1/2 -translate-x-1/4" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">
          <p className="font-heading text-sm font-semibold tracking-wide text-teal-700 uppercase mb-6">
            {t("ขับเคลื่อนด้วย Gemini", "Powered by Gemini")}
          </p>
          <h1 className="font-heading text-4xl sm:text-5xl md:text-6xl font-bold text-neutral-900 leading-[1.1] tracking-tight mb-6">
            {t("ใบแจ้งหนี้ Facebook Ads", "Facebook Ads invoices")}
            <br />
            <span className="text-teal-600">{t("สู่ Google Sheets อัตโนมัติ", "into Google Sheets")}</span>
          </h1>
          <p className="text-lg sm:text-xl text-neutral-600 max-w-2xl mx-auto mb-10 leading-relaxed">
            {t("อัปโหลด PDF แล้วระบบจะดึงวันที่ บัตร และยอดเงิน บันทึกไฟล์เข้า Drive และเพิ่มแถวลงชีตอัตโนมัติ ไม่ต้องคัดลอกเอง", "Upload a PDF. We extract date, card, and amount, save the file to your Drive, and add a row to your Sheet. No manual copy‑paste.")}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl landing-accent-bg text-white font-semibold hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden>
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              {t("เข้าสู่ระบบด้วย Google — ฟรี", "Sign in with Google — free")}
            </button>
            <Link
              href="/how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border-2 border-neutral-200 text-neutral-700 font-semibold hover:border-teal-300 hover:text-teal-700 transition-colors"
            >
              {t("วิธีการทำงาน", "How it works")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-neutral-500">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" /> {t("ไม่ต้องใช้บัตรเครดิต", "No credit card")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" /> {t("ฟรี 10 ใบแจ้งหนี้/เดือน", "10 invoices/month free")}
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" /> {t("ตั้งค่าเสร็จใน 1 นาที", "Set up in a minute")}
            </li>
          </ul>
        </div>
      </section>

      {/* Mini flow visual */}
      <section className="px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-3xl mx-auto">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 py-8 px-6 rounded-2xl bg-white/80 border border-neutral-200/80 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center">
                <FileText className="w-6 h-6 text-red-600" />
              </div>
              <span className="font-heading font-semibold text-neutral-800">PDF invoice</span>
            </div>
            <ArrowRight className="w-5 h-5 text-neutral-300 hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-teal-600" />
              </div>
              <span className="font-heading font-semibold text-neutral-800">AI extracts</span>
            </div>
            <ArrowRight className="w-5 h-5 text-neutral-300 hidden sm:block" />
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center">
                <Table className="w-6 h-6 text-teal-600" />
              </div>
              <span className="font-heading font-semibold text-neutral-800">Sheet + Drive</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 sm:py-24 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 text-center mb-12">
            Built for media buyers
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-neutral-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all">
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center mb-5">
                <Zap className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-neutral-900 mb-2">Instant extraction</h3>
              <p className="text-neutral-600 text-sm leading-relaxed mb-4">
                Gemini processes each invoice in seconds, any format.
              </p>
              <p className="text-xs text-neutral-400 uppercase tracking-wide">Example</p>
              <p className="text-xs text-neutral-500">1 PDF → ~5 sec → row in Sheet</p>
            </div>
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-neutral-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all">
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center mb-5">
                <Shield className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-neutral-900 mb-2">Secure & private</h3>
              <p className="text-neutral-600 text-sm leading-relaxed mb-4">
                PDFs go only to your Google Drive. We don’t store them.
              </p>
              <p className="text-xs text-neutral-400 uppercase tracking-wide">Example</p>
              <p className="text-xs text-neutral-500">Your file → your folder only</p>
            </div>
            <div className="bg-white rounded-2xl p-6 sm:p-8 border border-neutral-100 shadow-sm hover:shadow-md hover:border-teal-100 transition-all">
              <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center mb-5">
                <Clock className="w-5 h-5 text-teal-600" />
              </div>
              <h3 className="font-heading font-semibold text-lg text-neutral-900 mb-2">Full audit trail</h3>
              <p className="text-neutral-600 text-sm leading-relaxed mb-4">
                Every invoice logged with date, amount, and Drive link.
              </p>
              <p className="text-xs text-neutral-400 uppercase tracking-wide">Example</p>
              <p className="text-xs text-neutral-500">History + links in dashboard</p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 sm:py-28 px-4 sm:px-6 bg-white border-t border-neutral-100">
        <div className="max-w-4xl mx-auto">
          <h2 className="font-heading text-2xl sm:text-3xl font-bold text-neutral-900 text-center mb-3">
            Simple pricing
          </h2>
          <p className="text-neutral-500 text-center mb-12">Start free. Upgrade when you need more.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            <div className="rounded-2xl p-8 border-2 border-neutral-200 bg-neutral-50/50">
              <p className="text-sm font-semibold text-neutral-500 uppercase tracking-wide mb-2">Free</p>
              <p className="text-3xl font-heading font-bold text-neutral-900 mb-6">$0<span className="text-lg font-normal text-neutral-400">/month</span></p>
              <ul className="space-y-3 mb-8 text-sm text-neutral-600">
                {["10 invoices per month", "Google Drive + Sheets", "Processing history", "Email support"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="w-full py-3.5 rounded-xl border-2 border-neutral-300 text-neutral-700 font-semibold hover:border-teal-400 hover:text-teal-700 transition-colors cursor-pointer"
              >
                Get started free
              </button>
            </div>

            <div className="rounded-2xl p-8 border-2 border-teal-200 bg-teal-50/50 relative">
              <span className="absolute top-5 right-5 px-2.5 py-1 rounded-full bg-teal-200/80 text-teal-800 text-xs font-bold">Popular</span>
              <p className="text-sm font-semibold text-teal-700 uppercase tracking-wide mb-2">Pro</p>
              <p className="text-3xl font-heading font-bold text-teal-800 mb-6">$19<span className="text-lg font-normal text-teal-600">/month</span></p>
              <ul className="space-y-3 mb-8 text-sm text-teal-800/90">
                {["Unlimited invoices", "Priority AI processing", "Google Drive + Sheets", "Full history", "Priority support"].map((item) => (
                  <li key={item} className="flex items-center gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" /> {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
                className="w-full py-3.5 rounded-xl landing-accent-bg text-white font-semibold hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer"
              >
                Start free trial
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-10 px-4 sm:px-6 border-t border-neutral-100 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 text-neutral-700 hover:text-neutral-900 transition-colors">
            <div className="w-7 h-7 rounded-lg landing-accent-bg flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-heading font-bold text-neutral-900">Files Go</span>
          </Link>
          <p className="text-neutral-400 text-sm">© 2026 Files Go</p>
          <div className="flex gap-6 text-sm text-neutral-500">
            <Link href="/privacy" className="hover:text-teal-600 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-teal-600 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
