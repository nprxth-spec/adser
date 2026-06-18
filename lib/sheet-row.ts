import { prisma } from "@/lib/prisma";

const userSheetWriteLock = new Map<string, Promise<void>>();
const SHEET_ROW_DRIFT_RESET_THRESHOLD = 5;

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
 * counter realigns to rows users may have added manually. The UPDATE must
 * advance from the greater of the DB counter or Sheet seed; resetting to
 * seed + 1 is unsafe on serverless production because two instances can read
 * the same Sheet seed at the same time.
 *
 * If the DB counter is far ahead of the real Sheet row, treat it as stale
 * state from an older bug/configuration and realign it. A small lead is kept
 * because it can represent concurrent in-flight uploads that reserved rows
 * before Google Sheets reflects those writes.
 */
export async function reserveSheetRow(
    userId: string,
    seed?: number,
): Promise<number> {
    const effectiveSeed = seed ?? 1;

    return await prisma.$transaction(async (tx) => {
        const users = await tx.$queryRaw<[{ sheetWriteRow: number | null }]>`
            SELECT sheetWriteRow FROM User WHERE id = ${userId} FOR UPDATE
        `;

        const currentVal = users[0]?.sheetWriteRow;
        let newVal: number;

        if (currentVal === null || currentVal === undefined) {
            newVal = effectiveSeed;
        } else if (currentVal > effectiveSeed + SHEET_ROW_DRIFT_RESET_THRESHOLD) {
            newVal = effectiveSeed;
        } else {
            newVal = Math.max(currentVal, effectiveSeed);
        }
        newVal += 1;

        await tx.user.update({
            where: { id: userId },
            data: { sheetWriteRow: newVal },
        });

        return newVal;
    });
}

export async function realignSheetRowCounter(
    userId: string,
    actualLastRow: number,
): Promise<void> {
    const seed = Math.max(0, Math.floor(actualLastRow));

    await prisma.user.updateMany({
        where: {
            id: userId,
            OR: [
                { sheetWriteRow: null },
                { sheetWriteRow: { gt: seed } },
            ],
        },
        data: { sheetWriteRow: seed },
    });
}
