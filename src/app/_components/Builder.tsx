"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STEP_NAMES = [
  "Reading the JD",
  "Visiting the site",
  "Searching the web",
  "Writing questions",
  "Checking coverage",
  "Filling gaps",
  "Building the schedule",
  "Making flashcards",
];

export default function Builder() {
  const router = useRouter();
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd, company_url: companyUrl, days }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "generation failed");
      router.push(`/kit/${data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">New kit</p>
      <h1 className="mt-2 font-display text-[2.25rem] font-semibold leading-[1.05] tracking-tight text-ink sm:text-[2.75rem]">
        Build a prep kit
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink-2">
        Paste a job description, add the company site and your timeline. We read the
        role, research the company, and build a tailored question bank, flashcards
        and a day-by-day plan.
      </p>

      {loading ? (
        <GeneratingCard />
      ) : (
        <div className="mt-8 rounded-card border border-border bg-surface p-5 shadow-card">
          <label className="text-xs font-medium text-ink-2">Job description</label>
          <textarea
            className="mt-2 h-44 w-full resize-y rounded-[10px] border border-border bg-surface p-3.5 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
            placeholder="Paste the full job description here…"
            value={jd}
            onChange={(e) => setJd(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <div className="min-w-56 flex-1">
              <label className="text-xs font-medium text-ink-2">Company URL</label>
              <input
                className="mt-2 w-full rounded-[10px] border border-border bg-surface p-3 text-sm text-ink outline-none transition placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent-soft"
                placeholder="https://company.com"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-ink-2">Days</label>
              <input
                type="number"
                min={1}
                max={60}
                className="tabular mt-2 w-24 rounded-[10px] border border-border bg-surface p-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-3">
            <button
              onClick={generate}
              disabled={!jd.trim()}
              className="btn-gradient rounded-full px-5 py-2.5 text-sm font-medium text-white"
            >
              Generate kit
            </button>
            <span className="text-xs text-ink-3">Takes ~60–90 seconds</span>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">Error: {error}</p>}
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
        <p className="font-display text-base font-semibold text-ink">Generating your kit</p>
      </div>
      <p className="mt-1 text-xs text-ink-3">Running the pipeline · ~60–90 seconds</p>
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
