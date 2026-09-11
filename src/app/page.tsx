import { redirect } from "next/navigation";
import { currentUserId } from "../lib/auth";
import { connectDB } from "../lib/db";
import { KitModel } from "../models/kit";
import { UserModel } from "../models/user";
import Builder from "./_components/Builder";
import KitList, { type KitSummary } from "./_components/KitList";
import LogoutButton from "./_components/LogoutButton";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type KitLean = {
  _id: unknown;
  createdAt: Date;
  kit?: { source?: { role?: string; company?: string }; questions?: unknown[] };
};

export default async function Home() {
  const uid = await currentUserId();
  if (!uid) redirect("/login");

  await connectDB();
  const user = (await UserModel.findById(uid).lean()) as { email?: string } | null;
  const docs = (await KitModel.find({ userId: uid })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean()) as unknown as KitLean[];

  const kits: KitSummary[] = docs.map((d) => ({
    id: String(d._id),
    role: d.kit?.source?.role || "Interview Prep Kit",
    company: d.kit?.source?.company || "",
    questions: d.kit?.questions?.length ?? 0,
    createdAt: new Date(d.createdAt).toISOString(),
  }));

  return (
    <main className="relative flex-1">
      <div className="hero-glow" />
      <div className="relative mx-auto w-full max-w-[760px] px-5 pb-24 pt-10">
        <header className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            Interview Prep Kit
          </span>
          <div className="flex items-center gap-3 text-[13px] text-ink-3">
            {user?.email && <span className="hidden sm:inline">{user.email}</span>}
            <LogoutButton />
          </div>
        </header>

        <Builder />

        {kits.length > 0 && (
          <section className="mt-16">
            <h2 className="font-display text-[1.35rem] font-semibold tracking-tight text-ink">
              Your kits
            </h2>
            <KitList kits={kits} />
          </section>
        )}
      </div>
    </main>
  );
}
