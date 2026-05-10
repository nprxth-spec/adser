import { prisma } from "@/lib/prisma";

const userSheetWriteLock = new Map<string, Promise<void>>();

export async function withUserSheetWriteLock<T>(
    userId: string,
    fn: () => Promise<T>,
): Promise<T> {
    const previous = userSheetWriteLock.get(userId) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
    });
    const chained = previous.then(() => gate);
    userSheetWriteLock.set(userId, chained);

    try {
        await previous;
        return await fn();
    } finally {
        release();
        if (userSheetWriteLock.get(userId) === chained) {
            userSheetWriteLock.delete(userId);
        }
    }
}

/**
 * Atomically reserve the next available Google Sheet row for a user.
 *
 * Pass `seed` (the actual last data row detected from the real sheet) so the
 * counter realigns to the current Sheet. Call this inside withUserSheetWriteLock
 * when using a fresh Sheet seed.
 */
export async function reserveSheetRow(
    userId: string,
    seed?: number,                 // actual last row from the sheet (used only on first init)
): Promise<number> {
    const effectiveSeed = seed ?? 1;

    const result = await prisma.$queryRaw<[{ sheetWriteRow: number }]>`
        UPDATE "User"
        SET    "sheetWriteRow" = ${effectiveSeed}::int + 1
        WHERE  id = ${userId}
        RETURNING "sheetWriteRow"
    `;

    return result[0]?.sheetWriteRow ?? 0;
}
