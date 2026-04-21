import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // Start of this week (Monday)
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const day = weekStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + mondayOffset);

  const [totalProcessed, thisWeek, totalFailed, amountAgg, user] = await Promise.all([
    prisma.processingLog.count({
      where: { userId, status: "success" },
    }),
    prisma.processingLog.count({
      where: { userId, status: "success", createdAt: { gte: weekStart } },
    }),
    prisma.processingLog.count({
      where: { userId, status: { not: "success" } },
    }),
    prisma.processingLog.aggregate({
      where: { userId, status: "success" },
      _sum: { amount: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true, plan: true },
    }),
  ]);

  return NextResponse.json({
    data: {
      totalProcessed,
      thisWeek,
      totalFailed,
      totalAmount: amountAgg._sum.amount ?? 0,
      credits: user?.credits ?? 0,
      plan: user?.plan ?? "free",
    },
  });
}
