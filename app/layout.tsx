import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import Providers from "@/components/Providers";
import { APP_NAME } from "@/lib/app-config";

const outfit = Outfit({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: `${APP_NAME} – Automate Facebook Ads Invoices`,
  description:
    "Upload Facebook Ads PDF invoices. AI extracts the data and syncs it to your Google Sheets automatically.",
  keywords: ["Facebook Ads", "Invoice", "Google Sheets", "Automation", "AI"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className={`${outfit.className} min-h-screen antialiased dark:bg-gray-950`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
