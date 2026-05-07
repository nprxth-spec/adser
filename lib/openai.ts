import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";

const ai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
const GEMINI_MODEL_CANDIDATES = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
].filter((m): m is string => Boolean(m && m.trim()));

export interface InvoiceData {
    date: string;
    card_last_4: string;
    amount: number;
    currency: string;
    billed_to: string;
    /** true = payment successful; false = payment failed/unsuccessful. */
    paymentSuccess: boolean;
    payment_method?: string;
    invoice_number?: string;
    reference_number?: string;
    transaction_id?: string;
    account_id?: string;
}

// Define the exact JSON schema model must return
const invoiceSchema: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        date: {
            type: SchemaType.STRING,
            description: "Invoice date or Billing Date in YYYY-MM-DD format",
        },
        card_last_4: {
            type: SchemaType.STRING,
            description: "Exactly the last 4 digits of the payment card (e.g., '1234' from 'MasterCard *1234' or 'Visa *1234')",
        },
        amount: {
            type: SchemaType.NUMBER,
            description: "For successful payment documents: return the TOTAL amount actually charged/paid (final amount debited), including VAT/tax/fees. For unsuccessful payment documents: return the attempted/requested amount shown on the document (e.g. total, amount due, amount attempted), not 0 unless no amount exists at all.",
        },
        currency: {
            type: SchemaType.STRING,
            description: "3-letter currency code (e.g., USD or THB)",
        },
        billed_to: {
            type: SchemaType.STRING,
            description: "The name of the person or company the invoice is billed to (Billed To). Return ONLY the name; omit any timezone prefix such as GMT+7, +12, GMT+12, etc.",
        },
        paymentSuccess: {
            type: SchemaType.BOOLEAN,
            description: "True if this receipt/invoice is for a successful payment (amount was charged). False if it is for a failed/unsuccessful payment (e.g. payment declined, unpaid, or explicitly marked as failed).",
        },
        payment_method: {
            type: SchemaType.STRING,
            description: "Payment method used (e.g., 'Visa', 'MasterCard', 'Visa *5991'). Return empty string if not present.",
        },
        invoice_number: {
            type: SchemaType.STRING,
            description: "Invoice number only (e.g., Invoice No., Billing No., Tax Invoice No.). Do not return reference number here. Return empty string if not present.",
        },
        reference_number: {
            type: SchemaType.STRING,
            description: "Reference number only (e.g., Reference No., Ref, Reference ID, หมายเลขอ้างอิง, เลขอ้างอิง). Do not return invoice number here. Return empty string if not present.",
        },
        transaction_id: {
            type: SchemaType.STRING,
            description: "Transaction ID or payment ID shown on the document. Return empty string if not present.",
        },
        account_id: {
            type: SchemaType.STRING,
            description: "Account ID (e.g., Facebook/Meta Ad Account ID). Return empty string if not present.",
        },
    },
    required: [
        "date",
        "card_last_4",
        "amount",
        "currency",
        "billed_to",
        "paymentSuccess",
        "payment_method",
        "invoice_number",
        "reference_number",
        "transaction_id",
        "account_id",
    ],
};

/** Strip timezone prefix (e.g. GMT+12, +7) from Billed To so we keep only the name. */
function normalizeBilledTo(raw: string): string {
    const s = (raw ?? "")
        .normalize("NFC")
        .replace(/\u0e4d\u0e32/g, "\u0e33")
        .trim();
    return s
        .replace(/^\s*(?:GMT\s*)?[+-]?\d{1,2}\s*/i, "")
        .replace(/^\s*(?:ใบเสร็จ\s*)?(?:สำหรับ|สําหรับ)\s*/i, "")
        .replace(/^\s*bill(?:ed)?\s*to\s*/i, "")
        .replace(/^\s*customer(?:\s*name)?\s*/i, "")
        .replace(/^\s*recipient\s*/i, "")
        .replace(/^\s*[+\-＋﹣−]?\d{1,2}\s*/, "")
        .replace(/^[\s:|,;.-]+/, "")
        .replace(/[\s:|,;.-]+$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
}

function isLikelyNotPersonOrCompany(line: string): boolean {
    const t = (line ?? "").trim();
    if (!t) return true;
    if (/^\d+$/.test(t)) return true;
    if (t.length < 2) return true;
    // Common non-name labels / noise.
    if (/(invoice|receipt|tax|total|subtotal|amount|vat|reference|transaction|account|date|payment|method|currency)/i.test(t)) return true;
    if (/(id\s*บัญชี|account\s*id|บัญชี\s*id|เลขที่บัญชี|account\s*number|เลขที่อ้างอิง|ref(?:erence)?\s*(?:no|number|id)?)/i.test(t)) return true;
    if (/(ที่อยู่|โทร|อีเมล|ภาษี|เลขประจำตัวผู้เสียภาษี|ใบกำกับ|ใบเสร็จ|ยอดรวม|ยอดชำระ)/i.test(t)) return true;
    // Looks like long id/hash/account number.
    if (/[A-Z0-9]{10,}/i.test(t) && !/\s/.test(t)) return true;
    // Mostly digits/symbols with too few letters -> likely not a person/company name.
    const letters = (t.match(/[A-Za-z\u0E00-\u0E7F]/g) || []).length;
    const digits = (t.match(/\d/g) || []).length;
    if (digits >= 6 && letters <= 2) return true;
    return false;
}

function billedToFromText(pdfText: string): string {
    const text = (pdfText ?? "").slice(0, 16000);
    if (!text) return "";

    const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 600);

    const labelRegex =
        /^(?:bill(?:ed)?\s*to|customer(?:\s*name)?|recipient|ใบเสร็จ(?:\s*สำหรับ)?|เรียกเก็บ(?:\s*ถึง)?|ลูกค้า)\s*[:\-]?\s*(.*)$/i;

    const candidates: Array<{ value: string; score: number }> = [];

    const scoreBilledToCandidate = (value: string, isInline: boolean): number => {
        let score = isInline ? 30 : 10;
        const letters = (value.match(/[A-Za-z\u0E00-\u0E7F]/g) || []).length;
        const digits = (value.match(/\d/g) || []).length;
        if (letters > 0) score += Math.min(letters, 20);
        if (digits > 0) score -= Math.min(digits * 2, 20);
        if (/[A-Za-z\u0E00-\u0E7F].*[A-Za-z\u0E00-\u0E7F]/.test(value)) score += 10;
        if (/^(?:id|account|ref|reference)\b/i.test(value)) score -= 30;
        return score;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const m = line.match(labelRegex);
        if (!m) continue;

        const inlineValue = normalizeBilledTo(m[1] ?? "");
        if (inlineValue && !isLikelyNotPersonOrCompany(inlineValue)) {
            candidates.push({
                value: inlineValue,
                score: scoreBilledToCandidate(inlineValue, true),
            });
        }

        // Often the value is on next line(s), not same line as label.
        for (let j = i + 1; j <= i + 3 && j < lines.length; j++) {
            const candidate = normalizeBilledTo(lines[j]);
            if (!candidate) continue;
            if (labelRegex.test(candidate)) continue;
            if (isLikelyNotPersonOrCompany(candidate)) continue;
            candidates.push({
                value: candidate,
                score: scoreBilledToCandidate(candidate, false),
            });
            break;
        }
    }

    const best = candidates.sort((a, b) => b.score - a.score)[0];
    return best?.value ?? "";
}

/** Parse a number from text; supports "2.12", "2,120.50", "US$0.21". */
function parseAmount(raw: string): number {
    const n = Number(String(raw).replace(/,/g, "").trim());
    return Number.isNaN(n) ? 0 : n;
}

function subtotalPlusVatFromText(text: string): number {
    const subtotalMatch = text.match(/(?:ยอดรวม|Subtotal|subtotal)\s*:?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:USD|US\$|THB|฿)?/i);
    const vatMatch = text.match(/(?:ภาษีมูลค่าเพิ่ม|VAT|tax)\s*:?\s*(?:US\$|USD|THB|฿)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    const subtotal = subtotalMatch ? parseAmount(subtotalMatch[1]) : 0;
    const vat = vatMatch ? parseAmount(vatMatch[1]) : 0;
    if (subtotal > 0 && vat >= 0) return Math.round((subtotal + vat) * 100) / 100;
    return 0;
}

function paidAmountFromText(text: string): number {
    const patterns = [
        /(?:ยอดชำระแล้ว|จำนวนเงินที่ชำระ|ชำระแล้ว|ยอดที่ชำระ|ยอดสุทธิ)\s*:?\s*(?:US\$|USD|THB|฿)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
        /(?:amount\s*charged|amount\s*paid|total\s*paid|paid\s*amount|final\s*amount|grand\s*total)\s*:?\s*(?:US\$|USD|THB|฿)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
        /(?:US\$|USD|THB|฿)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:charged|paid|ชำระแล้ว)/gi,
        /(?:ชำระแล้ว|paid)(?:[\s\S]{0,120}?)(?:US\$|USD|THB|฿)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
    ];

    const values: number[] = [];
    for (const pattern of patterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const amount = parseAmount(match[1]);
            if (amount > 0) values.push(amount);
        }
    }
    return values.length ? Math.max(...values) : 0;
}

type CurrencyToken =
    | "USD"
    | "US$"
    | "THB"
    | "฿"
    | "EUR"
    | "€"
    | "JPY"
    | "¥"
    | "IDR"
    | "SGD"
    | "MYR"
    | "RM";

function detectPrimaryCurrencyToken(text: string): CurrencyToken | null {
    const t = (text ?? "").toUpperCase();
    if (t.includes("US$") || t.includes("USD")) return "USD";
    if ((text ?? "").includes("฿") || t.includes("THB")) return "THB";
    if ((text ?? "").includes("€") || t.includes("EUR")) return "EUR";
    if ((text ?? "").includes("¥") || t.includes("JPY")) return "JPY";
    if (t.includes("IDR")) return "IDR";
    if (t.includes("SGD")) return "SGD";
    if (t.includes("MYR") || t.includes("RM")) return "MYR";
    return null;
}

function buildCurrencyRegexGroup(primary: CurrencyToken | null): string {
    const allTokens = ["USD","US\\$","THB","฿","EUR","€","JPY","¥","IDR","SGD","MYR","RM"];
    if (!primary) return allTokens.join("|");
    // Put primary currency first to help matching (even though regex order doesn't change results,
    // we use it for scoring).
    const primaryGroup =
        primary === "USD" ? ["USD", "US\\$"] :
        primary === "THB" ? ["THB", "฿"] :
        primary === "EUR" ? ["EUR", "€"] :
        primary === "JPY" ? ["JPY", "¥"] :
        primary === "MYR" ? ["MYR", "RM"] :
        [primary];
    const rest = allTokens.filter((t) => !primaryGroup.includes(t));
    return [...primaryGroup, ...rest].join("|");
}

function scoreAmountLine(line: string): number {
    const l = (line ?? "").toLowerCase();
    let score = 0;

    // Strong "this is the final paid total" signals
    if (/(amount\s*charged|charged\s*amount|amount\s*paid|total\s*paid|paid\s*amount|final\s*amount|grand\s*total)/i.test(line)) score += 50;
    if (/(ยอดชำระแล้ว|ชำระแล้ว|ยอดที่ชำระ|ยอดสุทธิ|ยอดรวมสุทธิ|รวมทั้งสิ้น)/i.test(line)) score += 50;
    if (/\btotal\b/i.test(line)) score += 20;

    // Weaker hints
    if (/(receipt|paid|payment\s*received|payment\s*completed)/i.test(line)) score += 10;

    // Penalize non-final numbers
    if (/(subtotal|vat|tax|ภาษี|ค่าธรรมเนียม|fee)/i.test(line)) score -= 20;
    if (/(rate|exchange|fx|conversion|converted|อัตราแลกเปลี่ยน)/i.test(line)) score -= 25;

    return score;
}

function bestAmountByLineScoring(pdfText: string, currencyHint?: string): number {
    const text = (pdfText ?? "").slice(0, 12000);
    if (!text) return 0;

    const primary = detectPrimaryCurrencyToken(text) ?? ((currencyHint || "").toUpperCase() as CurrencyToken);
    const tokenGroup = buildCurrencyRegexGroup(primary || null);

    const patterns = [
        new RegExp(`(?:${tokenGroup})\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, "gi"),
        new RegExp(`([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:${tokenGroup})`, "gi"),
    ];

    const lines = text.split(/\r?\n/).slice(0, 300); // keep it bounded
    let bestScore = -Infinity;
    let bestAmount = 0;

    for (let i = 0; i < lines.length; i++) {
        const window = [
            lines[i - 1] ?? "",
            lines[i] ?? "",
            lines[i + 1] ?? "",
        ].join("  ");

        const baseScore = scoreAmountLine(window);

        const amounts: number[] = [];
        for (const p of patterns) {
            p.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = p.exec(window)) !== null) {
                const num = parseAmount(m[1]);
                // Filter out obviously-wrong magnitudes for invoices (IDs, account numbers, etc.)
                if (num > 0 && num < 10_000_000) amounts.push(num);
            }
        }
        if (!amounts.length) continue;

        const candidate = Math.max(...amounts);
        const candidateScore = baseScore + (candidate >= 1 ? 1 : 0);

        if (candidateScore > bestScore) {
            bestScore = candidateScore;
            bestAmount = candidate;
        }
    }

    return bestAmount;
}

function pickBestAmountFromText(pdfText: string, baseAmount: number, currencyHint?: string): number {
    const text = (pdfText ?? "").slice(0, 8000);
    if (!text) return baseAmount;

    const lineScored = bestAmountByLineScoring(pdfText, currencyHint);
    const paidAmount = paidAmountFromText(text);
    const subtotalPlusVat = subtotalPlusVatFromText(text);

    const candidates = [lineScored, paidAmount, subtotalPlusVat, baseAmount].filter((n) => n > 0);
    if (!candidates.length) return baseAmount;
    // Prefer line-scored total; then paidAmount; otherwise max of remaining.
    let best = lineScored > 0 ? lineScored : (paidAmount > 0 ? paidAmount : Math.max(...candidates));
    if (baseAmount > 0 && best > baseAmount * 5) best = baseAmount;
    return best;
}

function pickFailedAmountFromText(pdfText: string): number {
    const text = (pdfText ?? "").slice(0, 8000);
    if (!text) return 0;

    const labelPattern = /(?:amount(?:\s+(?:due|charged|to\s+pay|attempted))?|total(?:\s+amount)?|ยอด(?:ชำระ|ที่ต้องชำระ|รวม)?|จำนวนเงิน|มูลค่า)\s*[:\-]?\s*(?:US\$|USD|THB|฿|EUR|€|JPY|¥|IDR|SGD|MYR|RM)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
    let match: RegExpExecArray | null;
    const amounts: number[] = [];
    while ((match = labelPattern.exec(text)) !== null) {
        const num = parseAmount(match[1]);
        if (num > 0) amounts.push(num);
    }
    if (!amounts.length) return 0;
    return Math.max(...amounts);
}

function extractCardLast4Fallback(pdfText: string): string {
    const text = (pdfText ?? "").slice(0, 12000);
    if (!text) return "";

    const patterns = [
        /(?:\*|x{2,}|•{2,})\s*(\d{4})/i,
        /(?:ending\s*(?:in|with)|last\s*4|card\s*(?:ending|last\s*4)?|ลงท้าย)\D{0,20}(\d{4})/i,
        /(?:mastercard|visa|amex|jcb|unionpay)\D{0,20}(\d{4})/i,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return m[1];
    }
    return "";
}

function paymentMethodFromText(pdfText: string): string {
    const text = (pdfText ?? "").slice(0, 12000);
    if (!text) return "";

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const brandPattern = /(mastercard|visa|amex|american express|jcb|unionpay|discover)/i;
    const last4Pattern = /(?:\*|x{2,}|•{2,}|\.{2,}|-{2,})\s*(\d{4})|\b(\d{4})\b/;

    for (let i = 0; i < lines.length; i++) {
        const window = [lines[i], lines[i + 1] ?? ""].join(" ");
        const brandMatch = window.match(brandPattern);
        if (!brandMatch) continue;

        const brandRaw = brandMatch[1];
        const brand = /american express/i.test(brandRaw) ? "Amex" : brandRaw[0].toUpperCase() + brandRaw.slice(1).toLowerCase();
        const last4Match = window.match(last4Pattern);
        const last4 = (last4Match?.[1] || last4Match?.[2] || "").replace(/\D/g, "").slice(-4);
        if (last4) return `${brand} *${last4}`;
        return brand;
    }

    return "";
}

function detectPaymentSuccessFromText(pdfText: string): boolean | null {
    if (!pdfText) return null;

    const normalize = (t: string) =>
        t.toLowerCase()
            .normalize("NFC")
            .replace(/\u0e4d\u0e32/g, "\u0e33");

    const textNorm = normalize(pdfText);
    const textNoSpace = textNorm.replace(/\s+/g, "");

    // ── Strong positive indicators — return true immediately ───────────────────
    // "ชำระแล้ว" = explicit Paid status on the document
    if (textNoSpace.includes("ชำระแล้ว")) return true;

    // ── Strip contextual false-positives before checking failure keywords ───────
    // Notes like "การชำระเงินก่อนหน้า...ไม่สำเร็จ" refer to a PREVIOUS failed
    // payment, not the current transaction — remove them so they don't pollute.
    // Strip ONLY the specific Meta footnote pattern:
    // "การชำระเงินก่อนหน้าสำหรับค่าใช้จ่าย...ไม่สำเร็จ" — this is a note about a
    // PRIOR failed charge, NOT about the current payment status.
    // We do NOT strip standalone "ไม่สำเร็จ" (the current payment status).
    const cleanedText = textNoSpace
        .replace(/การชำระเงินก่อนหน้า[^]*?ไม่สำเร็จ/g, "")
        .replace(/การชำระเงินก่อนหน้า[^]*?ไม่ส\u0e33เร็จ/g, "")
        .replace(/previous(?:ly)?payment[\s\S]{0,150}?(?:unsuccessful|failed)/g, "")
        .replace(/priortransaction[\s\S]{0,150}?(?:unsuccessful|failed)/g, "");

    const failedKeywords = [
        "ไม่สำเร็จ","ไม่ส\u0e33เร็จ","paymentunsuccessful","failedpayment",
        "paymentfailed","declined","wasnotcompleted","wasn'tcompleted",
        "transactionfailed","chargefailed","couldnotbeprocessed",
        "couldnotbecompleted","insufficientfunds","yourpaymentdidnotgothrough","unsuccessful",
    ];
    for (const k of failedKeywords) {
        if (cleanedText.includes(k.toLowerCase())) return false;
    }

    const successKeywords = [
        "ชำระเงินสำเร็จ","ทำรายการสำเร็จ","ชำระเงินแล้ว","ดำเนินการสำเร็จ",
        "รายการสำเร็จ","ชำระเรียบร้อย","successful payment","payment successful",
        "payment completed","payment received","payment has been received",
        "thank you for your payment","transaction complete","transaction successful",
        "charged successfully","amount charged",
    ];
    for (const k of successKeywords) {
        if (textNoSpace.includes(k.toLowerCase())) return true;
    }

    return null;
}

export async function extractInvoiceData(pdfText: string): Promise<InvoiceData> {
    const trimmedText = pdfText.slice(0, 6000);

    const prompt = `Extract the exact payment information from this billing receipt (e.g. Facebook Ads, Meta Ads, or similar).

Rules:
- If a value is truly missing, return an empty string or 0.
- For "billed_to": return ONLY the person or company name. If the PDF shows a timezone prefix (e.g. "GMT+12", "+7", "GMT+7") before the name, omit it and return just the name.
- For "paymentSuccess":
  * Set TRUE if: the document title/header/status shows "ชำระแล้ว", "Paid", "Receipt", "ใบเสร็จ", "Payment Successful", "ชำระเงินสำเร็จ", "Amount Charged", or an amount was actually debited.
  * Set FALSE ONLY if the document's PRIMARY status (title, header, or main status label) indicates failure: "Payment Unsuccessful", "Payment Failed", "ไม่สำเร็จ" as the main status, "Declined", "Transaction Failed", "Could not be processed".
  * IMPORTANT: Ignore failure phrases that describe a PREVIOUS payment attempt (e.g. "การชำระเงินก่อนหน้าสำหรับค่าใช้จ่ายสำหรับโฆษณาเหล่านี้ไม่สำเร็จ", "previous payment was unsuccessful"). These are informational footnotes about an earlier failed charge, NOT the status of the current document.
  * When in doubt and no explicit failure indicator is present in the MAIN document status, set TRUE.
- For "amount":
  * If payment is successful, return the final amount actually charged/debited (include VAT/tax/fees).
  * If payment is unsuccessful/failed, return the intended/attempted amount shown on the bill. Do NOT return 0 unless the document truly has no amount.
  * If you see both subtotal and total including VAT, return the total including VAT.
  * On Meta/Facebook Thai receipts, prefer the big US$ amount on the right instead of the smaller subtotal line.
- For "payment_method": extract the card brand/type (e.g. "Visa", "MasterCard", "Visa *5991"). Return empty string if not found.
- For "invoice_number": extract only invoice number (e.g. Invoice No., Billing No., Tax Invoice No.). Do NOT copy reference number into this field.
- For "reference_number": extract only reference number (e.g. Reference No., Ref, Reference ID). Do NOT copy invoice number into this field.
- If both invoice number and reference number exist, return both separately.
- For "transaction_id": extract the transaction or payment ID. Return empty string if not found.
- For "account_id": extract the account ID (e.g. Facebook Ad Account ID). Return empty string if not found.

--- RECEIPT TEXT ---
${trimmedText}`;

    try {
        let responseJson = "";
        let lastError: unknown;

        for (const modelName of GEMINI_MODEL_CANDIDATES) {
            try {
                const model = ai.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        responseMimeType: "application/json",
                        responseSchema: invoiceSchema,
                        temperature: 0,
                    },
                });
                const result = await model.generateContent(prompt);
                responseJson = result.response.text();
                if (responseJson) break;
            } catch (err) {
                lastError = err;
            }
        }

        if (!responseJson) {
            throw lastError ?? new Error("No Gemini Lite model available");
        }

        const parsed = JSON.parse(responseJson) as InvoiceData & {
            cardLast4?: string;
            card_last4?: string;
        };

        const baseAmount = Number(parsed.amount) || 0;
        const finalAmount = pickBestAmountFromText(pdfText, baseAmount, parsed.currency);

        const detected = detectPaymentSuccessFromText(pdfText);
        const paymentSuccess =
            detected !== null
                ? detected
                : (parsed.paymentSuccess ?? true);

        let adjustedAmount = finalAmount;
        if (!paymentSuccess && adjustedAmount <= 0) {
            const failedAmount = pickFailedAmountFromText(pdfText);
            if (failedAmount > 0) adjustedAmount = failedAmount;
        }

        const rawLast4 =
            parsed.card_last_4 ??
            parsed.cardLast4 ??
            parsed.card_last4 ??
            extractCardLast4Fallback(pdfText);
        const normalizedLast4 = String(rawLast4 ?? "").replace(/\D/g, "").slice(-4);

        const aiBilledTo = normalizeBilledTo(parsed.billed_to ?? "");
        const textBilledTo = billedToFromText(pdfText);
        const resolvedBilledTo = textBilledTo || aiBilledTo;
        const textPaymentMethod = paymentMethodFromText(pdfText);
        const aiPaymentMethod = (parsed.payment_method ?? "").trim();
        const resolvedPaymentMethod = textPaymentMethod || aiPaymentMethod;

        return {
            date: parsed.date ?? "",
            card_last_4: normalizedLast4,
            amount: adjustedAmount,
            currency: parsed.currency ?? "USD",
            billed_to: resolvedBilledTo,
            paymentSuccess,
            payment_method: resolvedPaymentMethod || undefined,
            invoice_number: (parsed.invoice_number ?? "").trim() || undefined,
            reference_number: (parsed.reference_number ?? "").trim() || undefined,
            transaction_id: (parsed.transaction_id ?? "").trim() || undefined,
            account_id: (parsed.account_id ?? "").trim() || undefined,
        };
    } catch (err) {
        console.error("Gemini Extraction Error:", err);
        throw err;
    }
}
