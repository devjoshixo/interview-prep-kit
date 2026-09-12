import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Minimal auth: scrypt password hashing (no dependency) + a signed session cookie
// carrying the user id. Stateless — the signature is verified on each request.

const COOKIE = "ipk_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return computed.length === stored.length && timingSafeEqual(computed, stored);
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  // Fail closed in production: without a real secret, session cookies would be
  // signed with a public default and thus forgeable. Never do that in a deployed
  // environment. The dev/test fallback keeps local work friction-free.
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is not set — refusing to sign sessions with a default secret");
  }
  return "insecure-dev-secret-change-me";
}

export function signSession(userId: string): string {
  const sig = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(userId).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length === b.length && timingSafeEqual(a, b)) return userId;
  } catch {
    /* malformed signature */
  }
  return null;
}

// Read the signed-in user id from the request cookies (null if not signed in).
export async function currentUserId(): Promise<string | null> {
  const c = await cookies();
  return verifySession(c.get(COOKIE)?.value);
}

// Set / clear the session cookie (route handlers only).
export async function setSession(userId: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, signSession(userId), {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function clearSession(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}
