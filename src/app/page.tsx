"use client";

import { useState } from "react";
import type { Kit, Question } from "../core/types";

const CATEGORIES: Question["category"][] = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
];

const STEP_NAMES = [
  "Reading the JD",
  "Visiting the site",
  "Searching the web",
  "Writing questions",
  "Checking coverage",
  "Filling gaps",
  "Building the schedule",
];

export default function Home() {
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setKit(null);
    try {
      const res = await fetch("/api/kits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd, company_url: companyUrl, days }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "generation failed");
      setKit(data.kit as Kit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex-1">
      <div className="hero-glow" />
      <div className="relative mx-auto w-full max-w-[760px] px-5 py-12 sm:py-16">
        {!kit ? (
          <Builder
            jd={jd}
            setJd={setJd}
            companyUrl={companyUrl}
            setCompanyUrl={setCompanyUrl}
            days={days}
            setDays={setDays}
            loading={loading}
            error={error}
            onGenerate={generate}
          />
        ) : (
          <KitView kit={kit} onReset={() => setKit(null)} />
        )}
      </div>
    </main>
  );
}

/* ---------- Builder ---------- */

function Builder(props: {
  jd: string;
  setJd: (v: string) => void;
  companyUrl: string;
  setCompanyUrl: (v: string) => void;
  days: number;
  setDays: (v: number) => void;
  loading: boolean;
  error: string | null;
  onGenerate: () => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
        Prep Kit
      </p>
      <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Interview Prep Kit
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-2">
        Paste a job description, add the company site and your timeline. We read
        the role, research the company, and build a tailored question bank,
        flashcards and a day-by-day plan.
      </p>

      {props.loading ? (
        <GeneratingCard />
      ) : (
        <div className="mt-8 rounded-card border border-border bg-surface p-5 shadow-card">
          <label className="text-xs font-medium text-ink-2">Job description</label>
          <textarea
            className="mt-2 h-44 w-full resize-y rounded-[10px] border border-border bg-surface p-3.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
            placeholder="Paste the full job description here…"
            value={props.jd}
            onChange={(e) => props.setJd(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="min-w-56 flex-1">
              <label className="text-xs font-medium text-ink-2">Company URL</label>
              <input
                className="mt-2 w-full rounded-[10px] border border-border bg-surface p-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
                placeholder="https://company.com"
                value={props.companyUrl}
                onChange={(e) => props.setCompanyUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-2">Days</label>
              <input
                type="number"
                min={1}
                max={60}
                className="tabular mt-2 w-24 rounded-[10px] border border-border bg-surface p-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                value={props.days}
                onChange={(e) => props.setDays(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={props.onGenerate}
              disabled={!props.jd.trim()}
              className="btn-gradient rounded-full px-5 py-2.5 text-sm font-medium text-white"
            >
              Generate kit
            </button>
            <span className="text-xs text-ink-3">Takes ~60–90 seconds</span>
          </div>

          {props.error && (
            <p className="mt-3 text-sm text-red-600">Error: {props.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function GeneratingCard() {
  return (
    <div className="mt-8 rounded-card border border-border bg-bg-sunken p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="font-display text-base font-semibold text-ink">
          Generating your kit
        </p>
      </div>
      <p className="mt-1 text-xs text-ink-3">
        Running the 7-step pipeline · ~60–90 seconds
      </p>
      <ol className="mt-4 space-y-2">
        {STEP_NAMES.map((name) => (
          <li key={name} className="flex items-center gap-2.5 text-sm text-ink-2">
            <span className="h-1.5 w-1.5 rounded-full bg-border-strong" />
            {name}
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ---------- Kit view ---------- */

function KitView({ kit, onReset }: { kit: Kit; onReset: () => void }) {
  const covered =
    kit.coverage.uncovered_requirement_ids.length === 0
      ? "full coverage"
      : `${kit.coverage.uncovered_requirement_ids.length} uncovered`;

  return (
    <div>
      {/* hero */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-accent">
        Prep Kit
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {kit.source.role || "Interview Prep Kit"}
          </h1>
          <p className="mt-2 text-[15px] text-ink-2">
            {[
              kit.source.company || hostLabel(kit.source.company_url),
              `${kit.schedule.days_available}-day prep kit`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <button
          onClick={onReset}
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-border-strong"
        >
          New kit
        </button>
      </div>

      {/* meta strip */}
      <div className="tabular mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-ink-3">
        <span>{plural(kit.questions.length, "question")}</span>
        <span className="text-accent">{covered}</span>
        <span>{kit.coverage.passes} pass{kit.coverage.passes === 1 ? "" : "es"}</span>
        <span>{kit.role.requirements.length} requirements</span>
      </div>

      <div className="mt-10 space-y-12">
        {/* Company brief */}
        <Section title="Company brief">
          {kit.company_brief.summary || kit.company_brief.what_they_do ? (
            <div className="space-y-2 text-sm leading-relaxed text-ink-2">
              {kit.company_brief.summary && <p>{kit.company_brief.summary}</p>}
              {kit.company_brief.what_they_do && (
                <p>{kit.company_brief.what_they_do}</p>
              )}
            </div>
          ) : (
            <Empty>No company brief — the site gave us nothing to summarize.</Empty>
          )}
          {kit.company_brief.sources.length > 0 && (
            <p className="mt-3 text-xs text-ink-3">
              Sources: {kit.company_brief.sources.join(" · ")}
            </p>
          )}
        </Section>

        {/* Requirements */}
        <Section title="Requirements">
          <ul className="divide-y divide-border">
            {kit.role.requirements.map((r) => (
              <li key={r.id} className="flex items-start gap-3 py-3">
                <Badge tone={r.priority === "must" ? "solid" : "soft"}>
                  {r.priority}
                </Badge>
                <span className="flex-1 text-sm text-ink">{r.text}</span>
                <span className="text-xs text-ink-3">({r.kind})</span>
              </li>
            ))}
          </ul>
        </Section>

        {/* Questions */}
        <Section title="Questions" note={`${covered} · ${kit.coverage.passes} pass`}>
          <div className="space-y-5">
            {CATEGORIES.map((cat) => {
              const qs = kit.questions.filter((q) => q.category === cat);
              if (qs.length === 0) return null;
              return (
                <div key={cat}>
                  <span className="inline-block rounded-[8px] bg-accent-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-accent">
                    {cat}
                  </span>
                  <ul className="mt-3 space-y-2.5">
                    {qs.map((q) => (
                      <li
                        key={q.id}
                        className="rounded-[12px] border border-border bg-bg-sunken p-4"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="tabular mt-0.5 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                            d{q.difficulty}
                          </span>
                          <span className="flex-1 text-[15px] font-medium leading-snug text-ink">
                            {q.prompt}
                          </span>
                        </div>
                        <p className="mt-2 pl-9 text-sm leading-relaxed text-ink-2">
                          {q.answer_outline}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Flashcards */}
        <Section title="Flashcards" note={`${kit.flashcards.length} cards`}>
          {kit.flashcards.length === 0 ? (
            <Empty>No flashcards yet — this pipeline step is coming next.</Empty>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {kit.flashcards.map((f) => (
                <div
                  key={f.id}
                  className="overflow-hidden rounded-[12px] border border-border bg-surface shadow-card"
                >
                  <div className="accent-gradient h-0.5 w-full" />
                  <div className="p-4">
                    <p className="text-sm font-medium text-ink">{f.front}</p>
                    <p className="mt-2 text-sm text-ink-2">{f.back}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Schedule */}
        <Section title="Schedule" note={`${kit.schedule.days_available} days`}>
          {kit.schedule.days.length === 0 ? (
            <Empty>No schedule — add questions first.</Empty>
          ) : (
            <div className="space-y-2">
              {kit.schedule.days.map((d) => (
                <div
                  key={d.day}
                  className="flex items-center justify-between rounded-[12px] border border-border bg-surface px-4 py-3"
                >
                  <span className="text-sm font-medium text-ink">
                    Day {d.day} · <span className="text-ink-2">{d.focus}</span>
                  </span>
                  <span className="tabular text-xs text-ink-3">
                    {plural(d.question_ids.length, "question")} · {d.minutes} min
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

/* ---------- Primitives ---------- */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="h-4 w-0.5 rounded-full bg-accent" />
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          {note && <span className="text-xs text-ink-3">{note}</span>}
          <button
            title="Regenerate (coming soon)"
            className="text-xs font-medium text-ink-3 transition hover:text-ink"
          >
            Regenerate
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "solid" | "soft";
}) {
  const cls =
    tone === "solid"
      ? "bg-ink text-white"
      : "bg-bg-sunken text-ink-2 ring-1 ring-border";
  return (
    <span
      className={`shrink-0 rounded-[6px] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-ink-3">{children}</p>;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
