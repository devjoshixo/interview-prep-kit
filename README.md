# Interview Prep Kit

Turn a job description + company URL + days-until-interview into a tailored,
editable, practisable interview prep kit: a company brief, tagged requirements, a
categorised question bank, flashcards, and a day-by-day study plan.

Live demo: _<add deploy URL>_ · Batch entrypoint: `npm run evaluate`

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

**Deployed:** any long-running Node host (Render / Railway) + MongoDB Atlas. Set
the same env vars in the host's dashboard (for production I use
`LLM_PROVIDER=gemini`). A long-running server is used deliberately — see
*Design decisions*.

---

## LLM provider / model

The pipeline depends on a single interface, `LlmComplete`, not on any SDK
(`src/lib/llm.ts`). `LLM_PROVIDER` switches the implementation:

- **Gemini** — native JSON mode with a `responseSchema`, so the form's shape is
  enforced by the provider.
- **Groq** (OpenAI-compatible) — the JSON schema is described in the prompt and
  the response is parsed defensively (with markdown-fence stripping).

Both paths share retry-with-exponential-backoff on transient failures (429 /
overload / 5xx). This let me develop on Groq (fast, generous free tier) while
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
2. **The web** — Tavily search (top 2-3 results) enriches the summary and adds
   external citations. The company's own site remains the source of "what they do".

Everywhere, missing data is **honest-none**: no results, an unreachable site, or
unparsable model output yields an empty section — never fabricated content.

---

## Step sequencing

Eight steps, each verified in code before the next trusts it:

1. **Read the JD** — the LLM fills a form; code keeps only requirements whose
   quoted `evidence` actually appears in the JD (hallucinations dropped), and
   derives must/nice from the wording.
2. **Visit the site** — fetch + rank + summarise (above).
3. **Search the web** — Tavily enrichment.
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

Writes are **optimistically concurrent**: the kit carries a `version`, and every
edit / delete / add / regenerate is a **compare-and-swap** (`updateOne` filtered on
the version). A write from a stale view is rejected with `409`; the client reloads
the latest and tells the user, instead of silently losing an update.

---

## Schedule allocation

Pure code (`src/core/schedule.ts`), no LLM. Questions are weighted (harder and
broader-coverage first) then **greedy-packed** into the available days using a
per-day minute budget. The key property (my catch): it's **bounded** — once it's
on the last day, everything remaining lands there, so the plan never spills past N
days and never drops a question. A naive "stop when the day is full" both wastes
days and can overflow.

---

## Creative feature

The kit isn't a document — it's a **study tool**. The `/kit/[id]` view is a tabbed
app (Overview / Questions / Flashcards / Plan) built for active recall:

- **Flashcards flip** (tap to reveal the answer)
- **Questions hide their answers** behind "Show answer" — you think first, then check
- **Progress tracking** — mark questions/cards known; a per-tab progress bar,
  persisted in `localStorage`
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
- **Background job + poll**, on a long-running server rather than serverless, so a
  90-second generation isn't killed by a function timeout and the user sees live
  progress.
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
- `must/nice` priority depends on the wording surviving into the extracted
  requirement text; a reworded requirement can default to `must`.

**What I'd do next:** research caching, per-step observability surfaced in the UI
(timings already captured), and multi-instance correctness testing behind a load
balancer.
