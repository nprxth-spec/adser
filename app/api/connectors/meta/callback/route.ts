import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAuditLog, getClientIp } from "@/lib/audit-log";
import {
    exchangeCodeForToken,
    getAppOriginFromRequest,
    getLongLivedToken,
    getMeProfile,
    getMetaRedirectUri,
    META_SCOPES,
} from "@/lib/meta";

export async function GET(request: Request) {
    const origin = getAppOriginFromRequest(request);
    const back = (params: string) => NextResponse.redirect(new URL(`/connectors${params}`, origin));

    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.redirect(new URL("/login", origin));
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    if (error) {
        return back("?meta_error=denied");
    }

    const cookieState = request.headers
        .get("cookie")
        ?.split(";")
        .map((c) => c.trim())
        .find((c) => c.startsWith("meta_oauth_state="))
        ?.split("=")[1];

    if (!code || !state || !cookieState || state !== cookieState) {
        return back("?meta_error=invalid_state");
    }

    try {
        const redirectUri = getMetaRedirectUri(origin);
        const short = await exchangeCodeForToken(code, redirectUri);
        const long = await getLongLivedToken(short.accessToken).catch(() => short);
        const profile = await getMeProfile(long.accessToken);

        const tokenExpiresAt = long.expiresIn
            ? new Date(Date.now() + long.expiresIn * 1000)
            : null;

        await prisma.metaConnection.upsert({
            where: { userId: session.user.id },
            create: {
                userId: session.user.id,
                fbUserId: profile.id,
                fbUserName: profile.name ?? null,
                accessToken: long.accessToken,
                tokenExpiresAt,
                scopes: META_SCOPES.join(","),
            },
            update: {
                fbUserId: profile.id,
                fbUserName: profile.name ?? null,
                accessToken: long.accessToken,
                tokenExpiresAt,
                scopes: META_SCOPES.join(","),
            },
        });

        await createAuditLog(
            session.user.id,
            "config_connector",
            "Connect Meta Ads",
            { fbUserId: profile.id },
            getClientIp(request),
        );

        const res = back("?meta=connected");
        res.cookies.delete("meta_oauth_state");
        return res;
    } catch (err) {
        console.error("Meta OAuth callback failed:", err);
        return back("?meta_error=exchange_failed");
    }
}
