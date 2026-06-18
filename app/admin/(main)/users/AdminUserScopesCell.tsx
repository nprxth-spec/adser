"use client";

import { useState } from "react";

type ScopeResult = {
  ok: boolean;
  granted: string[];
  missing: string[];
  message: string;
  error?: string;
  verification?: string;
  grantedFromLogin?: string[];
  missingFromLogin?: string[];
  hint?: string;
};

const SCOPE_LABELS: Record<string, string> = {
  "https://www.googleapis.com/auth/drive": "Drive (สิทธิ์เต็ม/แชร์)",
  "https://www.googleapis.com/auth/drive.readonly": "Drive (อ่าน)",
  "https://www.googleapis.com/auth/drive.file": "Drive (สร้าง/อัปโหลด)",
  "https://www.googleapis.com/auth/spreadsheets": "Google Sheets",
};

const APP_SCOPE_URLS = Object.keys(SCOPE_LABELS);

function scopeLabel(url: string): string {
  return SCOPE_LABELS[url] ?? url;
}

export default function AdminUserScopesCell({ userId }: { userId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScopeResult | null>(null);

  const handleCheck = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/scopes`);
      const data = await res.json();
      setResult({
        ok: data.ok ?? false,
        granted: data.granted ?? [],
        missing: data.missing ?? [],
        message: data.message ?? (data.ok ? "สโคปครบ" : "สโคปไม่ครบ"),
        error: data.error,
        verification: data.verification,
        grantedFromLogin: data.grantedFromLogin,
        missingFromLogin: data.missingFromLogin,
        hint: data.hint,
      });
    } catch {
      setResult({
        ok: false,
        granted: [],
        missing: [],
        message: "เรียก API ไม่ได้",
        error: "network",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleCheck}
        disabled={loading}
        className="px-2 py-1 rounded border border-gray-300 bg-white text-gray-700 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 w-fit"
      >
        {loading ? "กำลังตรวจ..." : "ตรวจสอบสิทธิ์"}
      </button>
      {result && (
        <div className="text-xs max-w-[280px]">
          {result.ok ? (
            <span className="text-emerald-600 font-medium">✓ สโคปครบ</span>
          ) : result.verification &&
            (result.verification === "tokeninfo_failed" ||
              result.verification === "no_valid_token" ||
              result.verification === "request_failed") ? (
            <div className="text-amber-800 space-y-0.5">
              <span className="font-medium">⚠ ตรวจโทเค็นไม่ได้</span>
              {result.message && (
                <p className="text-gray-600 mt-0.5">{result.message}</p>
              )}
              {result.hint && (
                <p className="text-gray-500 mt-0.5">{result.hint}</p>
              )}
              {result.grantedFromLogin && result.grantedFromLogin.length > 0 && (
                <div className="mt-1 text-gray-600">
                  <span className="font-medium text-gray-700">
                    สโคปตอนล็อกอินล่าสุด (จากฐานข้อมูล):
                  </span>
                  <ul className="list-disc list-inside mt-0.5">
                    {result.grantedFromLogin
                      .filter((s) => APP_SCOPE_URLS.includes(s))
                      .map((s) => (
                        <li key={s}>{scopeLabel(s)}</li>
                      ))}
                  </ul>
                  {result.missingFromLogin && result.missingFromLogin.length > 0 && (
                    <p className="text-amber-700 mt-0.5">
                      ขาดตอนล็อกอิน:{" "}
                      {result.missingFromLogin.map(scopeLabel).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-amber-700 space-y-0.5">
              <span className="font-medium">✗ สโคปไม่ครบ</span>
              {result.missing.length > 0 && (
                <ul className="list-disc list-inside mt-0.5 text-gray-600">
                  {result.missing.map((s) => (
                    <li key={s}>{scopeLabel(s)}</li>
                  ))}
                </ul>
              )}
              {result.message && (
                <p className="text-gray-500 mt-0.5">{result.message}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
