import { describe, it, expect, afterEach, vi } from "vitest";
import { signSession, verifySession, hashPassword, verifyPassword } from "../src/lib/auth";

describe("session secret hard-fail (C2 — no forgeable cookies in prod)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws in production when SESSION_SECRET is unset", () => {
    vi.stubEnv("SESSION_SECRET", ""); // empty = unset, as far as the code's truthiness check
    vi.stubEnv("NODE_ENV", "production");
    expect(() => signSession("u1")).toThrow(/SESSION_SECRET/);
  });

  it("still works outside production without a secret (dev convenience)", () => {
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "development");
    expect(() => signSession("u1")).not.toThrow();
  });

  it("signs and verifies a round-trip with a real secret", () => {
    vi.stubEnv("SESSION_SECRET", "a-real-secret-value");
    vi.stubEnv("NODE_ENV", "production");
    const token = signSession("user-123");
    expect(verifySession(token)).toBe("user-123");
    expect(verifySession("user-123.deadbeef")).toBeNull(); // tampered signature
  });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", () => {
    const { hash, salt } = hashPassword("hunter2horse");
    expect(verifyPassword("hunter2horse", hash, salt)).toBe(true);
    expect(verifyPassword("wrong", hash, salt)).toBe(false);
  });
});
