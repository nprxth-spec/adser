// lib/app-config.ts
//
// Centralized branding. The app name is set per deployment via the
// NEXT_PUBLIC_APP_NAME env var (inlined at build time, so it is available in
// both Server and Client Components). Each deploy builds with its own value;
// falls back to "Adser" when unset.
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Adser";
