import Link from "next/link";
import { Cog, Wrench } from "lucide-react";

export default function MaintenancePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-gray-950 text-gray-100 flex items-center justify-center px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/2 h-[36rem] w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-500/10 blur-3xl animate-maintenance-glow" />
        <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-brand-300/20 animate-maintenance-spin-slow" />
      </div>

      <div className="relative w-full max-w-xl rounded-xl border border-gray-800 bg-gray-900/75 p-8 shadow-2xl backdrop-blur animate-maintenance-float">
        <div className="mb-6 flex items-center justify-center">
          <div className="relative h-24 w-24">
            <Cog className="absolute left-1 top-1 h-14 w-14 text-brand-300 animate-spin" />
            <Cog className="absolute right-1 bottom-1 h-10 w-10 text-cyan-300 animate-maintenance-spin-reverse" />
            <Wrench className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-white/90" />
          </div>
        </div>

        <p className="text-sm text-brand-300 font-semibold tracking-wide uppercase animate-fade-in-up">
          Files Go
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight animate-fade-in-up-delay-1">
          ระบบอยู่ระหว่างปรับปรุง
        </h1>
        <p className="mt-4 text-gray-300 leading-relaxed animate-fade-in-up-delay-2">
          ขณะนี้เราอยู่ระหว่างอัปเดตระบบเพื่อให้ใช้งานได้ดีขึ้น
          กรุณากลับมาใหม่อีกครั้งในภายหลัง
        </p>
        <p className="mt-2 text-gray-400 text-sm animate-fade-in-up-delay-2">
          Sorry, we are currently under maintenance. Please check back soon.
        </p>

        <div className="mt-6 animate-fade-in-up-delay-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <div className="progress-bar h-full w-full" />
          </div>
          <p className="mt-2 text-xs text-gray-400">กำลังอัปเดตระบบและตรวจสอบความพร้อม...</p>
        </div>

        <div className="mt-8 border-t border-gray-800 pt-5 animate-fade-in-up-delay-3">
          <Link
            href="/"
            className="inline-flex items-center rounded-md bg-brand-500 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-brand-400 transition-all duration-300 hover:-translate-y-0.5"
          >
            ลองรีเฟรชอีกครั้ง
          </Link>
        </div>
      </div>
    </main>
  );
}

