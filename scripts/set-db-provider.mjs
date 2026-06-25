// scripts/set-db-provider.mjs
//
// Sets the Prisma datasource `provider` from the DB_PROVIDER env var.
// Prisma does NOT support env() for `provider` (only for `url`), so we rewrite
// prisma/schema.prisma in place before `prisma generate` runs.
//
// Each deployment sets its own DB_PROVIDER (+ matching DATABASE_URL):
//   - PostgreSQL deploy:  DB_PROVIDER=postgresql
//   - MySQL deploy:       DB_PROVIDER=mysql
// Default (unset) is postgresql.
//
// Usage:
//   node scripts/set-db-provider.mjs           # uses DB_PROVIDER or default
//   DB_PROVIDER=mysql node scripts/set-db-provider.mjs

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(__dirname, "..", "prisma", "schema.prisma");

const SUPPORTED = ["postgresql", "mysql"];
const provider = (process.env.DB_PROVIDER || "postgresql").trim().toLowerCase();

if (!SUPPORTED.includes(provider)) {
  console.error(
    `[set-db-provider] Unsupported DB_PROVIDER "${provider}". ` +
      `Use one of: ${SUPPORTED.join(", ")}.`,
  );
  process.exit(1);
}

const schema = await readFile(schemaPath, "utf8");

// Replace the provider line inside the `datasource db { ... }` block only.
const updated = schema.replace(
  /(datasource\s+db\s*\{[^}]*?provider\s*=\s*)"(?:postgresql|mysql)"/,
  `$1"${provider}"`,
);

if (updated === schema) {
  if (new RegExp(`provider\\s*=\\s*"${provider}"`).test(schema)) {
    console.log(`[set-db-provider] datasource provider already "${provider}".`);
  } else {
    console.error(
      "[set-db-provider] Could not find the datasource provider line to update. " +
        "Check prisma/schema.prisma.",
    );
    process.exit(1);
  }
} else {
  await writeFile(schemaPath, updated, "utf8");
  console.log(`[set-db-provider] datasource provider set to "${provider}".`);
}
