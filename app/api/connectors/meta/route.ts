import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientIp } from "@/lib/audit-log";
import { accountStatusLabel, isMetaConfigured } from "@/lib/meta";

export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await prisma.metaConnection.findUnique({
        where: { userId: session.user.id },
        include: {
            adAccounts: { orderBy: [{ businessName: "asc" }, { name: "asc" }] },
        },
    });

    return NextResponse.json({
        data: {
            configured: isMetaConfigured(),
            connected: Boolean(connection),
            connection: connection
                ? {
                      fbUserName: connection.fbUserName,
                      tokenExpiresAt: connection.tokenExpiresAt,
                      lastSyncedAt: connection.lastSyncedAt,
                  }
                : null,
            adAccounts: (connection?.adAccounts ?? []).map((a) => {
                const raw = a.raw as Record<string, unknown> | null;
                const agenciesData = (raw?.agencies as { data?: { id: string; name: string }[] } | undefined)?.data ?? [];
                const fundingSource = (raw?.funding_source_details as { id?: string; display_string?: string; type?: number } | undefined) ?? null;
                const amountSpentRaw = raw?.amount_spent;
                const spendCapRaw = raw?.spend_cap;

                return {
                    id: a.id,
                    accountId: a.accountId,
                    name: a.name,
                    accountStatus: a.accountStatus,
                    accountStatusLabel: accountStatusLabel(a.accountStatus),
                    timezoneName: a.timezoneName,
                    currency: a.currency,
                    businessId: a.businessId,
                    businessName: a.businessName,
                    agencies: agenciesData,
                    enabled: a.enabled,
                    amountSpent: amountSpentRaw != null ? Number(amountSpentRaw) / 100 : null,
                    spendCap: spendCapRaw != null ? Number(spendCapRaw) / 100 : null,
                    fundingSource,
                };
            }),
        },
    });
}

export async function DELETE(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.metaConnection.deleteMany({ where: { userId: session.user.id } });

    await createAuditLog(
        session.user.id,
        "config_connector",
        "Disconnect Meta Ads",
        null,
        getClientIp(request),
    );

    return NextResponse.json({ success: true });
}
