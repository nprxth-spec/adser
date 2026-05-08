"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { Zap } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

export default function PublicNav() {
  const { t } = useAppPreferences();
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-neutral-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 text-neutral-900 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-lg landing-accent-bg flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="font-heading font-bold text-lg">Files Go</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-neutral-600">
          <Link href="/what-it-does" className="hover:text-teal-600 transition-colors font-medium">
            {t("ทำอะไรได้บ้าง", "What it does")}
          </Link>
          <Link href="/how-it-works" className="hover:text-teal-600 transition-colors font-medium">
            {t("ทำงานอย่างไร", "How it works")}
          </Link>
          <Link href="/#pricing" className="hover:text-teal-600 transition-colors font-medium">
            {t("ราคา", "Pricing")}
          </Link>
        </div>
        <button
          onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
          className="px-4 py-2.5 rounded-xl landing-accent-bg text-white text-sm font-semibold hover:opacity-95 transition-opacity cursor-pointer"
        >
          {t("เข้าสู่ระบบ", "Sign in")}
        </button>
      </div>
    </nav>
  );
}
