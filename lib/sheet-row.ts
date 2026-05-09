import { prisma } from "@/lib/prisma";

/**
 * Atomically reserve the next available Google Sheet row for a user.
 *
 * Pass `seed` (the actual last data row detected from the real sheet) when
 * calling for the first time so the counter starts from the correct position.
 * On subsequent calls (sheetWriteRow already set) the seed is ignored and
 * the DB counter is simply incremented.
 *
 * Concurrent safety: the UPDATE is a single atomic SQL statement.
 * PostgreSQL row-level locking serialises concurrent callers so each gets a
 * strictly unique row number.
 */
export async function reserveSheetRow(
    userId: string,
    seed?: number,                 // actual last row from the sheet (used only on first init)
): Promise<number> {
    const effectiveSeed = seed ?? 1;

    const result = await prisma.$queryRaw<[{ sheetWriteRow: number }]>`
        UPDATE "User"
        SET    "sheetWriteRow" = COALESCE("sheetWriteRow", ${effectiveSeed}::int) + 1
        WHERE  id = ${userId}
        RETURNING "sheetWriteRow"
    `;

    return result[0]?.sheetWriteRow ?? 0;
}
