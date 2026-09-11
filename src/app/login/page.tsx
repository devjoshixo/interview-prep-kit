import { redirect } from "next/navigation";
import { currentUserId } from "../../lib/auth";
import AuthForm from "../_components/AuthForm";
import Droplets from "../_components/Droplets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await currentUserId()) redirect("/");
  return (
    <main className="relative flex-1 overflow-hidden">
      <Droplets />
      <div className="relative mx-auto grid min-h-[calc(100vh-4px)] w-full max-w-5xl grid-cols-1 items-center gap-8 px-6 py-10 md:grid-cols-2 md:px-10">
        {/* left — brand + preview graphic */}
        <div className="flex flex-col justify-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
            Interview Prep Kit
          </p>
          <h2 className="mt-3 font-display text-[2.75rem] font-semibold leading-[1.03] tracking-tight text-ink">
            Walk in ready.
          </h2>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-2">
            Turn a job description into a tailored kit — a categorised question bank,
            flashcards, and a day-by-day plan you can edit and practise.
          </p>

          {/* preview cards */}
          <div className="relative mt-10 h-52 max-w-sm">
            <PreviewCard
              className="left-0 top-6 -rotate-6"
              dot="#4f63c4"
              tag="Technical"
              text="Explain the Node.js event loop and microtask ordering."
              shadow="shadow-card"
            />
            <PreviewCard
              className="left-20 top-0 rotate-3"
              dot="#8267c7"
              tag="System design"
              text="Design a URL shortener that scales to billions of links."
              shadow="shadow-pop"
            />
          </div>

          <ul className="mt-8 space-y-1.5 text-[14px] text-ink-2">
            <li>Active-recall practice with progress tracking</li>
            <li>Regenerate a section without losing your edits</li>
          </ul>
        </div>

        {/* right — auth form */}
        <div className="flex items-center justify-center">
          <div className="w-full max-w-sm">
            <AuthForm />
          </div>
        </div>
      </div>
    </main>
  );
}

function PreviewCard({
  className,
  dot,
  tag,
  text,
  shadow,
}: {
  className: string;
  dot: string;
  tag: string;
  text: string;
  shadow: string;
}) {
  return (
    <div
      className={`absolute w-64 rounded-xl border border-border bg-surface/90 p-4 backdrop-blur ${shadow} ${className}`}
    >
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
        {tag}
      </span>
      <p className="mt-2 text-[14px] font-medium leading-snug text-ink">{text}</p>
    </div>
  );
}
