import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { enabled } = body as { enabled: boolean };

    if (typeof enabled !== "boolean") {
        return NextResponse.json({ error: "enabled must be boolean" }, { status: 400 });
    }

    const account = await prisma.metaAdAccount.findFirst({
        where: { id, userId: session.user.id },
    });
    if (!account) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.metaAdAccount.update({
        where: { id },
        data: { enabled },
    });

    return NextResponse.json({ data: { id: updated.id, enabled: updated.enabled } });
}
