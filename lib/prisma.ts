import { PrismaClient, Prisma } from "@prisma/client";
export { Prisma };

// Active database provider for this deploy. Mirrors scripts/set-db-provider.mjs
// (default postgresql). Use it when raw SQL must differ between providers —
// e.g. identifier quoting: PostgreSQL folds unquoted identifiers to lowercase,
// MySQL uses backticks.
export const DB_PROVIDER = (process.env.DB_PROVIDER || "postgresql")
  .trim()
  .toLowerCase();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
