import { prisma } from "@/lib/prisma";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * In-process dedup: if multiple concurrent requests need to refresh the same
 * user's token, they all await the same promise instead of each firing a separate
 * OAuth call (which can trigger token rotation issues on some providers).
 */
const _refreshing = new Map<string, Promise<string | null>>();

/**
 * Returns a valid Google OAuth access token for the user.
 * If the token in DB is expired (or expires within 5 min), refreshes it and saves to DB.
 * Concurrent calls for the same userId share a single refresh round-trip.
 */
export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: {
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  });

  if (!account?.access_token) return null;

  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;
  const now = Date.now();
  const needsRefresh = !expiresAt || now >= expiresAt - FIVE_MINUTES_MS;

  if (!needsRefresh) {
    return account.access_token;
  }

  const refreshToken = account.refresh_token;
  if (!refreshToken) {
    return null;
  }

  // Dedup: return the in-flight refresh promise if one already exists for this user
  const existing = _refreshing.get(userId);
  if (existing) return existing;

  const p = (async (): Promise<string | null> => {
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID!,
          client_secret: process.env.GOOGLE_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      const tokens = await response.json();
      if (!response.ok) {
        console.error("Google token refresh failed:", tokens);
        return null;
      }

      const newAccessToken = tokens.access_token;
      const newExpiresAt = Math.floor((Date.now() + (tokens.expires_in ?? 3600) * 1000) / 1000);

      await prisma.account.updateMany({
        where: { userId, provider: "google" },
        data: {
          access_token: newAccessToken,
          expires_at: newExpiresAt,
          ...(tokens.refresh_token && { refresh_token: tokens.refresh_token }),
        },
      });

      return newAccessToken;
    } catch (err) {
      console.error("Error refreshing Google access token:", err);
      return null;
    }
  })();

  _refreshing.set(userId, p);
  p.finally(() => _refreshing.delete(userId));
  return p;
}
