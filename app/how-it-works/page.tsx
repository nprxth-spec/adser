import Link from "next/link";
import { Upload, Sparkles, Sheet, ArrowRight } from "lucide-react";
import PublicNav from "@/components/PublicNav";

export const metadata = {
  title: "How it works – Adser",
  description: "Three simple steps: upload PDF, AI extracts data, sync to Google Drive and Sheets.",
};

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <main className="pt-24 sm:pt-28 pb-16 sm:pb-24 px-4 sm:px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-16">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              How it works
            </h1>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Three simple steps to automate your entire invoice workflow.
            </p>
          </div>

          <div className="space-y-12">
            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold text-white bg-brand-600 px-2 py-0.5 rounded-full">01</span>
                <div className="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-brand-600" />
                </div>
                <h2 className="font-semibold text-lg text-gray-900">Upload Invoice PDF</h2>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Drag and drop your Facebook Ads invoice PDF. We accept any PDF format.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example — PDF content we read</p>
                <pre className="font-mono text-xs sm:text-sm text-gray-600 overflow-x-auto whitespace-pre-wrap">
{`Invoice Date: 15 Jan 2026
Account: ********1234
Billed to: Acme Co.
Amount: $1,250.00
Currency: USD`}
                </pre>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold text-white bg-brand-600 px-2 py-0.5 rounded-full">02</span>
                <div className="w-12 h-12 rounded-lg bg-brand-50 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-brand-600" />
                </div>
                <h2 className="font-semibold text-lg text-gray-900">AI Extracts Data</h2>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Gemini reads the invoice and extracts date, card last 4 digits, amount, currency, and Billed to.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example — extracted fields</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Date", value: "15 Jan 2026" },
                    { label: "Card", value: "****1234" },
                    { label: "Amount", value: "1,250.00" },
                    { label: "Currency", value: "USD" },
                    { label: "Billed to", value: "Acme Co." },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-white rounded-md border border-gray-100 px-3 py-2">
                      <p className="text-xs text-gray-400 uppercase">{label}</p>
                      <p className="text-sm font-medium text-gray-800 truncate" title={value}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl p-6 sm:p-8 shadow-sm border border-gray-100">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-bold text-white bg-brand-600 px-2 py-0.5 rounded-full">03</span>
                <div className="w-12 h-12 rounded-lg bg-green-50 flex items-center justify-center">
                  <Sheet className="w-6 h-6 text-green-600" />
                </div>
                <h2 className="font-semibold text-lg text-gray-900">Syncs to Google</h2>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                The PDF is saved to your Google Drive folder automatically (by month or a folder you choose).
                A new row is appended to your Google Sheet with the extracted data and a link to the file in Drive.
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 overflow-x-auto">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Example — row added to your Sheet (PDF is in Drive automatically)</p>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Filename</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Date</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Card</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Amount</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Drive</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-3 py-2 text-gray-700">invoice_jan15.pdf</td>
                      <td className="px-3 py-2 text-gray-700">15 Jan 2026</td>
                      <td className="px-3 py-2 text-gray-700">1234</td>
                      <td className="px-3 py-2 text-gray-700">1,250.00 USD</td>
                      <td className="px-3 py-2 text-brand-600 text-xs">Open in Drive</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-brand-600 text-white font-medium hover:bg-brand-700 transition-colors"
            >
              Get started <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/what-it-does"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:border-brand-300 hover:text-brand-600 transition-colors"
            >
              What it does
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
