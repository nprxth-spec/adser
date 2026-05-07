// middleware.ts — runs in Edge Runtime, MUST NOT import Prisma
import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "./auth.config";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (isMaintenanceModeEnabled()) {
    if (pathname.startsWith("/api/auth")) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { error: "Service unavailable: maintenance mode is enabled." },
        { status: 503 }
      );
    }

    if (!pathname.startsWith("/maintenance")) {
      return NextResponse.redirect(new URL("/maintenance", req.url));
    }
    return NextResponse.next();
  }

  const isLoggedIn = !!req.auth?.user;
  const isDashboard = pathname.startsWith("/dashboard");

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
