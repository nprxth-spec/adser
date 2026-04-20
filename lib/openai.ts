import { GoogleGenerativeAI, Schema, SchemaType } from "@google/generative-ai";

const ai = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

const MODEL_CANDIDATES = [
    process.env.GOOGLE_AI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-1.5-flash",
].filter((m): m is string => Boolean(m && m.trim()));

function isModelNotFoundError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err ?? "");
    return message.includes("[404 Not Found]") || message.toLowerCase().includes("no longer available");
}

function isRateLimitError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err ?? "");
    return message.includes("[429 Too Many Requests]") || message.toLowerCase().includes("resource exhausted");
}

async function sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
}

export interface InvoiceData {
    date: string;
    card_last_4: string;
    amount: number;
    currency: string;
    billed_to: string;
    /** true = payment successful (write amount to column G); false = payment failed/unsuccessful (write amount to column H). */
    paymentSuccess: boolean;
}

// Define the exact JSON schema Gemini must return
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
            description: "The name of the person or company the invoice is billed to (ใบเรียกเก็บเงินสำหรับ / Billed To). Return ONLY the name; omit any timezone prefix such as GMT+7, +12, GMT+12, etc.",
        },
        paymentSuccess: {
            type: SchemaType.BOOLEAN,
            description: "True if this receipt/invoice is for a successful payment (amount was charged). False if it is for a failed/unsuccessful payment (e.g. payment declined, unpaid, or explicitly marked as failed).",
        },
    },
    required: ["date", "card_last_4", "amount", "currency", "billed_to", "paymentSuccess"],
};

/** Strip timezone prefix (e.g. GMT+12, +7) from Billed To so we keep only the name. */
function normalizeBilledTo(raw: string): string {
    const s = (raw ?? "").trim();
    // Remove leading: optional "GMT", optional +/-, 1–2 digits, optional space
    return s.replace(/^\s*(?:GMT\s*)?[+-]?\d{1,2}\s*/i, "").trim();
}

/** Parse a number from text; supports "2.12", "2,120.50", "US$0.21". */
function parseAmount(raw: string): number {
    const n = Number(String(raw).replace(/,/g, "").trim());
    return Number.isNaN(n) ? 0 : n;
}

/**
 * If the receipt has "ยอดรวม: X USD" and "ภาษีมูลค่าเพิ่ม: US$Y", return X + Y (final total).
 * Otherwise returns 0 (not found).
 */
function subtotalPlusVatFromText(text: string): number {
    // ยอดรวม: 2.12 USD | ยอดรวม : 2.12 | Subtotal: 2.12 USD
    const subtotalMatch = text.match(/(?:ยอดรวม|Subtotal|subtotal)\s*:?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:USD|US\$|THB|฿)?/i);
    // ภาษีมูลค่าเพิ่ม: US$0.21 (อัตรา: 10%) | VAT: 0.21 | ภาษีมูลค่าเพิ่ม US$0.21
    const vatMatch = text.match(/(?:ภาษีมูลค่าเพิ่ม|VAT|tax)\s*:?\s*(?:US\$|USD|THB|฿)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    const subtotal = subtotalMatch ? parseAmount(subtotalMatch[1]) : 0;
    const vat = vatMatch ? parseAmount(vatMatch[1]) : 0;
    if (subtotal > 0 && vat >= 0) return Math.round((subtotal + vat) * 100) / 100;
    return 0;
}

/**
 * Prefer the FINAL total: either the big displayed amount (e.g. US$2.33) or
 * ยอดรวม + ภาษีมูลค่าเพิ่ม when both are present in the text.
 */
function pickBestAmountFromText(pdfText: string, baseAmount: number, currencyHint?: string): number {
    const text = (pdfText ?? "").slice(0, 8000);
    if (!text) return baseAmount;

    // Strategy 1: ยอดรวม + ภาษีมูลค่าเพิ่ม = total (e.g. 2.12 + 0.21 = 2.33)
    const subtotalPlusVat = subtotalPlusVatFromText(text);

    // Strategy 2: find all currency amounts and take the largest (the "big" total like US$2.33)
    const currencyTokens = [
        "USD",
        "US\\$",
        "THB",
        "฿",
        "EUR",
        "€",
        "JPY",
        "¥",
        "IDR",
        "SGD",
        "MYR",
        "RM",
    ];
    const hint = (currencyHint || "").toUpperCase();
    const filteredTokens = hint
        ? currencyTokens.filter((t) => t.replace(/\\W/g, "") === hint || t.toUpperCase() === hint)
        : currencyTokens;
    const tokenGroup = filteredTokens.length ? filteredTokens.join("|") : currencyTokens.join("|");
    const pattern1 = new RegExp(`(?:${tokenGroup})\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)`, "gi");
    const pattern2 = new RegExp(`([0-9][0-9,]*(?:\\.[0-9]{1,2})?)\\s*(?:${tokenGroup})`, "gi");
    const amounts: number[] = [];
    const collect = (regex: RegExp) => {
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            const num = parseAmount(match[1]);
            if (num > 0) amounts.push(num);
        }
    };
    collect(pattern1);
    collect(pattern2);
    const maxSingleAmount = amounts.length ? Math.max(...amounts) : 0;

    // Best candidate = largest of: (subtotal+VAT), (big single amount), (AI base)
    const candidates = [baseAmount, subtotalPlusVat, maxSingleAmount].filter((n) => n > 0);
    if (!candidates.length) return baseAmount;
    let best = Math.max(...candidates);
    // Avoid wild OCR numbers: cap at 5x base if base was set
    if (baseAmount > 0 && best > baseAmount * 5) best = baseAmount;
    return best;
}

/**
 * For failed/unsuccessful receipts, there is often still an intended amount.
 * Try to extract it from common labels even if no currency token is present.
 */
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

/**
 * Heuristic check on the raw PDF text to decide if this invoice is
 * clearly unsuccessful. This helps correct cases where the AI might
 * mis-classify paymentSuccess.
 *
 * Strategy:
 * - If we see strong failure keywords (TH/EN) → treat as failed.
 * - If we see explicit success words but no failure keywords → treat as success.
 * - Otherwise → return null and let the AI's paymentSuccess stand.
 */
function detectPaymentSuccessFromText(pdfText: string): boolean | null {
    const text = (pdfText ?? "").toLowerCase();
    if (!text) return null;

    // Normalize some Thai characters that often get weird in OCR (optional, lightweight)
    const norm = text.normalize("NFC");

    const failedKeywords = [
        // ภาษาไทย
        "ไม่สำเร็จ",
        "ไม่ส\u0e33เร็จ",
        "ไม่ ส\u0e33เร็จ",
        "รายการไม่สำเร็จ",
        "ดำเนินการไม่สำเร็จ",
        "ชำระเงินไม่ได้",
        "ชำระเงินไม่สำเร็จ",
        "ยกเลิกรายการ",
        "ไม่สามารถชำระเงิน",
        // ภาษาอังกฤษ
        "unsuccessful",
        "payment unsuccessful",
        "failed payment",
        "payment failed",
        "declined",
        "wasn't completed",
        "was not completed",
        "not completed",
        "transaction failed",
        "charge failed",
        "could not be processed",
        "could not be completed",
        "payment could not",
        "insufficient funds",
        "transaction declined",
        "your payment did not go through",
    ];

    for (const k of failedKeywords) {
        if (norm.includes(k.toLowerCase())) {
            return false;
        }
    }

    const successKeywords = [
        // ภาษาไทย
        "ชำระเงินสำเร็จ",
        "ทำรายการสำเร็จ",
        "ชำระเงินแล้ว",
        "ชำระ แล้ว",
        "ดำเนินการสำเร็จ",
        "รายการสำเร็จ",
        "ชำระเรียบร้อย",
        // ภาษาอังกฤษ
        "successful payment",
        "payment successful",
        "payment completed",
        "payment received",
        "payment has been received",
        "thank you for your payment",
        "transaction complete",
        "transaction successful",
        "charged successfully",
        "amount charged",
        "paid",
    ];

    for (const k of successKeywords) {
        if (norm.includes(k.toLowerCase())) {
            return true;
        }
    }

    return null;
}

export async function extractInvoiceData(pdfText: string): Promise<InvoiceData> {
    // Truncate to first 6000 chars — gives AI enough context to spot failure indicators
    const trimmedText = pdfText.slice(0, 6000);

    const prompt = `Extract the exact payment information from this billing receipt (e.g. Facebook Ads, Meta Ads, or similar).

Rules:
- If a value is truly missing, return an empty string or 0.
- For "billed_to": return ONLY the person or company name. If the PDF shows a timezone prefix (e.g. "GMT+12", "+7", "GMT+7") before the name, omit it and return just the name (e.g. "Yanto Rahim" not "GMT+12 Yanto Rahim").
- For "paymentSuccess":
  * Set FALSE if the document title, header, or body contains words like "Payment Unsuccessful", "Payment Failed", "ไม่สำเร็จ", "รายการไม่สำเร็จ", "Declined", "Transaction Failed", "Could not be processed", or similar failure indicators.
  * Set TRUE if the document shows a receipt for a completed charge, contains words like "Receipt", "Paid", "Payment Successful", "ชำระเงินสำเร็จ", "Amount Charged", or an amount was actually debited.
  * When in doubt and no explicit failure indicator is present, set TRUE.
- For "amount":
  * If payment is successful, return the final amount actually charged/debited (include VAT/tax/fees).
  * If payment is unsuccessful/failed, return the intended/attempted amount shown on the bill (e.g. Total, Amount due, Amount attempted). Do NOT return 0 unless the document truly has no amount.
  * If you see both subtotal and total including VAT, return the total including VAT.
  * On Meta/Facebook Thai receipts, prefer the big US$ amount on the right (e.g. "US$2.33") instead of the smaller "ยอดรวม" subtotal line.

--- RECEIPT TEXT ---
${trimmedText}`;

    try {
        let responseJson = "";
        let lastError: unknown;

        for (const modelName of MODEL_CANDIDATES) {
            const model = ai.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: invoiceSchema,
                    temperature: 0, // Deterministic, no hallucination
                },
            });

            // Retry small backoff when temporary quota/rate-limit happens.
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    const result = await model.generateContent(prompt);
                    responseJson = result.response.text();
                    lastError = undefined;
                    break;
                } catch (err) {
                    lastError = err;
                    if (isRateLimitError(err) && attempt < 2) {
                        await sleep(500 * (attempt + 1));
                        continue;
                    }
                    if (isModelNotFoundError(err)) {
                        break;
                    }
                    throw err;
                }
            }

            if (responseJson) {
                break;
            }
        }

        if (!responseJson) {
            throw lastError ?? new Error("No Gemini model available");
        }

        const parsed = JSON.parse(responseJson) as InvoiceData;

        const baseAmount = Number(parsed.amount) || 0;
        const finalAmount = pickBestAmountFromText(pdfText, baseAmount, parsed.currency);

        // Payment status — three-way logic:
        // 1. If heuristic finds a clear keyword (true/false) → use it as override.
        // 2. If heuristic is inconclusive (null) → trust the AI's paymentSuccess.
        // This prevents the old bug where unclear docs always defaulted to "success".
        const detected = detectPaymentSuccessFromText(pdfText);
        const paymentSuccess =
            detected !== null
                ? detected                          // heuristic is confident → use it
                : (parsed.paymentSuccess ?? true);  // heuristic unsure → trust AI

        // If failed docs come back as 0, recover from raw text by reading
        // "amount due/total/ยอด..." style labels.
        let adjustedAmount = finalAmount;
        if (!paymentSuccess && adjustedAmount <= 0) {
            const failedAmount = pickFailedAmountFromText(pdfText);
            if (failedAmount > 0) adjustedAmount = failedAmount;
        }

        return {
            date: parsed.date ?? "",
            card_last_4: parsed.card_last_4?.replace(/\D/g, "").slice(-4) ?? "",
            amount: adjustedAmount,
            currency: parsed.currency ?? "USD",
            billed_to: normalizeBilledTo(parsed.billed_to ?? ""),
            paymentSuccess,
        };
    } catch (err) {
        console.error("Gemini Extraction Error:", err);
        return { date: "", card_last_4: "", amount: 0, currency: "USD", billed_to: "", paymentSuccess: true };
    }
}
