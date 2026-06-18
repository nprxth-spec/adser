import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE_NAME = "adser_admin";
const MAX_AGE_SEC = 60 * 60 * 24; // 24 hours

function getSecret(): string {
  const secret = process.env.ADMIN_TOKEN_SECRET ?? process.env.ADMIN_PASSWORD;
  if (!secret) throw new Error("ADMIN_TOKEN_SECRET or ADMIN_PASSWORD is not set");
  return `admin-token:${secret}`;
}

function hmacSha256(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(a.length);
    timingSafeEqual(a, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createAdminToken(): string {
  const exp = Date.now() + MAX_AGE_SEC * 1000;
  const payload = JSON.stringify({ exp });
  const sig = hmacSha256(getSecret(), payload).toString("base64url");
  return Buffer.from(payload).toString("base64url") + "." + sig;
}

export function verifyAdminToken(token: string): boolean {
  try {
    const dotIdx = token.indexOf(".");
    if (dotIdx < 0) return false;
    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!payloadB64 || !sig) return false;
    const payloadStr = Buffer.from(payloadB64, "base64url").toString();
    const payload = JSON.parse(payloadStr);
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return false;
    const expectedSigBuf = hmacSha256(getSecret(), payloadStr);
    let sigBuf: Buffer;
    try {
      sigBuf = Buffer.from(sig, "base64url");
    } catch {
      return false;
    }
    return safeEqual(sigBuf, expectedSigBuf);
  } catch {
    return false;
  }
}

export async function getAdminCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(ADMIN_COOKIE_NAME)?.value ?? null;
}

export async function setAdminCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: MAX_AGE_SEC,
    path: "/",
  });
}

export async function clearAdminCookie(): Promise<void> {
  const c = await cookies();
  c.delete(ADMIN_COOKIE_NAME);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const token = await getAdminCookie();
  return !!token && verifyAdminToken(token);
}

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  try {
    const a = Buffer.from(password, "utf8");
    const b = Buffer.from(expected, "utf8");
    return safeEqual(a, b);
  } catch {
    return false;
  }
}
