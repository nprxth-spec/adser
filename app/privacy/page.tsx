import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = {
  title: "Privacy Policy – Files Go",
  description: "Privacy policy for Files Go – how we collect, use, and protect your data.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-700 hover:text-slate-900 transition-colors"
          >
            <div className="w-8 h-8 rounded-md landing-accent-bg flex items-center justify-center shrink-0">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg">Files Go</span>
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
          Privacy Policy
        </h1>
        <p className="text-slate-500 text-sm mb-8">
          Last updated: March 2026
        </p>

        <div className="prose prose-slate max-w-none text-slate-700 space-y-6 text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              1. Introduction
            </h2>
            <p>
              Files Go (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting your privacy.
              This Privacy Policy explains how we collect, use, disclose, and safeguard your
              information when you use our service to upload Facebook Ads invoices, extract
              data, and sync to Google Sheets and Drive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              2. Information we collect
            </h2>
            <p>
              We may collect information you provide directly (e.g. account email, name from
              Google sign-in), data from the PDF invoices you upload (for processing and
              syncing to your Google Sheets), and usage data (e.g. how you use the app) to
              improve our service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              3. How we use your information
            </h2>
            <p>
              We use your information to provide and improve Files Go, to sync invoice data
              to your chosen Google Sheets and Drive, to communicate with you, and to comply
              with legal obligations. We do not sell your personal information.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              4. Data storage and security
            </h2>
            <p>
              Your data is stored using industry-standard practices. Google Sheets and Drive
              data is stored in your own Google account according to Google&apos;s policies.
              We retain account and usage data only as long as necessary to provide the
              service and as required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              5. Your rights
            </h2>
            <p>
              Depending on your location, you may have the right to access, correct, delete,
              or export your personal data. You can delete your account and associated data
              from the Billing / account settings page. For other requests, contact us using
              the details below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              6. Contact
            </h2>
            <p>
              For questions about this Privacy Policy or your data, please contact us through
              the support channel provided in the app or on our website.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-6 border-t border-slate-100">
          <Link
            href="/"
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
