import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
    buildMetaAuthUrl,
    getAppOriginFromRequest,
    getMetaRedirectUri,
    isMetaConfigured,
} from "@/lib/meta";

export async function GET(request: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    const origin = getAppOriginFromRequest(request);

    if (!isMetaConfigured()) {
        return NextResponse.redirect(new URL("/connectors?meta_error=not_configured", origin));
    }

    const state = randomBytes(16).toString("hex");
    const redirectUri = getMetaRedirectUri(origin);
    const authUrl = buildMetaAuthUrl({ redirectUri, state });

    const res = NextResponse.redirect(authUrl);
    // Short-lived CSRF cookie, verified in the callback.
    res.cookies.set("meta_oauth_state", state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 600,
    });
    return res;
}
