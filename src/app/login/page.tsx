import { redirect } from "next/navigation";
import { currentUserId } from "../../lib/auth";
import AuthForm from "../_components/AuthForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");
  return (
    <main className="relative flex-1">
      <div className="hero-glow" />
      <div className="relative mx-auto flex w-full max-w-sm flex-col px-5 pb-20 pt-24">
        <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
          Interview Prep Kit
        </p>
        <AuthForm />
      </div>
    </main>
  );
}
