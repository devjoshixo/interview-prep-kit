# Interview Prep Kit

Turn a job description + company URL + days-until-interview into a tailored,
editable, practisable interview prep kit: a company brief, tagged requirements, a
categorised question bank, flashcards, and a day-by-day study plan.

Live demo: **https://interview-prep-kit-sigma.vercel.app** · Batch entrypoint: `npm run evaluate`

> Sign up with any email and a password of 8+ characters — there's no email
> verification, so it takes about ten seconds. Kits are private to the account
> that made them.

---

## Overview & stack

A full-stack Next.js app. You paste a JD, add the company site and your timeline;
the app researches the role and company and generates a study kit you can edit,
regenerate section-by-section, and practise with (flip flashcards, active-recall
questions, progress tracking).

- **Framework:** Next.js (App Router) + TypeScript + React
- **Styling:** Tailwind CSS v4 (design tokens; Space Grotesk + Inter)
- **DB:** MongoDB (Mongoose)
- **LLM:** provider-agnostic — Gemini **or** Groq, chosen by one env var
- **Web research:** `fetch` + `cheerio` (no headless browser) and Tavily search
- **Auth:** email + password (scrypt, no dependency) with a signed session cookie
- **Tests:** Vitest (61 tests) — the pipeline logic is unit-tested with injected fakes

The core design idea: **the LLM never makes decisions on its own. It fills a
structured JSON form; code reads the fields by name and enforces the rules.** The
LLM is the vendor putting a product in a labelled box; the code is the logistics
company that reads the label and routes it — it never opens the box to judge the
contents.

---

## Setup (local + deployed)

**Prerequisites:** Node 20+, a MongoDB (local Docker or Atlas), and an LLM key
(Gemini or Groq) + a Tavily key.

```sh
npm install
cp .env.example .env.local     # then fill in the values below
```

`.env.local`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/interview_prep   # or an Atlas URI
LLM_PROVIDER=gemini            # "gemini" or "groq"
LLM_API_KEY=...                # key for the chosen provider
LLM_MODEL=gemini-2.5-flash     # or e.g. openai/gpt-oss-120b for groq
TAVILY_API_KEY=...
SESSION_SECRET=...             # any long random string
```

Local Mongo via Docker (optional):

```sh
docker run -d -p 27017:27017 --name ipk-mongo mongo:7
```

Run it:

```sh
npm run dev       # http://localhost:3000
npm test          # unit tests
npm run build     # production build
```

**Batch evaluation** (Appendix B — runs the pipeline over a JSON array of cases,
isolated so one failure doesn't abort the run):

```sh
npm run evaluate -- --input cli/cases.example.json --output kits.json
```

**Deployed:** Vercel (with **Fluid Compute** enabled) + MongoDB Atlas. Set the
same env vars in the project's dashboard. Fluid Compute raises the function
budget to 300s so a ~30s generation finishes comfortably inside one invocation
via `after()`; every outbound call is independently timed out and a watchdog
reconciles any job that still dies mid-run — see *Design decisions*. Portable to
any long-running Node host (Render / Railway) with no code change.

---

## LLM provider / model

The pipeline depends on a single interface, `LlmComplete`, not on any SDK
(`src/lib/llm.ts`). `LLM_PROVIDER` switches the implementation:

- **Gemini** — native JSON mode with a `responseSchema`, so the form's shape is
  enforced by the provider.
- **Groq** (OpenAI-compatible) — the JSON schema is described in the prompt and
  the response is parsed defensively (with markdown-fence stripping).

Both paths share retry on transient failures (429 / overload / 5xx) — and the
retry **honours the provider's own stated wait**. Free tiers cap *tokens* per
minute, not just requests, so a 429 mid-run is normal rather than exceptional;
providers signal how long to wait either in a `retry-after` header or inside the
error body (`"Please try again in 2.265s"`). Reading that instead of guessing is
the difference between riding out the window and losing the run: on a batch of 5
cases, fixed backoff alone failed 3 of them, and honouring the advised wait took
it to **5/5 in under 6 minutes**. This let me develop on Groq (fast, generous free tier) while
targeting Gemini in production — **no code change, just an env var.** Every
pipeline step is unit-tested by injecting a fake `LlmComplete`, so the logic is
verified without spending tokens.

---

## Architecture

```
JD + URL + days ─▶ pipeline (8 steps) ─▶ Kit (typed, Appendix-A shape) ─▶ Mongo
                                                                           │
  builder UI ─▶ POST /api/kits (background job) ─▶ poll progress ─▶ /kit/[id] (study app)
                                                                           │
                              edit / regenerate ─▶ CAS-guarded writes ─────┘
```

- **`src/core/`** — the pure pipeline: one file per step under `steps/`, plus
  `coverage.ts`, `schedule.ts`, `validate.ts`, `regenerate.ts`. No framework, no
  I/O beyond the injected `llm`/`fetch`/`search` — which is why it's unit-testable.
- **`src/lib/`** — provider adapters (`llm`, `http`, `tavily`), `db`, `auth`, `env`.
- **`src/app/`** — App Router pages + API routes; `_components/` for the UI.
- **`src/models/`** — the Mongoose kit + user documents.
- **`cli/evaluate.ts`** — the batch entrypoint.

Generation runs as a **background job**: `POST /api/kits` creates a `generating`
record and returns an id immediately; the pipeline runs server-side writing
per-step progress to Mongo; the client polls and shows a live stepper, then the
finished kit.

---

## Retrieval approach & sources

Two sources, both grounded:

1. **The company's own site** — `fetch` + `cheerio` (no headless browser, a
   deliberate call: cheaper, faster, trivially deployable). I fetch the homepage,
   rank its links by weighted keywords (about / careers / product / team…), visit
   the top few **same-domain** pages, and summarise **only from text actually
   fetched**. Sources are the exact URLs read — the app can't cite a page it
   didn't open.
2. **The web — two distinct searches, not one.** A company-overview query enriches
   the summary; a **separate, targeted query for how the company interviews**
   ("interview process / hiring rounds / interview questions") feeds
   `company_brief.hiring_notes`. That second search is what makes the kit
   *responsive to the company*: the hiring notes are passed into question
   generation, so a company that publishes a take-home plus a system-design round
   produces a different kit from one that says nothing. Empty string when nothing
   is found — the model is told never to guess a process.

The company's own site remains the source of "what they do". Everywhere, missing
data is **honest-none**: no results, an unreachable site, or unparsable model
output yields an empty section — never fabricated content.

Fetched pages are treated as **untrusted data, never instructions** — the brief
prompt fences the page text and tells the model to ignore anything inside it that
looks like a directive, and every structured field (requirement ids, categories)
is verified in code regardless of what the page said.

---

## Step sequencing

Eight steps, each verified in code before the next trusts it:

1. **Read the JD** — the LLM fills a form; code keeps only requirements whose
   quoted `evidence` actually appears in the JD (hallucinations dropped), and
   derives must/nice from the wording.
2. **Visit the site** — fetch + rank + summarise (above).
3. **Search the web** — two Tavily queries: a company overview (enriches the
   summary) and a targeted **interview-process** search whose result becomes
   `hiring_notes` and is fed into step 4, so how they hire shapes what's asked.
4. **Make questions** — **one batched LLM call per category** (not one per
   requirement — my call, to avoid a token/rate-limit blow-up). Code strips any
   `requirement_id` the model invents.
5. **Coverage** — a pure set-difference: which requirements no question references.
6. **Fill gaps** — generate questions **only** for uncovered requirements and
   **append** them; existing questions are never regenerated. Capped at 3 passes
   with early-exit (the cap guarantees termination even if a requirement can't be
   covered).
7. **Schedule** — pure code (below).
8. **Flashcards** — grounded recall cards from the requirements.

Because verification is code, not the model second-guessing itself, a bad model
output degrades gracefully instead of corrupting the kit.

---

## Generated / edited / pinned state

The hardest state problem: **regenerate a section without clobbering the user's
edits.** Each item carries a status that lives *outside* the graded Kit shape:

- `pristine` — model-made, untouched → **the only thing regenerate replaces**
- `edited` — model-made, user rewrote it → **locked, kept verbatim**
- `user-created` — user wrote it → **locked, kept verbatim**
- `deleted` — a **tombstone**: not shown, but fed to the prompt as "don't produce
  this again" so a rejected item never comes back

Regenerate asks the model for only `count(pristine)` new items, passing the locked
items as a *keep* list and the tombstones as an *avoid* list, then merges the fresh
items **around** the locked ones. Locked content never round-trips the model (so it
can't be paraphrased), which is both the correctness guarantee and a cost saving.

**Regeneration is granular.** You can regenerate **one question category on its own**
("regenerate just the system-design questions") without disturbing the other three —
`mergeScoped` replaces only the pristine items inside that scope, leaves locked and
out-of-scope items exactly where they are, and reassigns ids across the whole section
afterwards so nothing collides. Flashcards regenerate as a section, the **company
brief is editable inline**, and the **schedule rebuilds deterministically** (it's
arithmetic over the current questions, so "regenerate" there is a recompute, not an
LLM call).

**Reordering and moving** are first-class alongside edit/add/delete: a question can
be moved up/down **within its category** (buttons rather than drag, so it works from
the keyboard) and **moved to another category** via a select, which validates
against the category enum server-side. A hand-moved question is marked `edited`, so
the user's placement survives the next regeneration — the same guarantee as an edit.

A short regenerate also can't silently shrink a section: fresh items are capped to
the number of pristine slots, and any shortfall (e.g. the model call failed) is
backfilled with the original items, so a failed regenerate is a no-op rather than
data loss.

Writes are **optimistically concurrent**: the kit carries a `version`, and every
edit / delete / add / reorder / move / regenerate is a **compare-and-swap**
(`updateOne` filtered on the version). A write from a stale view is rejected with
`409`; the client reloads the latest and tells the user, instead of silently losing
an update.

---

## Schedule allocation

Pure code (`src/core/schedule.ts`), no LLM. Questions are weighted — **must-have
requirements first**, then harder, then broader-coverage — so a must-have can never
sort behind an easier nice-to-have. They're then **greedy-packed** into the days
using a per-day minute budget.

Two properties I went out of my way to guarantee:

- **Bounded:** once it's on the last day, everything remaining lands there, so the
  plan never spills past N days and never drops a question. A naive "stop when the
  day is full" both wastes days and can overflow.
- **Exactly N days:** the plan spans precisely the number of days requested. When
  there are *more days than questions* (a 60-day run with a thin kit), questions are
  spread one per day and the remainder are emitted as `review` days — rather than
  cramming everything into day 1 and returning a 1-day plan. An empty kit is the one
  exception: no questions means an empty schedule, because inventing 60 review days
  for a kit with nothing in it would be dishonest.

Durations are integer minutes throughout (10/15/20 by difficulty).

---

## Creative feature — the Weak Spots report

**The problem it solves.** The night before an interview you don't need another
list of cards — you need to know *what you're most likely to get burned on*. A
flashcard app can tell you which cards feel shaky. It can't tell you that the thing
you're shaky on is the requirement the employer explicitly marked **must-have**.

**What it does.** A dedicated **Weak spots** tab ranks every extracted requirement
by risk: `risk = (1 − mastery) × priority weight`, where mastery is the average of
your own practice signals attached to that requirement (question marked known,
flashcard confidence — an *unrated* card counts as zero, because you haven't proved
it). Must-haves outrank nice-to-haves at equal mastery, and ties break toward the
requirement with the **least material to practise against**, since thin coverage is
itself a risk. Each row expands into the exact questions and cards to drill.

**Why it's genuinely this app's feature and not a bolt-on.** It only works because
every question and flashcard already carries `requirement_ids` — the same grounding
decision that makes coverage checkable rather than a matter of opinion. The weak
spots report is that graph **turned around**: coverage asks "does every requirement
have a question?", this asks "of the requirements that do, which ones am I still
weakest on, weighted by how much the employer cares?" No extra LLM call, no schema
change — it's pure code over data the pipeline already produces
(`src/core/weakSpots.ts`, unit-tested).

---

## Practice mode & the study app (Section 7)

The kit isn't a document — it's a **study tool**. The `/kit/[id]` view is a tabbed
app (Overview / Questions / Flashcards / Plan / Weak spots) built for active recall:

- **Practice mode — weakest first.** Step through cards **one at a time**, reveal
  the answer, then record how confident you felt (*Shaky / OK / Solid*). The queue
  is ordered **least-confident-first** (unrated cards lead — you haven't proved them
  yet), so each session opens on your weak spots. The order is fixed at session
  start so rating mid-session doesn't reshuffle under you; the *next* session
  re-sorts on the updated scores. I chose confidence-weighted ordering over a full
  spaced-repetition interval deliberately: SRS intervals only pay off across days of
  repeat use, and this tool is used against a deadline measured in days, where
  "show me what I'm worst at, now" is the behaviour that actually helps.
- **Flashcards flip** (click or Enter/Space — keyboard-operable)
- **Questions hide their answers** behind "Show answer" — you think first, then check
- **Progress tracking** — per-tab progress bar plus a rated/shaky count, persisted
  in `localStorage`
- keyboard-navigable tabs, a floating nav pill, and a live generation stepper

Turning "here is your kit" into "work through your kit" is the feature I'm proudest
of, alongside the engineering depth in *Design decisions*.

---

## Design decisions, trade-offs & limitations

**Decisions**
- **LLM fills a form; code enforces the rules.** The whole system's reliability
  rests on this — evidence-grounding, coverage set-difference, id verification are
  all code reading named fields, never the model judging itself.
- **No headless browser.** `fetch` + `cheerio` keeps research cheap and deployable;
  the trade-off is that a fully client-rendered site yields a thin (honest) brief.
- **Provider-agnostic LLM.** One interface, two providers, swappable by env — dev
  on Groq, prod on Gemini.
- **Background job + poll.** `POST /api/kits` returns an id instantly and the
  pipeline runs in `after()`, writing per-step progress the client polls. Deployed
  on Vercel with **Fluid Compute** (300s budget) so a generation isn't killed by
  the default serverless timeout; the same code runs unchanged on a long-running
  host (Render / Railway), which has no per-request cap at all.
- **Resilience: bounded, self-healing generation.** Every outbound call (LLM,
  site fetch, search) has its own `AbortController` timeout, so a hung upstream
  can't consume the function budget — it degrades to honest-none instead. If a
  run still dies (a genuine platform kill), a **watchdog** on the status endpoint
  reconciles the stuck job to `failed`, and the client **auto-retries once**
  silently before ever showing a failure — so a transient blip self-heals and the
  progress view can never spin forever.
- **Optimistic concurrency (CAS on version)** to prevent lost updates on concurrent
  edits/regenerates.
- **Minimal-but-real auth** — scoped to ownership + privacy, not a full identity
  system, to spend the budget where it's graded.

**Trade-offs / limitations**
- The company-site full scan isn't cached; re-running re-fetches. Content-hash
  caching is the next step.
- Free-tier LLM quotas are real — retry/backoff mitigates transient overload but
  can't create quota; a busy day may need a paid key.
- Auth is email/password only (no reset/verification), appropriate for this scope.
- Rate limiting is in-memory (fixed window) on auth + generation. It's enforced
  per instance, so a multi-instance deployment would back it with a shared store
  (e.g. Upstash Redis) for a globally exact limit.
- **The SSRF guard is deliberately scoped to production.** It resolves the host and
  refuses private / loopback / link-local ranges (including the cloud-metadata
  address), re-checking on every redirect hop since a public URL can otherwise
  bounce to an internal one. It is gated on `NODE_ENV === "production"` on purpose:
  the batch entry point is evaluated against company sites that may be served from
  a **local address**, and blocking those outside production would break legitimate
  evaluation runs. A small DNS-rebinding TOCTOU window remains, which pinning the
  resolved IP would close. Responses are also restricted by content type
  (`text/html`) and size (2 MB cap).
- `must/nice` priority is derived in code from the wording, reading both the
  extracted requirement text **and** the verbatim JD evidence quote (the "preferred
  / nice to have" signal often survives only in the quote). A requirement whose
  optionality isn't stated anywhere still defaults to `must`.
- No in-app upload of a description/company **file**: multiple roles are prepared by
  submitting again (each kit is saved and listed), and the batch entry point covers
  bulk runs. A file-upload form is the obvious next increment.
- Robots.txt is not fetched; crawling is bounded instead (same-domain only, max 4
  pages, per-request timeouts) and identifies itself with a descriptive user agent.

**What I'd do next:** research caching, per-step observability surfaced in the UI
(timings already captured), and multi-instance correctness testing behind a load
balancer.
