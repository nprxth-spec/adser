import Link from "next/link";
import { ArrowRight } from "lucide-react";
import PublicNav from "@/components/PublicNav";

export const metadata = {
  title: "What it does – Adser",
  description: "Adser automates your Facebook Ads invoice workflow from PDF to Google Sheets and Drive.",
};

const features = [
  { title: "Upload invoice PDFs", desc: "Drag and drop or select PDFs from Facebook Ads. Supports Meta invoice formats." },
  { title: "AI extracts data", desc: "Gemini reads and extracts invoice date, card last 4, amount, currency, and Billed to." },
  { title: "Sync to Google Sheet", desc: "New row added to your chosen sheet automatically, with a link to the file in Drive." },
  { title: "Store in Google Drive", desc: "Every PDF is saved to your Drive folder automatically — by month or a folder you choose. No manual upload needed." },
  { title: "Processing history", desc: "View all processed invoices with date, amount, and Drive link in the dashboard." },
  { title: "Google sign-in", desc: "One account. Set your Sheet and Drive folder once in the dashboard." },
];

export default function WhatItDoesPage() {
  return (
    <div className="min-h-screen bg-white">
      <PublicNav />
      <main className="pt-24 sm:pt-28 pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto w-full">
          <div className="text-center mb-12">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              What it does
            </h1>
            <p className="text-gray-500 text-base sm:text-lg max-w-2xl mx-auto">
              Adser automates your Facebook Ads invoice workflow from PDF to spreadsheet.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map(({ title, desc }) => (
              <div key={title} className="p-5 rounded-lg border border-gray-100 bg-gray-50/50 hover:border-brand-100 hover:bg-brand-50/30 transition-all">
                <h2 className="font-semibold text-gray-900 mb-2">{title}</h2>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/how-it-works"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg landing-accent-bg text-white font-medium hover:opacity-95 transition-colors"
            >
              How it works <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-gray-200 text-gray-700 font-medium hover:border-brand-300 hover:text-brand-600 transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
