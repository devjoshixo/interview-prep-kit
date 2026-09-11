import Link from "next/link";

export type KitSummary = {
  id: string;
  role: string;
  company: string;
  questions: number;
  createdAt: string;
};

export default function KitList({ kits }: { kits: KitSummary[] }) {
  return (
    <ul className="mt-5 space-y-2">
      {kits.map((k) => (
        <li key={k.id}>
          <Link
            href={`/kit/${k.id}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3.5 transition hover:border-border-strong hover:shadow-card"
          >
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-medium text-ink">{k.role}</span>
              <span className="block truncate text-[13px] text-ink-3">
                {[k.company, `${k.questions} questions`].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-xs text-ink-3">
              {new Date(k.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
