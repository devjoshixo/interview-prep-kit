"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Kit, Question, Flashcard } from "../../core/types";

type Status = "edited" | "user-created";
type SectionEdit = Record<string, Status>;
type EditState = { questions?: SectionEdit; flashcards?: SectionEdit };

type DialogOpts = {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
};
type Ask = (opts: DialogOpts) => Promise<boolean>;

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

export default function KitView({
  kit: initialKit,
  kitId,
  editState: initialEdit,
  version: initialVersion,
}: {
  kit: Kit;
  kitId: string;
  editState: EditState;
  version: number;
}) {
  const [kit, setKit] = useState(initialKit);
  const [editState, setEditState] = useState<EditState>(initialEdit);
  const [version, setVersion] = useState(initialVersion);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<(DialogOpts & { resolve: (v: boolean) => void }) | null>(null);
  const ask: Ask = (opts) => new Promise((resolve) => setDialog({ ...opts, resolve }));
  const closeDialog = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };
  const [tab, setTab] = useState<Tab>("Overview");
  const [knownQ, setKnownQ] = useState<Set<string>>(new Set());
  const [knownC, setKnownC] = useState<Set<string>>(new Set());

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

  // On a version conflict (someone changed this kit elsewhere), reload the latest
  // and tell the user — never silently clobber their other session's change.
  async function reloadOnConflict(): Promise<void> {
    const res = await fetch(`/api/kits/${kitId}`);
    if (res.ok) {
      const d = await res.json();
      setKit(d.kit as Kit);
      setEditState(d.editState as EditState);
      setVersion(d.version as number);
    }
    await ask({
      title: "Kit updated elsewhere",
      message: "This kit was changed in another session, so we reloaded the latest. Please redo your change.",
      confirmLabel: "OK",
    });
  }

  async function patch(body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/kits/${kitId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, version }),
    });
    if (res.status === 409) {
      await reloadOnConflict();
      return false;
    }
    const data = await res.json();
    if (res.ok) {
      setKit(data.kit as Kit);
      setEditState(data.editState as EditState);
      setVersion(data.version as number);
    }
    return res.ok;
  }

  async function regenerate(section: "questions" | "flashcards") {
    const ok = await ask({
      title: `Regenerate ${section}?`,
      message: "Your edited and added items are kept — only untouched ones are replaced.",
      confirmLabel: "Regenerate",
      cancelLabel: "Cancel",
    });
    if (!ok) return;
    setBusy(`regen:${section}`);
    try {
      const res = await fetch(`/api/kits/${kitId}/regenerate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, version }),
      });
      if (res.status === 409) {
        await reloadOnConflict();
        return;
      }
      const data = await res.json();
      if (res.ok) {
        setKit(data.kit as Kit);
        setEditState(data.editState as EditState);
        setVersion(data.version as number);
      } else {
        await ask({ title: "Regenerate failed", message: data.error || "Please try again.", confirmLabel: "OK" });
      }
    } finally {
      setBusy(null);
    }
  }

  const idx = TABS.indexOf(tab);
  const go = (delta: number) => {
    const i = idx + delta;
    if (i >= 0 && i < TABS.length) setTab(TABS[i]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
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
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-3">Prep kit</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[2.5rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[3rem]">
            {kit.source.role || "Interview Prep Kit"}
          </h1>
          <p className="mt-3 text-[15px] text-ink-2">
            {[kit.source.company || hostLabel(kit.source.company_url), `${kit.schedule.days_available}-day plan`]
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
              {counts[t] !== undefined && <span className="ml-1.5 text-[12px] text-ink-3">{counts[t]}</span>}
              {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        {tab === "Overview" && <Overview kit={kit} />}
        {tab === "Questions" && (
          <QuestionsTab
            kit={kit}
            status={editState.questions ?? {}}
            known={knownQ}
            setKnown={setKnownQ}
            onPatch={patch}
            onRegenerate={() => regenerate("questions")}
            regenerating={busy === "regen:questions"}
            ask={ask}
          />
        )}
        {tab === "Flashcards" && (
          <FlashcardsTab
            kit={kit}
            status={editState.flashcards ?? {}}
            known={knownC}
            setKnown={setKnownC}
            onPatch={patch}
            onRegenerate={() => regenerate("flashcards")}
            regenerating={busy === "regen:flashcards"}
            ask={ask}
          />
        )}
        {tab === "Plan" && <PlanTab kit={kit} />}
      </div>

      <div className="h-24" />
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border bg-surface/90 p-1.5 shadow-pop backdrop-blur">
          <button
            onClick={() => go(-1)}
            disabled={idx === 0}
            aria-label="Previous tab"
            className="grid h-8 w-8 place-items-center rounded-full text-[15px] text-ink-2 transition hover:bg-bg-sunken hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
          >
            ←
          </button>
          <span className="min-w-[6.5rem] px-1 text-center text-[13px] font-medium text-ink">{tab}</span>
          <button
            onClick={() => go(1)}
            disabled={idx === TABS.length - 1}
            aria-label="Next tab"
            className="grid h-8 w-8 place-items-center rounded-full text-[15px] text-ink-2 transition hover:bg-bg-sunken hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
          >
            →
          </button>
        </div>
      </div>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => closeDialog(false)} />
          <div
            role="dialog"
            aria-modal="true"
            className="reveal relative w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-pop"
          >
            <h3 className="font-display text-[1.15rem] font-semibold tracking-tight text-ink">
              {dialog.title}
            </h3>
            {dialog.message && (
              <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{dialog.message}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              {dialog.cancelLabel && (
                <button
                  onClick={() => closeDialog(false)}
                  className="rounded-full px-4 py-2 text-[13px] font-medium text-ink-2 transition hover:text-ink"
                >
                  {dialog.cancelLabel}
                </button>
              )}
              <button
                onClick={() => closeDialog(true)}
                autoFocus
                className={`rounded-full px-4 py-2 text-[13px] font-medium text-white transition ${
                  dialog.danger ? "bg-[#c05663] hover:brightness-95" : "bg-accent hover:bg-accent-hover"
                }`}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
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
          <p className="mt-4 break-words text-xs text-ink-3">{kit.company_brief.sources.join("   ·   ")}</p>
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
  kit,
  status,
  known,
  setKnown,
  onPatch,
  onRegenerate,
  regenerating,
  ask,
}: {
  kit: Kit;
  status: SectionEdit;
  known: Set<string>;
  setKnown: (fn: (s: Set<string>) => Set<string>) => void;
  onPatch: (b: Record<string, unknown>) => Promise<boolean>;
  onRegenerate: () => void;
  regenerating: boolean;
  ask: Ask;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleOpen = (id: string) => setOpen((s) => toggleSet(s, id));
  const toggleKnown = (id: string) => setKnown((s) => toggleSet(s, id));

  return (
    <div>
      <Toolbar
        left={<Progress done={countIn(known, kit.questions.map((q) => q.id))} total={kit.questions.length} noun="mastered" />}
        onRegenerate={onRegenerate}
        regenerating={regenerating}
      />
      <div className="mt-6 space-y-8">
        {CATEGORIES.map((cat) => {
          const qs = kit.questions.filter((q) => q.category === cat);
          if (qs.length === 0) return null;
          const meta = CATEGORY_META[cat];
          return (
            <div key={cat}>
              <div className="mb-3 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-2">{meta.label}</span>
                <span className="text-[11px] text-ink-3">{qs.length}</span>
              </div>
              <ul className="space-y-3">
                {qs.map((q) => (
                  <EditableQuestion
                    key={q.id}
                    q={q}
                    status={status[q.id]}
                    open={open.has(q.id)}
                    onToggleOpen={() => toggleOpen(q.id)}
                    known={known.has(q.id)}
                    onToggleKnown={() => toggleKnown(q.id)}
                    onSave={(patch) => onPatch({ section: "questions", action: "edit", itemId: q.id, patch })}
                    onDelete={async () => {
                      const ok = await ask({
                        title: "Delete question?",
                        message: "It won't come back when you regenerate.",
                        confirmLabel: "Delete",
                        cancelLabel: "Cancel",
                        danger: true,
                      });
                      if (ok) onPatch({ section: "questions", action: "delete", itemId: q.id });
                    }}
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <AddForm
        label="Add question"
        fields={[
          { key: "prompt", placeholder: "Question prompt", area: true },
          { key: "answer_outline", placeholder: "Answer outline", area: true },
        ]}
        onAdd={(vals) =>
          onPatch({
            section: "questions",
            action: "add",
            item: { ...vals, category: "technical", difficulty: 2, requirement_ids: [] },
          })
        }
      />
    </div>
  );
}

function EditableQuestion({
  q,
  status,
  open,
  onToggleOpen,
  known,
  onToggleKnown,
  onSave,
  onDelete,
}: {
  q: Question;
  status?: Status;
  open: boolean;
  onToggleOpen: () => void;
  known: boolean;
  onToggleKnown: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [answer, setAnswer] = useState(q.answer_outline);
  const diff = DIFF_META[q.difficulty];

  if (editing) {
    return (
      <li className="rounded-xl border border-accent-soft bg-surface p-4">
        <Editor value={prompt} onChange={setPrompt} placeholder="Question prompt" />
        <Editor value={answer} onChange={setAnswer} placeholder="Answer outline" className="mt-2" />
        <EditActions
          onSave={async () => {
            if (await onSave({ prompt, answer_outline: answer })) setEditing(false);
          }}
          onCancel={() => {
            setPrompt(q.prompt);
            setAnswer(q.answer_outline);
            setEditing(false);
          }}
        />
      </li>
    );
  }

  return (
    <li className={`rounded-xl border bg-surface p-4 transition ${known ? "opacity-70" : ""} border-border`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-medium leading-snug text-ink">{q.prompt}</p>
        <span className="mt-0.5 flex shrink-0 items-center gap-2">
          <StatusTag status={status} />
          <span className="text-[11px] font-medium" style={{ color: diff.color }}>{diff.label}</span>
        </span>
      </div>
      {open && (
        <p className="reveal mt-3 border-t border-border pt-3 text-[14px] leading-relaxed text-ink-2">
          {q.answer_outline}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px] font-medium">
        <button onClick={onToggleOpen} className="text-accent transition hover:text-accent-hover">
          {open ? "Hide answer" : "Show answer"}
        </button>
        <button
          onClick={onToggleKnown}
          className={`flex items-center gap-1.5 transition ${known ? "text-[#2f8f76]" : "text-ink-3 hover:text-ink-2"}`}
        >
          <Check on={known} />
          {known ? "Got it" : "Mark known"}
        </button>
        <span className="flex-1" />
        <button onClick={() => setEditing(true)} className="text-ink-3 transition hover:text-ink-2">Edit</button>
        <button onClick={onDelete} className="text-ink-3 transition hover:text-[#c05663]">
          Delete
        </button>
      </div>
    </li>
  );
}

/* ---------- Flashcards ---------- */

function FlashcardsTab({
  kit,
  status,
  known,
  setKnown,
  onPatch,
  onRegenerate,
  regenerating,
  ask,
}: {
  kit: Kit;
  status: SectionEdit;
  known: Set<string>;
  setKnown: (fn: (s: Set<string>) => Set<string>) => void;
  onPatch: (b: Record<string, unknown>) => Promise<boolean>;
  onRegenerate: () => void;
  regenerating: boolean;
  ask: Ask;
}) {
  return (
    <div>
      <Toolbar
        left={<Progress done={countIn(known, kit.flashcards.map((f) => f.id))} total={kit.flashcards.length} noun="known" />}
        onRegenerate={onRegenerate}
        regenerating={regenerating}
      />
      {kit.flashcards.length === 0 ? (
        <div className="mt-6">
          <Empty>No flashcards yet.</Empty>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {kit.flashcards.map((f) => (
            <EditableFlashcard
              key={f.id}
              f={f}
              status={status[f.id]}
              known={known.has(f.id)}
              onToggleKnown={() => setKnown((s) => toggleSet(s, f.id))}
              onSave={(patch) => onPatch({ section: "flashcards", action: "edit", itemId: f.id, patch })}
              onDelete={async () => {
                const ok = await ask({
                  title: "Delete flashcard?",
                  message: "It won't come back when you regenerate.",
                  confirmLabel: "Delete",
                  cancelLabel: "Cancel",
                  danger: true,
                });
                if (ok) onPatch({ section: "flashcards", action: "delete", itemId: f.id });
              }}
            />
          ))}
        </div>
      )}
      <AddForm
        label="Add flashcard"
        fields={[
          { key: "front", placeholder: "Front (question)", area: false },
          { key: "back", placeholder: "Back (answer)", area: true },
        ]}
        onAdd={(vals) => onPatch({ section: "flashcards", action: "add", item: { ...vals, requirement_ids: [] } })}
      />
    </div>
  );
}

function EditableFlashcard({
  f,
  status,
  known,
  onToggleKnown,
  onSave,
  onDelete,
}: {
  f: Flashcard;
  status?: Status;
  known: boolean;
  onToggleKnown: () => void;
  onSave: (patch: Record<string, unknown>) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [front, setFront] = useState(f.front);
  const [back, setBack] = useState(f.back);

  if (editing) {
    return (
      <div className="rounded-xl border border-accent-soft bg-surface p-4">
        <Editor value={front} onChange={setFront} placeholder="Front" />
        <Editor value={back} onChange={setBack} placeholder="Back" className="mt-2" />
        <EditActions
          onSave={async () => {
            if (await onSave({ front, back })) setEditing(false);
          }}
          onCancel={() => {
            setFront(f.front);
            setBack(f.back);
            setEditing(false);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="flip h-40 select-none" onClick={() => setFlipped((v) => !v)}>
        <div className={`flip-inner ${flipped ? "flipped" : ""}`}>
          <div className="flip-face flex cursor-pointer flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-card">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-3">Question</span>
            <p className="text-[15px] font-medium leading-snug text-ink">{f.front}</p>
            <span className="text-[11px] text-ink-3">Tap to flip</span>
          </div>
          <div className="flip-face flip-back flex cursor-pointer flex-col justify-between rounded-xl border border-accent-soft bg-accent-soft/40 p-4 shadow-card">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">Answer</span>
            <p className="text-[13px] leading-relaxed text-ink-2">{f.back}</p>
            <span className="text-[11px] text-ink-3">Tap to flip back</span>
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-3 px-1 text-[12px] font-medium">
        <button
          onClick={onToggleKnown}
          className={`flex items-center gap-1.5 transition ${known ? "text-[#2f8f76]" : "text-ink-3 hover:text-ink-2"}`}
        >
          <Check on={known} />
          {known ? "Known" : "Mark known"}
        </button>
        <StatusTag status={status} />
        <span className="flex-1" />
        <button onClick={() => setEditing(true)} className="text-ink-3 transition hover:text-ink-2">Edit</button>
        <button onClick={onDelete} className="text-ink-3 transition hover:text-[#c05663]">
          Delete
        </button>
      </div>
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

/* ---------- Shared editing UI ---------- */

function Toolbar({ left, onRegenerate, regenerating }: { left: ReactNode; onRegenerate: () => void; regenerating: boolean }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex-1">{left}</div>
      <button
        onClick={onRegenerate}
        disabled={regenerating}
        className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-[13px] font-medium text-ink-2 transition hover:border-border-strong hover:text-ink disabled:opacity-60"
      >
        {regenerating && <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" />}
        {regenerating ? "Regenerating…" : "Regenerate"}
      </button>
    </div>
  );
}

function Editor({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className={`w-full resize-y rounded-[10px] border border-border bg-surface p-2.5 text-[14px] text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft ${className}`}
    />
  );
}

function EditActions({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <button
        onClick={onSave}
        className="rounded-full bg-accent px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-accent-hover"
      >
        Save
      </button>
      <button onClick={onCancel} className="rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-3 transition hover:text-ink-2">
        Cancel
      </button>
    </div>
  );
}

function AddForm({
  label,
  fields,
  onAdd,
}: {
  label: string;
  fields: { key: string; placeholder: string; area: boolean }[];
  onAdd: (vals: Record<string, string>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-6 w-full rounded-xl border border-dashed border-border-strong py-3 text-[13px] font-medium text-ink-3 transition hover:border-accent hover:text-accent"
      >
        + {label}
      </button>
    );
  }
  const canSave = fields.every((f) => (vals[f.key] ?? "").trim());
  return (
    <div className="mt-6 rounded-xl border border-accent-soft bg-surface p-4">
      {fields.map((f, i) => (
        <Editor
          key={f.key}
          value={vals[f.key] ?? ""}
          onChange={(v) => setVals((s) => ({ ...s, [f.key]: v }))}
          placeholder={f.placeholder}
          className={i > 0 ? "mt-2" : ""}
        />
      ))}
      <EditActions
        onSave={async () => {
          if (!canSave) return;
          if (await onAdd(vals)) {
            setVals({});
            setOpen(false);
          }
        }}
        onCancel={() => {
          setVals({});
          setOpen(false);
        }}
      />
    </div>
  );
}

/* ---------- Primitives ---------- */

function StatusTag({ status }: { status?: Status }) {
  if (!status) return null;
  const label = status === "edited" ? "Edited" : "Yours";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
      <span className="h-1 w-1 rounded-full bg-accent" />
      {label}
    </span>
  );
}

function Progress({ done, total, noun }: { done: number; total: number; noun: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2 text-[13px]">
        <span className="text-ink-2">
          <span className="font-display font-semibold text-ink">{done}</span> of {total} {noun}
        </span>
        <span className="text-ink-3">· {pct}%</span>
      </div>
      <div className="h-1 w-40 overflow-hidden rounded-full bg-border">
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
