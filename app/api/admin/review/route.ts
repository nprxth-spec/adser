import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { prisma } from "@/lib/prisma";

/** GET /api/admin/review — list all review-queue items across all users */
export async function GET(request: Request) {
    if (!(await isAdminAuthenticated())) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") || undefined;

    const items = await prisma.processingLog.findMany({
        where: {
            status: "review",
            ...(userId ? { userId } : {}),
        },
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
            userId: true,
            user: { select: { email: true, name: true } },
        },
    });

    return NextResponse.json({ data: items });
}
