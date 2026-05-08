import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = {
  title: "Terms of Service – Files Go",
  description: "Terms of service for using Files Go.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-slate-700 hover:text-slate-900 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg landing-accent-bg flex items-center justify-center shrink-0">
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
          Terms of Service
        </h1>
        <p className="text-slate-500 text-sm mb-8">
          Last updated: March 2026
        </p>

        <div className="prose prose-slate max-w-none text-slate-700 space-y-6 text-sm sm:text-base">
          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              1. Acceptance of terms
            </h2>
            <p>
              By accessing or using Files Go, you agree to be bound by these Terms of Service.
              If you do not agree, do not use the service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              2. Description of service
            </h2>
            <p>
              Files Go allows you to upload Facebook Ads PDF invoices, extract data using
              AI, and sync the results to your Google Sheets and Google Drive. The service
              is provided &quot;as is&quot; and we reserve the right to modify or discontinue
              features with notice where appropriate.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              3. Your responsibilities
            </h2>
            <p>
              You are responsible for maintaining the security of your account and for all
              activity under your account. You must use the service in compliance with
              applicable laws and must not upload content you do not have the right to use.
              You are responsible for the accuracy of data synced to your Google Sheets and
              Drive.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              4. Acceptable use
            </h2>
            <p>
              You may not use Files Go to violate any law, infringe others&apos; rights, transmit
              malware, or abuse our or third-party systems (including Google APIs). We may
              suspend or terminate access for breach of these terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              5. Subscription and payment
            </h2>
            <p>
              Paid plans (e.g. Files Go Pro) are subject to the pricing and billing terms
              presented at the time of purchase. Fees are non-refundable except where
              required by law or as stated in our refund policy. We may change pricing with
              reasonable notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              6. Limitation of liability
            </h2>
            <p>
              To the maximum extent permitted by law, Files Go and its providers shall not
              be liable for any indirect, incidental, special, or consequential damages
              arising from your use of the service. Our total liability is limited to the
              amount you paid us in the twelve months before the claim.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-slate-900 mt-8 mb-2">
              7. Contact
            </h2>
            <p>
              For questions about these Terms of Service, please contact us through the
              support channel provided in the app or on our website.
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
