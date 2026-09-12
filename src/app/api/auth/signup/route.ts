import { NextResponse } from "next/server";
import { connectDB } from "../../../../lib/db";
import { UserModel } from "../../../../models/user";
import { hashPassword, setSession } from "../../../../lib/auth";
import { rateLimit, clientIp } from "../../../../lib/rateLimit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    // Throttle account-creation spam per client IP.
    const rl = rateLimit(`signup:${clientIp(req)}`, 5, 15 * 60_000);
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return NextResponse.json({ error: "enter a valid email" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "password must be at least 8 characters" }, { status: 400 });
    }

    await connectDB();
    if (await UserModel.findOne({ email: e })) {
      return NextResponse.json({ error: "an account with this email already exists" }, { status: 409 });
    }
    const { hash, salt } = hashPassword(password);
    const user = await UserModel.create({ email: e, passwordHash: hash, salt });
    await setSession(String(user._id));
    return NextResponse.json({ ok: true, email: e });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
