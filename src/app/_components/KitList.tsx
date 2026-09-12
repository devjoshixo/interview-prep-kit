"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export type KitSummary = {
  id: string;
  role: string;
  company: string;
  questions: number;
  createdAt: string;
};

export default function KitList({ kits }: { kits: KitSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [openingId, setOpeningId] = useState<string | null>(null);

  function open(id: string) {
    setOpeningId(id);
    startTransition(() => router.push(`/kit/${id}`));
  }

  return (
    <ul className="mt-5 space-y-2">
      {kits.map((k) => {
        const opening = pending && openingId === k.id;
        return (
          <li key={k.id}>
            <button
              type="button"
              onClick={() => open(k.id)}
              disabled={pending}
              aria-busy={opening}
              className="flex w-full items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition hover:border-border-strong hover:shadow-card disabled:cursor-default"
            >
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{k.role}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {[k.company, `${k.questions} questions`].filter(Boolean).join(" · ")}
                </span>
              </span>
              {opening ? (
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              ) : (
                <span className="shrink-0 text-xs text-ink-3">
                  {new Date(k.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
