import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db";
import { UserModel } from "../../../../models/user";
import { verifyPassword, setSession } from "../../../../lib/auth";
import { rateLimit, clientIp } from "../../../../lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Throttle password-guessing per client IP.
    const rl = rateLimit(`login:${clientIp(req)}`, 10, 5 * 60_000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Too many attempts. Please wait a bit and try again." },
        { status: 429, headers: { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) } }
      );
    }

    const { email, password } = (await req.json()) as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "email and password are required" }, { status: 400 });
    }
    const e = email.trim().toLowerCase();

    await connectDB();
    const user = await UserModel.findOne({ email: e });
    if (!user || !verifyPassword(password, user.passwordHash, user.salt)) {
      return NextResponse.json({ error: "invalid email or password" }, { status: 401 });
    }
    await setSession(String(user._id));
    return NextResponse.json({ ok: true, email: e });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
