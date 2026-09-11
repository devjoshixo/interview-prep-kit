"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Kit, Question } from "../../core/types";

const CATEGORY_META: Record<Question["category"], { label: string; dot: string }> = {
  technical: { label: "Technical", dot: "#4f63c4" },
  behavioural: { label: "Behavioural", dot: "#2f8f76" },
  "system-design": { label: "System design", dot: "#8267c7" },
  "company-fit": { label: "Company fit", dot: "#b4823b" },
};
const CATEGORIES = Object.keys(CATEGORY_META) as Question["category"][];

const DIFF_META: Record<1 | 2 | 3, { label: string; color: string }> = {
  1: { label: "Easy", color: "#2f8f76" },
  2: { label: "Medium", color: "#b4823b" },
  3: { label: "Hard", color: "#c05663" },
};

const TABS = ["Overview", "Questions", "Flashcards", "Plan"] as const;
type Tab = (typeof TABS)[number];

export default function KitView({ kit, kitId }: { kit: Kit; kitId: string }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [knownQ, setKnownQ] = useState<Set<string>>(new Set());
  const [knownC, setKnownC] = useState<Set<string>>(new Set());

  // Load per-viewer progress (best-effort; missing/blocked storage is fine).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ipk:progress:${kitId}`);
      if (raw) {
        const p = JSON.parse(raw) as { questions?: string[]; cards?: string[] };
        setKnownQ(new Set(p.questions ?? []));
        setKnownC(new Set(p.cards ?? []));
      }
    } catch {
      /* ignore */
    }
  }, [kitId]);

  useEffect(() => {
    try {
      localStorage.setItem(
        `ipk:progress:${kitId}`,
        JSON.stringify({ questions: [...knownQ], cards: [...knownC] })
      );
    } catch {
      /* ignore */
    }
  }, [kitId, knownQ, knownC]);

  const idx = TABS.indexOf(tab);
  const go = (delta: number) => {
    const i = idx + delta;
    if (i >= 0 && i < TABS.length) setTab(TABS[i]);
  };

  // Left / right arrows switch tabs (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  const counts: Record<Tab, number | undefined> = {
    Overview: undefined,
    Questions: kit.questions.length,
    Flashcards: kit.flashcards.length,
    Plan: kit.schedule.days.length,
  };

  return (
    <div>
      {/* hero */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">
        Prep kit
      </p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[3rem]">
            {kit.source.role || "Interview Prep Kit"}
          </h1>
          <p className="mt-3 text-[15px] text-ink-2">
            {[
              kit.source.company || hostLabel(kit.source.company_url),
              `${kit.schedule.days_available}-day plan`,
            ]
              .filter(Boolean)
              .join("  ·  ")}
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink-2 transition hover:border-border-strong hover:text-ink"
        >
          New kit
        </Link>
      </div>

      {/* sticky tabs */}
      <div className="sticky top-0 z-10 -mx-5 mt-8 border-b border-border bg-bg/85 px-5 backdrop-blur">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative whitespace-nowrap py-3.5 text-[14px] font-medium transition ${
                tab === t ? "text-ink" : "text-ink-3 hover:text-ink-2"
              }`}
            >
              {t}
              {counts[t] !== undefined && (
                <span className="ml-1.5 text-[12px] text-ink-3">{counts[t]}</span>
              )}
              {tab === t && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {tab === "Overview" && <Overview kit={kit} />}
        {tab === "Questions" && (
          <QuestionsTab questions={kit.questions} known={knownQ} setKnown={setKnownQ} />
        )}
        {tab === "Flashcards" && (
          <FlashcardsTab kit={kit} known={knownC} setKnown={setKnownC} />
        )}
        {tab === "Plan" && <PlanTab kit={kit} />}
      </div>

      {/* prev / next */}
      <div className="mt-14 flex items-center justify-between border-t border-border pt-6">
        <button
          onClick={() => go(-1)}
          disabled={idx === 0}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink-2 transition hover:border-border-strong hover:text-ink disabled:invisible"
        >
          ← {TABS[idx - 1] ?? ""}
        </button>
        <span className="hidden text-[11px] text-ink-3 sm:block">Use ← → to switch</span>
        <button
          onClick={() => go(1)}
          disabled={idx === TABS.length - 1}
          className="rounded-full border border-border bg-surface px-4 py-2 text-[13px] font-medium text-ink-2 transition hover:border-border-strong hover:text-ink disabled:invisible"
        >
          {TABS[idx + 1] ?? ""} →
        </button>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */

function Overview({ kit }: { kit: Kit }) {
  return (
    <div className="space-y-12">
      <Section title="Company brief">
        {kit.company_brief.summary || kit.company_brief.what_they_do ? (
          <div className="space-y-3 text-[15px] leading-relaxed text-ink-2">
            {kit.company_brief.summary && <p>{kit.company_brief.summary}</p>}
            {kit.company_brief.what_they_do && <p>{kit.company_brief.what_they_do}</p>}
          </div>
        ) : (
          <Empty>No brief — the site had nothing to summarize.</Empty>
        )}
        {kit.company_brief.sources.length > 0 && (
          <p className="mt-4 break-words text-xs text-ink-3">
            {kit.company_brief.sources.join("   ·   ")}
          </p>
        )}
      </Section>

      <Section title="Requirements" count={kit.role.requirements.length}>
        <ul className="-my-1">
          {kit.role.requirements.map((r) => (
            <li key={r.id} className="flex items-baseline gap-3 border-b border-border py-3 last:border-0">
              <span
                className={`mt-px shrink-0 text-[11px] font-semibold uppercase tracking-wide ${
                  r.priority === "must" ? "text-ink" : "text-ink-3"
                }`}
              >
                {r.priority}
              </span>
              <span className="flex-1 text-[15px] leading-snug text-ink">{r.text}</span>
              <span className="shrink-0 text-xs text-ink-3">{r.kind}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

/* ---------- Questions ---------- */

function QuestionsTab({
  questions,
  known,
  setKnown,
}: {
  questions: Question[];
  known: Set<string>;
  setKnown: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpen((s) => toggleSet(s, id));
  const toggleKnown = (id: string) => setKnown((s) => toggleSet(s, id));

  return (
    <div>
      <Progress done={countIn(known, questions.map((q) => q.id))} total={questions.length} noun="mastered" />
      <div className="mt-8 space-y-8">
        {CATEGORIES.map((cat) => {
          const qs = questions.filter((q) => q.category === cat);
          if (qs.length === 0) return null;
          const meta = CATEGORY_META[cat];
          return (
            <div key={cat}>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">
                  {meta.label}
                </span>
                <span className="text-[11px] text-ink-3">{qs.length}</span>
              </div>
              <ul className="space-y-3">
                {qs.map((q) => {
                  const shown = open.has(q.id);
                  const done = known.has(q.id);
                  const diff = DIFF_META[q.difficulty];
                  return (
                    <li
                      key={q.id}
                      className={`rounded-xl border bg-surface p-4 transition ${
                        done ? "border-border opacity-70" : "border-border"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-[15px] font-medium leading-snug text-ink">{q.prompt}</p>
                        <span className="mt-0.5 shrink-0 text-[11px] font-medium" style={{ color: diff.color }}>
                          {diff.label}
                        </span>
                      </div>
                      {shown && (
                        <p className="reveal mt-3 border-t border-border pt-3 text-[14px] leading-relaxed text-ink-2">
                          {q.answer_outline}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-4">
                        <button
                          onClick={() => toggleOpen(q.id)}
                          className="text-[13px] font-medium text-accent transition hover:text-accent-hover"
                        >
                          {shown ? "Hide answer" : "Show answer"}
                        </button>
                        <button
                          onClick={() => toggleKnown(q.id)}
                          className={`flex items-center gap-1.5 text-[13px] font-medium transition ${
                            done ? "text-[#2f8f76]" : "text-ink-3 hover:text-ink-2"
                          }`}
                        >
                          <Check on={done} />
                          {done ? "Got it" : "Mark known"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- Flashcards ---------- */

function FlashcardsTab({
  kit,
  known,
  setKnown,
}: {
  kit: Kit;
  known: Set<string>;
  setKnown: (fn: (s: Set<string>) => Set<string>) => void;
}) {
  if (kit.flashcards.length === 0) return <Empty>No flashcards for this kit.</Empty>;
  return (
    <div>
      <Progress done={countIn(known, kit.flashcards.map((f) => f.id))} total={kit.flashcards.length} noun="known" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {kit.flashcards.map((f) => (
          <FlashcardCard
            key={f.id}
            front={f.front}
            back={f.back}
            known={known.has(f.id)}
            onToggleKnown={() => setKnown((s) => toggleSet(s, f.id))}
          />
        ))}
      </div>
    </div>
  );
}

function FlashcardCard({
  front,
  back,
  known,
  onToggleKnown,
}: {
  front: string;
  back: string;
  known: boolean;
  onToggleKnown: () => void;
}) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className="flip h-44 select-none">
      <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
        <Face onFlip={() => setFlipped(true)} known={known} onToggleKnown={onToggleKnown} label="Question" labelColor="text-ink-3" tint="border-border bg-surface">
          <p className="text-[15px] font-medium leading-snug text-ink">{front}</p>
        </Face>
        <Face faceClass="flip-back" onFlip={() => setFlipped(false)} known={known} onToggleKnown={onToggleKnown} label="Answer" labelColor="text-accent" tint="border-accent-soft bg-accent-soft/40">
          <p className="text-[14px] leading-relaxed text-ink-2">{back}</p>
        </Face>
      </div>
    </div>
  );
}

function Face({
  children,
  onFlip,
  known,
  onToggleKnown,
  label,
  labelColor,
  tint,
  faceClass = "",
}: {
  children: ReactNode;
  onFlip: () => void;
  known: boolean;
  onToggleKnown: () => void;
  label: string;
  labelColor: string;
  tint: string;
  faceClass?: string;
}) {
  return (
    <div
      onClick={onFlip}
      className={`flip-face ${faceClass} flex cursor-pointer flex-col justify-between rounded-xl border p-5 shadow-card ${tint}`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${labelColor}`}>
          {label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleKnown();
          }}
          className={`transition ${known ? "text-[#2f8f76]" : "text-ink-3 hover:text-ink-2"}`}
          title={known ? "Known" : "Mark known"}
        >
          <Check on={known} />
        </button>
      </div>
      {children}
      <span className="text-[11px] text-ink-3">Tap to flip</span>
    </div>
  );
}

/* ---------- Plan ---------- */

function PlanTab({ kit }: { kit: Kit }) {
  if (kit.schedule.days.length === 0) return <Empty>No plan — add questions first.</Empty>;
  return (
    <ol className="overflow-hidden rounded-xl border border-border">
      {kit.schedule.days.map((d) => {
        const meta = CATEGORY_META[d.focus as Question["category"]];
        return (
          <li
            key={d.day}
            className="flex items-center gap-4 bg-surface px-4 py-4 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border"
          >
            <span className="w-14 shrink-0 text-[13px] font-medium text-ink-3">Day {d.day}</span>
            <span className="flex flex-1 items-center gap-2 text-[15px] text-ink">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta?.dot ?? "var(--ink-3)" }} />
              {meta?.label ?? d.focus}
            </span>
            <span className="shrink-0 text-[13px] text-ink-3">
              {d.question_ids.length} · {d.minutes}m
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ---------- Primitives ---------- */

function Progress({ done, total, noun }: { done: number; total: number; noun: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-[13px]">
        <span className="text-ink-2">
          <span className="font-display font-semibold text-ink">{done}</span> of {total} {noun}
        </span>
        <span className="text-ink-3">{pct}%</span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-border">
        <div className="h-1 rounded-full bg-accent transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="shrink-0">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.5" fill={on ? "currentColor" : "none"} />
      <path d="M6.5 10.2l2.2 2.2 4.6-4.6" stroke={on ? "#fff" : "currentColor"} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section>
      <div className="mb-5 flex items-baseline gap-3">
        <h2 className="font-display text-[1.35rem] font-semibold tracking-tight text-ink">{title}</h2>
        {count !== undefined && <span className="text-[13px] text-ink-3">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-[15px] text-ink-3">{children}</p>;
}

function toggleSet(s: Set<string>, id: string): Set<string> {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}

function countIn(set: Set<string>, ids: string[]): number {
  return ids.reduce((n, id) => (set.has(id) ? n + 1 : n), 0);
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
