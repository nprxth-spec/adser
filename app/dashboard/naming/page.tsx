"use client";

import { useEffect, useState, useRef } from "react";
import { Save, Loader2, FileText, Plus, X, Eye, RotateCcw, GripVertical } from "lucide-react";
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

const DEFAULT_TEMPLATE: TemplateItem[] = [
  { type: "field",   key: "card_prefix",       id: "d1" },
  { type: "literal", value: " - ",             id: "d2" },
  { type: "field",   key: "original_filename", id: "d3" },
  { type: "literal", value: " (",              id: "d4" },
  { type: "field",   key: "billed_to",         id: "d5" },
  { type: "literal", value: ")",               id: "d6" },
];

let _idSeq = 0;
function genId() { return `i${Date.now()}${++_idSeq}`; }
function cloneWithIds(items: any[]): TemplateItem[] {
  return items.map((item) => ({ ...item, id: item.id || genId() }));
}

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

  const [template, setTemplate] = useState<TemplateItem[]>(cloneWithIds(DEFAULT_TEMPLATE));
  const [rawText, setRawText] = useState("");
  const [loading, setLoading] = useState(true);
  const mappingLoadedFromServer = useRef(false); // true once we got data from server
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Inline insert state: -1 = before first chip, n = after chip n
  const [insertAfterIdx, setInsertAfterIdx] = useState<number | null>(null);
  const [insertText, setInsertText] = useState("");

  // Inline edit state for literal chips
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const insertInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tRes, mRes] = await Promise.all([
          fetch("/api/filename-template"),
          fetch("/api/filename-mapping"),
        ]);
        const [tData, mData] = await Promise.all([tRes.json(), mRes.json()]);
        if (Array.isArray(tData?.data) && tData.data.length > 0)
          setTemplate(cloneWithIds(tData.data));
        if (mData?.data) { setRawText(serializeMapping(mData.data)); mappingLoadedFromServer.current = true; }
      } catch {}
      setLoading(false);
    })();
  }, []);

  // ── Drag & Drop ────────────────────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(idx));
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdx !== idx) setDragOverIdx(idx);
  };
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null); setDragOverIdx(null); return;
    }
    setTemplate((prev) => {
      const next = [...prev];
      const [item] = next.splice(dragIdx, 1);
      const at = dragIdx < targetIdx ? targetIdx - 1 : targetIdx;
      next.splice(at, 0, item);
      return next;
    });
    setDragIdx(null); setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // ── Inline insert ──────────────────────────────────────────────────────────
  const openInsert = (afterIdx: number) => {
    setInsertAfterIdx(afterIdx);
    setInsertText("");
    setEditingId(null);
    setTimeout(() => insertInputRef.current?.focus(), 30);
  };
  const commitInsert = () => {
    const val = insertText;
    const after = insertAfterIdx;
    setInsertAfterIdx(null);
    setInsertText("");
    if (!val || after === null) return;
    setTemplate((prev) => {
      const next = [...prev];
      const insertAt = after < 0 ? 0 : after + 1;
      next.splice(insertAt, 0, { type: "literal", value: val, id: genId() });
      return next;
    });
  };

  // ── Inline edit literal ────────────────────────────────────────────────────
  const startEdit = (item: TemplateItem) => {
    if (item.type !== "literal") return;
    setEditingId(item.id);
    setEditText(item.value);
    setInsertAfterIdx(null);
    setTimeout(() => editInputRef.current?.focus(), 30);
  };
  const commitEdit = () => {
    const id = editingId;
    const val = editText;
    setEditingId(null);
    if (!id) return;
    if (!val.trim()) {
      setTemplate((prev) => prev.filter((i) => i.id !== id));
      return;
    }
    setTemplate((prev) =>
      prev.map((item) =>
        item.id === id && item.type === "literal" ? { ...item, value: val } : item
      )
    );
  };

  const remove = (id: string) => setTemplate((prev) => prev.filter((i) => i.id !== id));
  const addField = (key: string) =>
    setTemplate((prev) => [...prev, { type: "field", key, id: genId() }]);
  const resetToDefault = () => setTemplate(cloneWithIds(DEFAULT_TEMPLATE));

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setSaved(false); setError("");
    try {
      const mapping = parseMapping(rawText);
      // Safety: never overwrite existing mapping with empty unless we confirmed server has no data
      const shouldSaveMapping = rawText.trim() !== "" || mappingLoadedFromServer.current;
      const [tRes, mRes] = await Promise.all([
        fetch("/api/filename-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template }),
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
    original_filename: "invoice_2024-01",
    billed_to: "John Doe",
    date: "2024-01-15", amount: "150.00", currency: "USD",
    payment_method: "Visa", invoice_number: "INV-2026-001", reference_number: "REF-123456",
    transaction_id: "TXN-789012", account_id: "ACC-456789",
  };
  const preview = buildPreview(template, examples) + ".pdf";

  // ── Small helper component ─────────────────────────────────────────────────
  const InsertBtn = ({ afterIdx }: { afterIdx: number }) =>
    insertAfterIdx === afterIdx ? (
      <input
        ref={insertInputRef}
        value={insertText}
        onChange={(e) => setInsertText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commitInsert(); }
          if (e.key === "Escape") { setInsertAfterIdx(null); setInsertText(""); }
        }}
        onBlur={commitInsert}
        placeholder="..."
        className="w-16 px-1.5 py-1 text-xs font-mono border-2 border-teal-400 rounded-lg bg-white outline-none shadow-sm"
      />
    ) : (
      <button
        onClick={() => openInsert(afterIdx)}
        title={t("เพิ่มตัวคั่น", "Add separator here")}
        className="w-5 h-5 rounded-full flex items-center justify-center text-slate-300 hover:text-teal-600 hover:bg-teal-50 text-sm font-bold cursor-pointer transition-colors select-none"
      >
        +
      </button>
    );

  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="max-w-3xl mx-auto pb-12 w-full min-w-0">

      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">
          {t("กฎการตั้งชื่อไฟล์", "Filename Rules")}
        </h1>
        <p className="text-slate-500">
          {t(
            "กำหนดรูปแบบชื่อไฟล์โดยเลือกข้อมูลจากใบเสร็จ แล้วลากจัดลำดับตามต้องการ",
            "Configure the filename format by selecting invoice fields, then drag to reorder."
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

      {/* ── Template builder ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5 mb-5">

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="w-5 h-5 text-violet-500" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">{t("รูปแบบชื่อไฟล์", "Filename Template")}</p>
              <button
                onClick={resetToDefault}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 cursor-pointer transition-colors shrink-0"
              >
                <RotateCcw className="w-3 h-3" />
                {t("รีเซ็ต", "Reset")}
              </button>
            </div>
            <p className="text-sm text-slate-400">
              {t(
                "ลากชิปเพื่อเรียงลำดับ • กด + เพื่อพิมพ์ตัวคั่น • คลิกข้อความเพื่อแก้ไข",
                "Drag chips to reorder • Press + to type a separator • Click text to edit"
              )}
            </p>
          </div>
        </div>

        {/* ── Template strip ── */}
        <div
          className="min-h-[60px] p-3 rounded-xl bg-slate-50 border-2 border-dashed border-slate-200 flex flex-wrap gap-y-2 items-center"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            if (dragIdx !== null && template.length === 0) {
              e.preventDefault();
            }
          }}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          ) : template.length === 0 ? (
            <>
              <InsertBtn afterIdx={-1} />
              <span className="text-slate-400 text-sm italic ml-2">
                {t("ว่างอยู่ — คลิก + เพื่อเริ่ม", "Empty — click + to start")}
              </span>
            </>
          ) : (
            <>
              {/* Insert before first */}
              <InsertBtn afterIdx={-1} />

              {template.map((item, idx) => {
                const field = item.type === "field" ? FIELD_MAP[item.key] : null;
                const isDragging = dragIdx === idx;
                const isDragOver = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;
                const isEditing = editingId === item.id;

                return (
                  <div key={item.id} className="flex items-center gap-0.5">
                    {/* Chip */}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragEnd={handleDragEnd}
                      className={[
                        "flex items-center rounded-lg border text-xs font-medium select-none transition-all duration-100",
                        isDragging ? "opacity-30 scale-95" : "",
                        isDragOver ? "ring-2 ring-teal-400 ring-offset-1 scale-105" : "",
                        item.type === "field"
                          ? (field?.color ?? "bg-slate-100 text-slate-700 border-slate-200")
                          : "bg-white text-slate-600 border-slate-300 font-mono",
                      ].join(" ")}
                    >
                      {/* Drag handle */}
                      <span className="cursor-grab active:cursor-grabbing pl-1.5 py-1 text-slate-300 hover:text-slate-500 transition-colors">
                        <GripVertical className="w-3.5 h-3.5" />
                      </span>

                      {/* Content */}
                      {item.type === "field" ? (
                        <span className="px-1.5 py-1">
                          {t(field?.label ?? item.key, field?.labelEn ?? item.key)}
                        </span>
                      ) : isEditing ? (
                        <input
                          ref={editInputRef}
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); commitEdit(); }
                            if (e.key === "Escape") { setEditingId(null); }
                          }}
                          onBlur={commitEdit}
                          className="min-w-[2rem] w-auto bg-transparent outline-none py-1 px-1 font-mono text-xs border-b border-teal-400"
                          style={{ width: `${Math.max(editText.length + 1, 3)}ch` }}
                        />
                      ) : (
                        <span
                          className="px-1.5 py-1 cursor-text hover:text-slate-900 font-mono"
                          onClick={() => startEdit(item)}
                          title={t("คลิกเพื่อแก้ไข", "Click to edit")}
                        >
                          {item.value || <span className="text-slate-300 italic">empty</span>}
                        </span>
                      )}

                      {/* Remove */}
                      <button
                        onClick={() => remove(item.id)}
                        className="pr-1.5 py-1 pl-0.5 text-slate-300 hover:text-red-500 cursor-pointer transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Insert after this chip */}
                    <InsertBtn afterIdx={idx} />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* ── Available field tokens ── */}
        <div>
          <p className="text-xs font-medium text-slate-500 mb-2">
            {t("คลิกเพื่อเพิ่มข้อมูลต่อท้าย", "Click to append a field")}
          </p>
          <div className="flex flex-wrap gap-2">
            {TOKEN_FIELDS.map((field) => (
              <button
                key={field.key}
                onClick={() => addField(field.key)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer hover:opacity-75 active:scale-95 transition-all ${field.color}`}
              >
                <Plus className="w-3 h-3 shrink-0" />
                {t(field.label, field.labelEn)}
              </button>
            ))}
          </div>
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
