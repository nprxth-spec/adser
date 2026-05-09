import { prisma } from "@/lib/prisma";

/**
 * Atomically reserve the next available Google Sheet row for a user.
 *
 * Why this exists:
 *   - `values.append` with OVERWRITE has a race condition: two concurrent requests
 *     both read the same "last row" and overwrite each other → missing rows.
 *   - `values.append` with INSERT_ROWS inserts physical rows into the sheet, which
 *     disrupts formula rows the user has set up.
 *
 * Solution: use the DB as a row counter.
 *   A single atomic PostgreSQL UPDATE (COALESCE + increment) guarantees each caller
 *   gets a unique row number.  No two concurrent uploads ever target the same row.
 *   The caller then writes via batchUpdate to that exact pre-allocated row.
 *
 * Initialization (sheetWriteRow IS NULL):
 *   Seeds from the user's highest recorded sheetRow in ProcessingLog.
 *   COALESCE(NULL, seed) + 1 = seed + 1.
 *   If the user has no prior logs, seed = 1 → first write goes to row 2
 *   (assuming row 1 is the header).
 */
export async function reserveSheetRow(userId: string): Promise<number> {
    // Determine the seed for first-time initialisation.
    const lastLog = await prisma.processingLog.findFirst({
        where: { userId, sheetRow: { not: null } },
        orderBy: { sheetRow: "desc" },
        select: { sheetRow: true },
    });
    const seed = lastLog?.sheetRow ?? 1;

    // Single atomic SQL statement.
    // COALESCE handles the NULL (first-ever) case.
    // PostgreSQL row-level locking ensures concurrent callers are serialised,
    // so each gets a strictly different value.
    const result = await prisma.$queryRaw<[{ sheetWriteRow: number }]>`
        UPDATE "User"
        SET    "sheetWriteRow" = COALESCE("sheetWriteRow", ${seed}::int) + 1
        WHERE  id = ${userId}
        RETURNING "sheetWriteRow"
    `;

    return result[0]?.sheetWriteRow ?? 0;
}
