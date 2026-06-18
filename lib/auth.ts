// lib/auth.ts
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/spreadsheets",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  events: {
    async createUser({ user }) {
      if (user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            driveFolderId: "1l9gD9sNTtfJ0Yl9CiWeLyRmhLthPk9-S",
            driveFolderMode: "year-month-day",
          },
        });
      }
    },
  },
  callbacks: {
    async jwt({ token, user, account }) {
      if (account && user) {
        token.userId = user.id;
        const accountData: Record<string, unknown> = {};
        if (account.access_token != null) accountData.access_token = account.access_token;
        if (account.refresh_token != null) accountData.refresh_token = account.refresh_token;
        if (account.expires_at != null) accountData.expires_at = account.expires_at;
        const scope = (account as { scope?: string }).scope;
        if (scope != null) accountData.scope = scope;
        if (Object.keys(accountData).length > 0) {
          await prisma.account.updateMany({
            where: { userId: user.id, provider: "google" },
            data: accountData as any,
          });
        }
        (token as any)._lastDbSync = Date.now();
      }

      // DB query only when token near expiry OR stale > 60s
      const TOKEN_SYNC_MS = 60 * 1000;
      if (token.userId) {
        let currentAccessToken: string | undefined;
        let refreshToken: string | undefined;
        let expiresAt: number | undefined;

        const lastDbSync = (token as any)._lastDbSync as number | undefined;
        const tokenIsExpiring = expiresAt ? Date.now() > expiresAt - 5 * 60 * 1000 : true;
        const syncIsStale = !lastDbSync || Date.now() - lastDbSync > TOKEN_SYNC_MS;
        const needsDbSync = tokenIsExpiring || syncIsStale;

        let dbUser: any = null;
        if (needsDbSync) {
          dbUser = await prisma.user.findUnique({
            where: { id: token.userId as string },
            select: {
              sheetId: true,
              sheetName: true,
              sheetGid: true,
              accounts: {
                where: { provider: "google" },
                select: { access_token: true, refresh_token: true, expires_at: true },
              },
            },
          });
        }

        if (dbUser) {
          token.sheetId = dbUser.sheetId;
          token.sheetName = dbUser.sheetName;
          (token as any).sheetGid = dbUser.sheetGid;
          const dbAccount = dbUser.accounts?.[0];
          if (dbAccount) {
            currentAccessToken = dbAccount.access_token || currentAccessToken;
            refreshToken = dbAccount.refresh_token || refreshToken;
            expiresAt = dbAccount.expires_at ? dbAccount.expires_at * 1000 : expiresAt;
          }
          (token as any)._lastDbSync = Date.now();
        }

        if (currentAccessToken && expiresAt && Date.now() > expiresAt - 5 * 60 * 1000) {
          try {
            if (refreshToken) {
              const response = await fetch("https://oauth2.googleapis.com/token", {
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                method: "POST",
                body: new URLSearchParams({
                  client_id: process.env.GOOGLE_CLIENT_ID!,
                  client_secret: process.env.GOOGLE_CLIENT_SECRET!,
                  grant_type: "refresh_token",
                  refresh_token: refreshToken,
                }),
              });
              const tokens = await response.json();
              if (response.ok) {
                currentAccessToken = tokens.access_token;
                expiresAt = Date.now() + tokens.expires_in * 1000;
                await prisma.account.updateMany({
                  where: { userId: token.userId as string, provider: "google" },
                  data: {
                    access_token: currentAccessToken,
                    expires_at: Math.floor(expiresAt / 1000),
                    ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
                  },
                });
              } else {
                console.error("Google token refresh failed:", tokens);
                currentAccessToken = undefined;
              }
            } else {
              currentAccessToken = undefined;
            }
          } catch (error) {
            console.error("Error refreshing Google access token", error);
            currentAccessToken = undefined;
          }
        }

      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.userId as string;
        (session.user as any).sheetId = token.sheetId;
        (session.user as any).sheetName = token.sheetName;
        (session.user as any).sheetGid = (token as any).sheetGid ?? null;
      }
      return session;
    },
  },
});
