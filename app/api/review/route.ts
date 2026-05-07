import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** GET /api/review — list all review-queue items for current user */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const items = await prisma.processingLog.findMany({
        where: { userId: session.user.id, status: "review" },
        orderBy: { createdAt: "desc" },
        select: {
            id: true,
            filename: true,
            originalFilename: true,
            invoiceDate: true,
            cardLast4: true,
            amount: true,
            currency: true,
            driveLink: true,
            pendingData: true,
            createdAt: true,
        },
    });

    return NextResponse.json({ data: items });
}
