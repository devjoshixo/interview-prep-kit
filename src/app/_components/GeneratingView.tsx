"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const STEPS = [
  "Reading the JD",
  "Visiting the site",
  "Searching the web",
  "Writing questions",
  "Filling coverage gaps",
  "Making flashcards",
  "Building the study plan",
];

export default function GeneratingView({
  kitId,
  initialStep,
  failed,
  error,
}: {
  kitId: string;
  initialStep: number;
  failed: boolean;
  error?: string | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialStep);
  const [isFailed, setIsFailed] = useState(failed);
  const [failMsg, setFailMsg] = useState(error ?? "");
  const [retrying, setRetrying] = useState(false);
  // One silent auto-retry per run; `healing` suppresses stale "failed" polls
  // while a retry request is flipping the job back to "generating".
  const autoRetried = useRef(false);
  const healing = useRef(false);

  // Re-run the existing job. Resolves true once the server has flipped it back to
  // "generating" (the endpoint awaits that write before responding).
  async function requestRetry(): Promise<boolean> {
    try {
      const res = await fetch(`/api/kits/${kitId}/retry`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      return res.ok && d.ok === true;
    } catch {
      return false;
    }
  }

  useEffect(() => {
    if (isFailed) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/kits/${kitId}`);
        if (!res.ok) return;
        const d = await res.json();
        if (!alive) return;
        if (typeof d.progress?.step === "number") setStep(d.progress.step);

        if (d.status === "ready") {
          healing.current = false;
          router.refresh(); // server page re-renders with the finished kit
        } else if (d.status === "failed") {
          if (healing.current) return; // a retry is in flight; ignore stale state
          if (!autoRetried.current) {
            // Self-heal: a transient blip re-runs invisibly. Only surface the
            // failure screen if the automatic retry also can't restart the job.
            autoRetried.current = true;
            healing.current = true;
            setStep(0);
            const ok = await requestRetry();
            if (!ok) {
              healing.current = false;
              if (alive) {
                setIsFailed(true);
                setFailMsg(d.error || "Generation failed.");
              }
            }
          } else {
            setIsFailed(true);
            setFailMsg(d.error || "Generation failed.");
          }
        } else {
          healing.current = false; // generating
        }
      } catch {
        /* transient — keep polling */
      }
    };
    const iv = setInterval(tick, 1800);
    tick();
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [kitId, isFailed, router]);

  async function onManualRetry() {
    setRetrying(true);
    const ok = await requestRetry();
    if (ok) {
      autoRetried.current = false; // give the fresh run its own auto-heal
      healing.current = false;
      setFailMsg("");
      setStep(0);
      setIsFailed(false); // re-arms the polling effect
    }
    setRetrying(false);
  }

  if (isFailed) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
          Generation failed
        </h1>
        <p className="mt-2 text-[14px] text-ink-2">{failMsg}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={onManualRetry}
            disabled={retrying}
            className="rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Retry"}
          </button>
          <Link
            href="/"
            className="rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-ink transition hover:border-border-strong"
          >
            Start over
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="py-16">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Generating</p>
      <h1 className="mt-2 font-display text-[2rem] font-semibold tracking-tight text-ink">
        Building your prep kit
      </h1>
      <p className="mt-2 text-[14px] text-ink-2">
        Researching the role and company and writing your questions — about a minute.
      </p>

      <ol className="mt-8 space-y-3">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = step > n || step >= STEPS.length + 1;
          const active = step === n;
          return (
            <li key={label} className="flex items-center gap-3">
              <span
                className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${
                  done
                    ? "bg-accent text-white"
                    : active
                      ? "border-2 border-accent"
                      : "border border-border text-ink-3"
                }`}
              >
                {done ? "✓" : active ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                ) : (
                  n
                )}
              </span>
              <span className={`text-[15px] ${active ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3"}`}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
