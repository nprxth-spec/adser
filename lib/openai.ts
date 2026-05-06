import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

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
const invoiceSchema = {
    type: "object",
    additionalProperties: false,
    properties: {
        date: {
            type: "string",
            description: "Invoice date or Billing Date in YYYY-MM-DD format",
        },
        card_last_4: {
            type: "string",
            description: "Exactly the last 4 digits of the payment card (e.g., '1234' from 'MasterCard *1234' or 'Visa *1234')",
        },
        amount: {
            type: "number",
            description: "For successful payment documents: return the TOTAL amount actually charged/paid (final amount debited), including VAT/tax/fees. For unsuccessful payment documents: return the attempted/requested amount shown on the document (e.g. total, amount due, amount attempted), not 0 unless no amount exists at all.",
        },
        currency: {
            type: "string",
            description: "3-letter currency code (e.g., USD or THB)",
        },
        billed_to: {
            type: "string",
            description: "The name of the person or company the invoice is billed to (Billed To). Return ONLY the name; omit any timezone prefix such as GMT+7, +12, GMT+12, etc.",
        },
        paymentSuccess: {
            type: "boolean",
            description: "True if this receipt/invoice is for a successful payment (amount was charged). False if it is for a failed/unsuccessful payment (e.g. payment declined, unpaid, or explicitly marked as failed).",
        },
        payment_method: {
            type: "string",
            description: "Payment method used (e.g., 'Visa', 'MasterCard', 'Visa *5991'). Return empty string if not present.",
        },
        invoice_number: {
            type: "string",
            description: "Invoice number only (e.g., Invoice No., Billing No., Tax Invoice No.). Do not return reference number here. Return empty string if not present.",
        },
        reference_number: {
            type: "string",
            description: "Reference number only (e.g., Reference No., Ref, Reference ID). Do not return invoice number here. Return empty string if not present.",
        },
        transaction_id: {
            type: "string",
            description: "Transaction ID or payment ID shown on the document. Return empty string if not present.",
        },
        account_id: {
            type: "string",
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
} as const;

/** Strip timezone prefix (e.g. GMT+12, +7) from Billed To so we keep only the name. */
function normalizeBilledTo(raw: string): string {
    const s = (raw ?? "").trim();
    return s.replace(/^\s*(?:GMT\s*)?[+-]?\d{1,2}\s*/i, "").trim();
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
        /(?:ชำระแล้ว|paid)(?:[\s\S]{0,40}?)(?:US\$|USD|THB|฿)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi,
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

function pickBestAmountFromText(pdfText: string, baseAmount: number, currencyHint?: string): number {
    const text = (pdfText ?? "").slice(0, 8000);
    if (!text) return baseAmount;

    const paidAmount = paidAmountFromText(text);
    const subtotalPlusVat = subtotalPlusVatFromText(text);

    const currencyTokens = ["USD","US\\$","THB","฿","EUR","€","JPY","¥","IDR","SGD","MYR","RM"];
    // Use full token list to avoid missing symbol variants (e.g. "US$" when hint is "USD")
    const tokenGroup = currencyTokens.join("|");
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

    const candidates = [paidAmount, subtotalPlusVat, baseAmount, maxSingleAmount].filter((n) => n > 0);
    if (!candidates.length) return baseAmount;
    let best = paidAmount > 0 ? paidAmount : Math.max(...candidates);
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

function detectPaymentSuccessFromText(pdfText: string): boolean | null {
    if (!pdfText) return null;

    const normalize = (t: string) =>
        t.toLowerCase()
            .normalize("NFC")
            .replace(/\u0e4d\u0e32/g, "\u0e33");

    const textNorm = normalize(pdfText);
    const textNoSpace = textNorm.replace(/\s+/g, "");

    if (textNoSpace.includes("ชำระแล้ว")) return true;

    const failedKeywords = [
        "ไม่สำเร็จ","ไม่ส\u0e33เร็จ","paymentunsuccessful","failedpayment",
        "paymentfailed","declined","wasnotcompleted","wasn'tcompleted",
        "transactionfailed","chargefailed","couldnotbeprocessed",
        "couldnotbecompleted","insufficientfunds","yourpaymentdidnotgothrough","unsuccessful",
    ];
    for (const k of failedKeywords) {
        if (textNoSpace.includes(k.toLowerCase())) return false;
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
  * Set FALSE if the document title, header, or body contains words like "Payment Unsuccessful", "Payment Failed", "ไม่สำเร็จ", "รายการไม่สำเร็จ", "Declined", "Transaction Failed", "Could not be processed", or similar failure indicators.
  * Set TRUE if the document shows a receipt for a completed charge, contains words like "Receipt", "Paid", "Payment Successful", "ชำระเงินสำเร็จ", "Amount Charged", or an amount was actually debited.
  * When in doubt and no explicit failure indicator is present, set TRUE.
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
        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            temperature: 0,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "invoice_data",
                    strict: true,
                    schema: invoiceSchema,
                },
            },
            messages: [
                {
                    role: "system",
                    content:
                        "You extract structured invoice data. Return strictly valid JSON only that matches the schema.",
                },
                { role: "user", content: prompt },
            ],
        });

        const responseJson = completion.choices?.[0]?.message?.content ?? "";
        if (!responseJson) throw new Error("OpenAI returned empty response");

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

        return {
            date: parsed.date ?? "",
            card_last_4: normalizedLast4,
            amount: adjustedAmount,
            currency: parsed.currency ?? "USD",
            billed_to: normalizeBilledTo(parsed.billed_to ?? ""),
            paymentSuccess,
            payment_method: (parsed.payment_method ?? "").trim() || undefined,
            invoice_number: (parsed.invoice_number ?? "").trim() || undefined,
            reference_number: (parsed.reference_number ?? "").trim() || undefined,
            transaction_id: (parsed.transaction_id ?? "").trim() || undefined,
            account_id: (parsed.account_id ?? "").trim() || undefined,
        };
    } catch (err) {
        console.error("OpenAI Extraction Error:", err);
        throw err;
    }
}
