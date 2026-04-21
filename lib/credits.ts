import { prisma } from "@/lib/prisma";

const FREE_PLAN_CREDITS = 9999;

/**
 * If user is on free plan and we're in a new calendar month since lastCreditsReset,
 * reset credits to FREE_PLAN_CREDITS and update lastCreditsReset.
 * Returns the user's current credits (after possible reset).
 */
export async function ensureFreeCreditsReset(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, credits: true, lastCreditsReset: true },
  });

  if (!user || user.plan !== "free") {
    return user?.credits ?? 0;
  }

  const now = new Date();
  const lastReset = user.lastCreditsReset;

  const needReset =
    !lastReset ||
    lastReset.getUTCFullYear() < now.getUTCFullYear() ||
    (lastReset.getUTCFullYear() === now.getUTCFullYear() &&
      lastReset.getUTCMonth() < now.getUTCMonth());

  if (!needReset) {
    return user.credits;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      credits: FREE_PLAN_CREDITS,
      lastCreditsReset: now,
    },
  });

  return FREE_PLAN_CREDITS;
}

export { FREE_PLAN_CREDITS };
