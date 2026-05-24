import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { accountStatusLabel, fetchAdAccounts } from "@/lib/meta";

export async function POST() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await prisma.metaConnection.findUnique({
        where: { userId: session.user.id },
    });
    if (!connection) {
        return NextResponse.json({ error: "Meta is not connected." }, { status: 400 });
    }

    let accounts;
    try {
        accounts = await fetchAdAccounts(connection.accessToken);
    } catch (err) {
        console.error("Meta sync failed:", err);
        return NextResponse.json(
            {
                error:
                    "Failed to fetch ad accounts. The Meta connection may have expired — please reconnect.",
                code: "META_REAUTH_REQUIRED",
            },
            { status: 401 },
        );
    }

    const seenAccountIds = new Set<string>();
    for (const acc of accounts) {
        const accountId = acc.account_id ? `act_${acc.account_id}` : acc.id;
        if (!accountId) continue;
        seenAccountIds.add(accountId);

        const data = {
            userId: session.user.id,
            connectionId: connection.id,
            accountId,
            name: acc.name ?? null,
            accountStatus: typeof acc.account_status === "number" ? acc.account_status : null,
            timezoneName: acc.timezone_name ?? null,
            currency: acc.currency ?? null,
            businessId: acc.business?.id ?? null,
            businessName: acc.business?.name ?? null,
            raw: acc as unknown as Prisma.InputJsonValue,
        };

        await prisma.metaAdAccount.upsert({
            where: { userId_accountId: { userId: session.user.id, accountId } },
            create: data,
            update: data,
        });
    }

    // Drop accounts that are no longer accessible by the connected user.
    await prisma.metaAdAccount.deleteMany({
        where: {
            userId: session.user.id,
            accountId: { notIn: Array.from(seenAccountIds) },
        },
    });

    await prisma.metaConnection.update({
        where: { id: connection.id },
        data: { lastSyncedAt: new Date() },
    });

    const stored = await prisma.metaAdAccount.findMany({
        where: { userId: session.user.id },
        orderBy: [{ businessName: "asc" }, { name: "asc" }],
    });

    return NextResponse.json({
        data: {
            count: stored.length,
            adAccounts: stored.map((a) => ({
                id: a.id,
                accountId: a.accountId,
                name: a.name,
                accountStatus: a.accountStatus,
                accountStatusLabel: accountStatusLabel(a.accountStatus),
                timezoneName: a.timezoneName,
                currency: a.currency,
                businessId: a.businessId,
                businessName: a.businessName,
            })),
        },
    });
}
