# AGENTS.md

Guidance for any AI agent working in this repository. Read this before making changes.

## What this project is

**Adser** is a Next.js web app that automates bookkeeping of ad-platform
invoices/receipts (mainly Meta/Facebook ads). The core flow:

1. A user uploads a PDF invoice/receipt (or picks one already in Google Drive).
2. The PDF text is extracted (`pdf-parse`) and sent to **Google Gemini** for
   structured data extraction (date, amount, currency, card last-4, billed-to,
   payment success, reference number, etc.).
3. The file is uploaded to **Google Drive**, organized into `year/month/day`
   subfolders, and renamed by a fixed template.
4. A row is appended to the user's **Google Sheet**.
5. Records with missing/uncertain fields go into a **review** queue instead.

There is also a **Meta/Facebook connector** (pull ad-account data via the
Marketing API) and an **admin dashboard** (users, logs, audit logs, analytics,
review moderation).

> Note: `package.json` `name` is still `new_project` — the product name is Adser.

## Tech stack

- **Next.js 16** (App Router) + **React 19**, **TypeScript** (`strict: true`)
- **Prisma 5** ORM over **PostgreSQL or MySQL** (selectable per deploy — see
  "Database provider" below; default PostgreSQL)
- **NextAuth v5 (beta)** — Google OAuth, JWT session strategy, Prisma adapter
- **Tailwind CSS v4** + shadcn-style UI (`components/ui`), `lucide-react`
- **AI:** `@google/generative-ai` (Gemini). Note: `lib/openai.ts` is the AI
  module — the filename is legacy, it uses **Gemini**, not OpenAI.
- **Google APIs:** `googleapis` (Drive + Sheets)
- **Stripe** packages are present (billing) but billing is partial.

## Commands

```bash
npm run dev             # next dev (local development)
npm run build           # set DB provider -> prisma generate -> next build
npm run start           # next start (production)
npm run lint            # eslint
npm run db:set-provider # rewrite schema provider from DB_PROVIDER
npm run db:push         # set provider -> prisma db push
npx prisma generate     # regenerate client after schema edits
```

This project uses `prisma db push` (no migrations folder), so there is no
per-provider migration history to maintain.

There is **no test suite**. Verify changes by running `npm run build` and
`npm run lint`, and by exercising the relevant flow in `npm run dev`.

## Project layout

```
app/                 Next.js App Router
  api/               Route handlers (server). Group: account, admin, auth,
                     connectors/meta, drive, google, history, review, upload
  dashboard/         User-facing app (history, settings, integrations,
                     connectors, naming, review, analytics)
  admin/             Admin dashboard (separate login, see lib/admin-auth.ts)
  (public pages)     /, login, privacy, terms, how-it-works, maintenance
components/          Shared React components; components/ui = primitives
lib/                 Server/shared logic — see below
prisma/schema.prisma Data model (MySQL)
middleware.ts        Edge middleware (auth gate + maintenance mode)
auth.config.ts       Edge-safe NextAuth config (no Prisma)
lib/auth.ts          Full NextAuth setup (Prisma adapter, callbacks)
```

### Key `lib/` modules

- `prisma.ts` — singleton Prisma client (re-exports `Prisma`).
- `auth.ts` — full NextAuth instance (`auth`, `handlers`, `signIn`, `signOut`).
- `google.ts` / `google-auth.ts` — Drive/Sheets ops; access-token refresh.
- `openai.ts` — Gemini invoice extraction (`extractInvoiceData`, `InvoiceData`).
- `meta.ts` — Meta/Facebook Marketing API helpers.
- `sheet-row.ts` — **concurrency control** for sheet writes
  (`reserveSheetRow`, `withUserSheetWriteLock`) to avoid race conditions on
  concurrent uploads. Use these instead of writing rows ad-hoc.
- `admin-auth.ts` — admin session (separate from user auth).
- `audit-log.ts`, `changelog.ts`, `maintenance.ts`, `sheet-row.ts`, `utils.ts`.

## Conventions & rules

- **Import alias:** `@/*` maps to the repo root (e.g. `@/lib/prisma`).
- **Edge runtime:** `middleware.ts` and `auth.config.ts` run on the Edge runtime
  and **MUST NOT import Prisma** or any Node-only module. Keep DB access in
  `lib/auth.ts` and route handlers (which set `runtime = "nodejs"`).
- **Route handlers:** heavy routes (e.g. `app/api/upload/route.ts`) declare
  `export const runtime = "nodejs"` and `export const maxDuration`. Match this
  pattern for routes doing PDF parsing, AI calls, or Google API work.
- **Auth in routes:** get the user with `const session = await auth()` from
  `@/lib/auth`; guard with a 401 when there's no `session.user`.
- **Google access tokens:** always obtain a valid token via
  `getValidGoogleAccessToken(userId)` — it handles refresh. Don't read
  `access_token` from the DB directly.
- **Sheet writes:** go through `lib/sheet-row.ts` locking helpers.
- **Locked config:** the Drive folder ID, folder mode (`year-month-day`), and
  filename template are intentionally hard-coded in `app/api/upload/route.ts`
  (`LOCKED_*` constants). Don't make them user-configurable without explicit ask.
- **i18n:** UI supports Thai (th) and English (uk); some comments and AI prompt
  text are in Thai. Preserve Thai strings exactly (esp. the billed-to label
  variants in `lib/openai.ts` — they match real document headers).
- **Style:** follow surrounding code — TypeScript strict, functional React
  components, Tailwind utility classes, named exports from `lib/`.

## Data model essentials (prisma/schema.prisma)

- `User` holds per-user config: `sheetId`, `sheetName`, `sheetGid`,
  `sheetMapping`, `driveFolderId/Mode`, `sheetWriteRow` (atomic row counter).
- `ProcessingLog` — one per processed file; `status` is `success` or `review`;
  `pendingData` (JSON) holds review-queue context.
- `MetaConnection` / `MetaAdAccount` — Facebook connector state.
- `AuditLog` — login/config-change audit trail.
- Auth tables: `Account`, `Session`, `User`, `VerificationToken`.

After editing the schema, run `npx prisma generate` (the build does this too).

The schema is provider-agnostic: the only DB-specific type used is `@db.Text`,
which is valid on both PostgreSQL and MySQL. Keep it that way — avoid
provider-specific native types or features.

## Database provider (PostgreSQL / MySQL)

This project runs on **either PostgreSQL or MySQL**, chosen **per deployment**
(the two production deploys use different databases). Prisma does not support
`env()` for `datasource.provider`, so `scripts/set-db-provider.mjs` rewrites the
`provider` line in `prisma/schema.prisma` at build time from the `DB_PROVIDER`
env var.

- `DB_PROVIDER=postgresql` (default if unset) or `DB_PROVIDER=mysql`.
- `DATABASE_URL` **must match** `DB_PROVIDER` (postgres URL with a postgres
  provider, etc.) or Prisma will fail to connect.
- `npm run build`, `npm run db:push`, and `postinstall` all run the swap script
  first, so deploys just need the two env vars set correctly.
- The committed schema keeps `provider = "postgresql"` (the default). The swap
  script may show `prisma/schema.prisma` as locally modified on a MySQL build —
  that is expected on the build host; don't commit that change.
- To switch locally: `DB_PROVIDER=mysql npm run db:set-provider && npx prisma generate`.

## Environment

Copy `.env.example` → `.env` and fill in. Required groups: `DB_PROVIDER` +
`DATABASE_URL` (matching pair — see "Database provider"), NextAuth secrets +
URLs, admin password/secret, Google OAuth client, `GOOGLE_AI_API_KEY` (Gemini).
Optional: Facebook app id/secret.

Operational env flags:
- `MAINTENANCE_MODE=true` — all pages redirect to `/maintenance`, APIs return
  503 (handled in `middleware.ts` / `lib/maintenance.ts`).
- `DEBUG_PDF_TEXT=true` — logs extracted PDF text in the upload route.

## Before you finish a change

1. `npm run lint` and `npm run build` pass.
2. No Prisma/Node imports leaked into Edge files (`middleware.ts`,
   `auth.config.ts`).
3. Schema changes stay provider-agnostic, are applied with `db push`, and
   `prisma generate` was run. Don't commit the provider line flipped to `mysql`.
4. Secrets stay in `.env` (never commit) — `.env.example` documents new vars.
