import Link from "next/link";
import type { ReactNode } from "react";
import type { Kit, Question } from "../../core/types";

const CATEGORIES: Question["category"][] = [
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
];

// Presentational — renders a Kit. Used by the builder result and the /kit/[id]
// page (server-rendered), so it takes only props, no hooks.
export default function KitView({ kit }: { kit: Kit }) {
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
        <Link
          href="/"
          className="rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-border-strong"
        >
          New kit
        </Link>
      </div>

      {/* meta strip */}
      <div className="tabular mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-medium text-ink-3">
        <span>{plural(kit.questions.length, "question")}</span>
        <span className="text-accent">{covered}</span>
        <span>
          {kit.coverage.passes} pass{kit.coverage.passes === 1 ? "" : "es"}
        </span>
        <span>{plural(kit.role.requirements.length, "requirement")}</span>
      </div>

      <div className="mt-10 space-y-12">
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
            <p className="mt-3 break-words text-xs text-ink-3">
              Sources: {kit.company_brief.sources.join(" · ")}
            </p>
          )}
        </Section>

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

        <Section title="Flashcards" note={`${kit.flashcards.length} cards`}>
          {kit.flashcards.length === 0 ? (
            <Empty>No flashcards for this kit.</Empty>
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

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
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
        {note && <span className="text-xs text-ink-3">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Badge({ children, tone }: { children: ReactNode; tone: "solid" | "soft" }) {
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

function Empty({ children }: { children: ReactNode }) {
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
