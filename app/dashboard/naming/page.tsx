"use client";

import { useEffect, useState, useRef } from "react";
import { Save, Loader2, FileText, Eye, Lock } from "lucide-react";
import { useAppPreferences } from "@/components/AppPreferencesProvider";

// ── Token definitions ──────────────────────────────────────────────────────────
type TokenField = { key: string; label: string; labelEn: string; example: string; color: string };

const TOKEN_FIELDS: TokenField[] = [
  { key: "card_prefix",       label: "ชื่อบัตร",          labelEn: "Card name",        example: "WF-0004-1",    color: "bg-violet-100 text-violet-700 border-violet-200" },
  { key: "original_filename", label: "ชื่อไฟล์เดิม",       labelEn: "Original filename", example: "invoice_2024-01", color: "bg-blue-100 text-blue-700 border-blue-200" },
  { key: "billed_to",         label: "ใบเสร็จสำหรับ",      labelEn: "Billed to",        example: "John Doe",     color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { key: "date",              label: "วันที่เรียกเก็บ",     labelEn: "Invoice date",     example: "2024-01-15",   color: "bg-amber-100 text-amber-700 border-amber-200" },
  { key: "amount",            label: "Amount",             labelEn: "Amount",           example: "150.00",       color: "bg-orange-100 text-orange-700 border-orange-200" },
  { key: "currency",          label: "สกุลเงิน",           labelEn: "Currency",         example: "USD",          color: "bg-pink-100 text-pink-700 border-pink-200" },
  { key: "payment_method",    label: "วิธีการชำระเงิน",    labelEn: "Payment method",   example: "Visa",         color: "bg-cyan-100 text-cyan-700 border-cyan-200" },
  { key: "invoice_number",    label: "หมายเลขใบเรียกเก็บเงิน", labelEn: "Invoice no.", example: "INV-2026-001", color: "bg-lime-100 text-lime-700 border-lime-200" },
  { key: "reference_number",  label: "หมายเลขอ้างอิง",     labelEn: "Reference no.",    example: "REF-123456",   color: "bg-teal-100 text-teal-700 border-teal-200" },
  { key: "transaction_id",    label: "ID ธุรกรรม",         labelEn: "Transaction ID",   example: "TXN-789012",   color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  { key: "account_id",        label: "ID บัญชี",           labelEn: "Account ID",       example: "ACC-456789",   color: "bg-rose-100 text-rose-700 border-rose-200" },
];
const FIELD_MAP = Object.fromEntries(TOKEN_FIELDS.map((f) => [f.key, f]));

// ── Template item type ─────────────────────────────────────────────────────────
type TemplateItem =
  | { type: "field";   key: string;   id: string }
  | { type: "literal"; value: string; id: string };

// ── LOCKED template: {card_prefix} - {date} - {reference_number} ({billed_to})
export const LOCKED_TEMPLATE: TemplateItem[] = [
  { type: "field",   key: "card_prefix",      id: "t1" },
  { type: "literal", value: " - ",            id: "t2" },
  { type: "field",   key: "date",             id: "t3" },
  { type: "literal", value: " - ",            id: "t4" },
  { type: "field",   key: "reference_number", id: "t5" },
  { type: "literal", value: " (",             id: "t6" },
  { type: "field",   key: "billed_to",        id: "t7" },
  { type: "literal", value: ")",              id: "t8" },
];

// ── Card prefix mapping helpers ────────────────────────────────────────────────
type MappingObject = Record<string, string>;
function serializeMapping(m: MappingObject | null | undefined): string {
  if (!m) return "";
  return Object.entries(m).map(([k, v]) => `${k}=${v};`).join("\n");
}
function parseMapping(input: string): MappingObject {
  const result: MappingObject = {};
  for (const part of input.split(/[\n;]+/)) {
    const t = part.trim(); if (!t) continue;
    const eq = t.indexOf("="); if (eq === -1) continue;
    const k = t.slice(0, eq).trim(); const v = t.slice(eq + 1).trim();
    if (k && v) result[k] = v;
  }
  return result;
}

// ── Preview ────────────────────────────────────────────────────────────────────
function buildPreview(template: TemplateItem[], examples: Record<string, string>): string {
  return template.map((item) =>
    item.type === "field" ? (examples[item.key] ?? "") : item.value
  ).join("").trim() || "(empty)";
}

// ══════════════════════════════════════════════════════════════════════════════
export default function NamingRulesPage() {
  const { t } = useAppPreferences();

  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const mappingLoadedFromServer = useRef(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // ── Load (only mapping; template is locked so we still persist it as LOCKED) ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tRes, mRes] = await Promise.all([
          fetch("/api/filename-template"),
          fetch("/api/filename-mapping"),
        ]);
        const [, mData] = await Promise.all([tRes.json(), mRes.json()]);
        if (mData?.data) { setRawText(serializeMapping(mData.data)); mappingLoadedFromServer.current = true; }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setSaved(false); setError("");
    try {
      const mapping = parseMapping(rawText);
      const shouldSaveMapping = rawText.trim() !== "" || mappingLoadedFromServer.current;
      const [tRes, mRes] = await Promise.all([
        // Always persist the locked template
        fetch("/api/filename-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: LOCKED_TEMPLATE }),
        }),
        shouldSaveMapping ? fetch("/api/filename-mapping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mapping }),
        }) : Promise.resolve(new Response(JSON.stringify({ success: true }), { status: 200 })),
      ]);
      const [tData, mData] = await Promise.all([tRes.json(), mRes.json()]);
      if (!tRes.ok) throw new Error(tData.error ?? "Failed to save template");
      if (!mRes.ok) throw new Error(mData.error ?? "Failed to save mapping");
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: any) { setError(err.message ?? "Unexpected error"); }
    setSaving(false);
  };

  // ── Preview ────────────────────────────────────────────────────────────────
  const firstCard = Object.entries(parseMapping(rawText))[0];
  const examples: Record<string, string> = {
    card_prefix: firstCard ? firstCard[1] : "WF-0004-1",
    billed_to: "John Doe",
    date: "2024-01-15",
    reference_number: "REF-123456",
  };
  const preview = buildPreview(LOCKED_TEMPLATE, examples) + ".pdf";

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-3xl mx-auto pb-12 w-full min-w-0">

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
          {t("กฎการตั้งชื่อไฟล์", "Filename Rules")}
        </h1>
        <p className="text-slate-500">
          {t(
            "รูปแบบชื่อไฟล์ถูกกำหนดไว้แล้ว — แก้ไขได้เฉพาะการจับคู่ชื่อบัตร",
            "The filename format is fixed — you can only edit the card name mapping."
          )}
        </p>
      </div>

      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold">✓</span>
          <span>{t("บันทึกกฎชื่อไฟล์สำเร็จ", "Filename rules saved successfully")}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">{error}</div>
      )}

      {/* ── Locked Template Display ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5 mb-5">

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-slate-900">{t("รูปแบบชื่อไฟล์", "Filename Template")}</p>
              <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                <Lock className="w-3 h-3" />
                {t("ล็อก", "Locked")}
              </span>
            </div>
            <p className="text-sm text-slate-400">
              {t(
                "รูปแบบนี้ถูกกำหนดไว้แล้วและไม่สามารถเปลี่ยนแปลงได้",
                "This format is fixed and cannot be changed."
              )}
            </p>
          </div>
        </div>

        {/* ── Read-only template chips ── */}
        <div className="min-h-[52px] p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap gap-y-2 items-center">
          {LOCKED_TEMPLATE.map((item) => {
            const field = item.type === "field" ? FIELD_MAP[item.key] : null;
            return (
              <div key={item.id} className="flex items-center">
                {item.type === "field" ? (
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium ${field?.color ?? "bg-slate-100 text-slate-700 border-slate-200"}`}>
                    <Lock className="w-2.5 h-2.5 opacity-50" />
                    {t(field?.label ?? item.key, field?.labelEn ?? item.key)}
                  </span>
                ) : (
                  <span className="px-1 text-xs font-mono text-slate-500">{item.value}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Live preview ── */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <Eye className="w-4 h-4 text-slate-400" />
            <p className="text-xs font-medium text-slate-500">{t("ตัวอย่างชื่อไฟล์", "Filename preview")}</p>
          </div>
          <p className="font-mono text-sm text-slate-900 break-all leading-relaxed">{preview}</p>
          <p className="text-[11px] text-slate-400 mt-2">
            {t("ค่าด้านบนเป็นตัวอย่าง — ค่าจริงจะมาจากใบเสร็จที่อัปโหลด", "Values above are examples — actual values come from uploaded invoices.")}
          </p>
        </div>
      </div>

      {/* ── Card name mapping ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-indigo-500" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">{t("ชื่อบัตรตามเลข 4 ตัวท้าย", "Card name by last 4 digits")}</p>
            <p className="text-sm text-slate-400">
              {t("ตัวอย่าง:", "Example:")}{" "}
              <span className="font-mono text-slate-600">5991=WF-0004-1;</span>
            </p>
          </div>
        </div>

        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={5}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-y"
          placeholder={"5991=WF-0004-1;\n5821=WF-0004-2;\n9649=WF-0004-9;"}
        />
        <p className="text-xs text-slate-400">
          {t(
            "โทเค็น «ชื่อบัตร» ในรูปแบบด้านบนจะใช้ค่าจากตารางนี้",
            "The «Card name» token uses values from this table."
          )}
        </p>
      </div>

      {/* ── Save ── */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl landing-accent-bg text-white text-sm font-medium hover:opacity-95 disabled:opacity-50 transition-colors shadow-sm cursor-pointer disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Save className="w-4 h-4 shrink-0" />}
          <span>{saved ? t("บันทึกแล้ว", "Saved") : t("บันทึกกฎ", "Save Rules")}</span>
        </button>
      </div>

    </div>
  );
}
