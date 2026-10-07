# Interview Prep Kit v2 — build guide for the assistant

Written 2026-10-07 for whichever AI assistant helps finish v2 (Antigravity / Gemini, or anything
else). `AGENTS.md` says what the project is and what is settled. This file says **where to start,
what to teach before each piece, and the traps**, for everything left in v2.

**Read first, in this order:**

1. `../Goal/AGENTS.md` — who he is and how to work with him.
2. `AGENTS.md` (this repo) — what the project is, settled decisions, known defects.
3. `docs/v2-item1-plan.md` — the detailed plan for item 1's remaining rungs.
4. `Goal/tracker.md` -> "V2 SCOPE", "WHY THIS ORDER", "ITEM 5", "THE PREDICT-THE-FILE RULE".
5. `docs/prep-kit-reference.html` — the field manual. Open the section for a file before touching it.

If this guide and those disagree, the tracker and the plan win. This guide adds teaching order and
traps; it does not add scope.

---

## 0. Facts that are easy to get wrong (all checked in the code on 2026-10-07)

- **The v2 work is NOT on `main`.** `recording.ts`, `cacheKey.ts` and their tests live on branch
  `docs/architecture-diagram` (commit `3bedc8c` onwards). `main` is still the graded submission.
  Merging redeploys production, and the tag `submission-2026-09-13` should be pushed before any
  merge. **Merging is his decision.** Work on the branch he says to; ask if unsure.
- **`LlmComplete` returns only a string** (`src/lib/llm.ts`). The provider's token counts are in
  the response and are thrown away in `extract`. Item 3 (cost accounting) cannot be built without
  changing this, and changing it touches every step and every fake `llm` in `tests/`.
- **Retries happen inside `complete`** (up to 5 attempts, with backoff and Retry-After sleeps). A
  recorder that wraps the injected `llm` sees one call per step. Its measured latency includes the
  sleeps, and the number of attempts is invisible to it.
- **`rateLimit` is in-memory, per instance** (`src/lib/rateLimit.ts`, its own comment says so). On
  Vercel there can be several instances. The provider's token budget is per API key, shared by all
  of them. This matters a lot for item 5.
- **The database is MongoDB via mongoose** (`src/lib/db.ts`, `src/models/`), not Postgres.
- **Known defect:** the Groq default model `llama-3.3-70b-versatile` is gone from Groq's list.
  `KitView.tsx` is over the 800-line limit. Both are listed in `AGENTS.md`; neither is v2 scope.

---

## 1. How every session runs

1. **Revision unit first, ~10 minutes, before any code.** Remaining units, in order: retrieval (back
   in rotation, scored 2 of 3) -> generation + coverage loop -> the state model -> CAS -> schedule ->
   resilience -> Weak Spots. Score each on three beats: mechanism / constraint / trade-off.
2. **Predict the file.** Before you write any file, he writes its contents in plain English. Do not
   write the file until that list exists. Then compare.
3. **You may type the code.** This repo is AI-coded by his decision. He owns the architecture and
   every decision listed in section 9.
4. **The measurements are his.** You can write the harness. He runs it, reads the numbers and writes
   what surprised him. The surprise is what goes on the resume, and you cannot have it for him.
5. **A boundary that matters gets a test that fails when it is crossed**, not a comment.
6. Short, scannable answers. Quiz after each rung.

---

## 2. Item 1 — the recording layer, rungs 3 to 7

The plan for each rung is in `docs/v2-item1-plan.md`. Below: what to teach first, and the trap.

### Rung 3 — `PROMPT_VERSION` in each LLM-calling step

- **Teach first:** why a hand-bumped version instead of hashing the prompt text (already decided,
  see the plan). The cost: a forgotten bump silently corrupts item 2's comparisons.
- **Option to offer him (his call):** a test that stores a hash of each prompt template next to its
  version and fails if the template changes while the version does not. That turns "remember to
  bump" into a check that fails.
- **Done when** every step exports a version, `cacheKey` consumes the collected record, and tests
  pass.

### Rung 4 — the `Generation` store

- **Teach first:** what a unique index guarantees under concurrency. Two users with the same JD can
  miss the cache at the same moment, both run the pipeline, and both try to insert. The second insert
  fails with MongoDB's duplicate-key error (code 11000).
- **Link to make for him:** this is the same shape as Holdfast's claim-first idempotency, where
  Postgres error 23505 is the verdict. Same idea, different database. Let him say what the right
  response to the duplicate is before you say it.
- **Owed here (from the plan):** `schemaVersion` on `CachedGeneration`, and a runtime guard that
  rejects any banned user-derived key, **with a test that tries to store one**.
- **Decide here or write down that there is none:** expiry. MongoDB has TTL indexes; whether to use
  one is his decision.

### Rung 5 — record raw responses and gate outcomes on a live run

- **Teach first:** where a wrapper sits relative to `complete`'s retry loop (section 0). Then put the
  decision to him:
  - record at the wrapper: simple, no change to `llm.ts`, but no attempt count, and latency includes
    retry sleeps;
  - record inside `complete`: sees every attempt, but touches the provider code.
- **This is also the moment to decide on token counts.** Item 3 needs them, and they are only
  available inside `llm.ts`. Widening `LlmComplete` once now is cheaper than twice.
- **Done when** a live run writes one `CachedGeneration` with raw responses, versions, latency and
  gate outcomes, and no user-derived field.

### Rung 6 — the read path (the hard one)

- **Teach first:** replay means re-running today's gate and assembly over yesterday's raw model
  output. Ask him: *what else does the gate need, apart from the model's output?*
- **Known safe case:** `readJd`'s grounding gate checks evidence quotes against the JD itself, and
  the JD is part of the cache key, so that gate can always be replayed.
- **Trap to check in the code before designing:** if a gate checks the model's claims against
  fetched evidence (company pages, search results), replaying it needs that same evidence. If the
  evidence is not recorded, a replay either cannot run the gate or runs it against today's web,
  which is a different input. Fetched public pages are not user-derived, so they are allowed in a
  shared entry; check that against the ban list with him.
- **The stopping rule from the plan holds:** if a hit cannot be served without storing something
  user-specific, stop and fix the boundary. Do not work around it.

### Rung 7 — resumable `cli/evaluate.ts`

- **Teach first:** persist each case's result as soon as it completes; on restart, skip completed
  cases. Key completed results by case id plus prompt versions plus model, so a version change does
  not wrongly skip work.
- **Link for him:** write each result file atomically, temp file then rename. He did exactly this in
  6.5840 Lab 1, so ask him why it matters here before explaining.

---

## 3. Item 2 — the eval harness

- **The inputs must actually be frozen.** Ten frozen JDs are not a frozen test if `visitSite` and
  `searchWeb` fetch the live web on every run: a company site or a search result can change between
  runs, and then a metric moves for a reason that has nothing to do with the prompt. Raise this with
  him before building. Options include recording fetched evidence per case, or accepting it and
  reporting it. It is his call, but it must be a decision, not an accident.
- **Measure the noise floor first.** Run the same set twice with nothing changed. The difference
  between those two runs is the noise. Any later difference smaller than that is not a finding.
  Model output varies run to run (temperature is not zero for Groq in `llm.ts`; check Gemini's
  setting). This step is what makes "coverage went 82 -> 91" believable.
- **Persist the four metrics with the versions and model they ran under**, and print those versions
  in every report.
- **Free extra field from the plan:** whether `visitSite` returned `pages_used: []`. That is the SPA
  coverage number, and it decides whether a headless browser is ever worth it.
- **Time, honestly:** the calendar goes to the golden set, about 20 hand-written labels, and
  babysitting runs under free-tier limits. Week three will feel like waiting. That is the work.

---

## 4. Item 3 — cost accounting, then the model-routing experiment

- **Tokens come from the provider's response**, not from estimating the prompt length. Gemini and the
  OpenAI-style Groq API both return usage counts; check the current field names in their docs.
- **Store token counts, not money.** Keep a price table with the date the prices were read, and
  compute cost when the report runs. Prices change; stored token counts can be re-priced. Same
  principle as "store raw, re-gate on read."
- **The routing experiment:** do the easy steps need the expensive model?
  - **His prediction goes in writing before the first run, or it does not count.** Which steps can
    use the cheap model, and where quality breaks.
  - Change one step's model at a time. Measure that step's quality with the item 2 metrics, plus the
    cost difference.
  - The result has the same shape as Holdfast's M1 crossover. Point that out; it is the resume story.

---

## 5. Item 4 — answer grading

- **The model judges, code constrains**, the same thesis again. The model fills a form: a score
  from a fixed scale, which rubric points were met, and quotes from the user's answer as evidence.
  Code checks that each quote actually appears in the answer, rejects out-of-range scores, and
  decides what Weak Spots does with the result.
- **Calibrate against him.** He hand-grades a small set of answers first. Report how often the model
  agrees with him. Without that number, "the grader works" is just an opinion.
- **Known judge habits to test for:** preferring longer answers, and drifting when the rubric is
  vague. A test answer that is long but wrong is a good check.

---

## 6. Item 5 — admission control over the token budget

Read the tracker's "ITEM 5" section first. Its scope fence is fixed: token bucket over the real
budget, per-user fair queueing, shed with 429 + Retry-After, one goodput-under-overload chart. Not a
queue system, not workers, not multi-instance. And it comes **after** item 3, because it needs the
token numbers.

- **The motivating defect (his opening line):** today's limiter counts requests; the scarce thing is
  tokens per minute.
- **Teach first:** a token bucket, a capacity that refills at a fixed rate. Here, the "tokens" are
  literally LLM tokens.
- **Trap 1, you only know the cost after the call.** Input tokens can be estimated before the call
  (or counted with the provider's counting endpoint, if it has one; check). Output tokens are
  unknown. The standard technique: reserve an estimate before the call, then correct it with the real
  usage afterwards. Teach the technique; let him choose the estimate.
- **Trap 2, the instance problem.** The provider budget is shared by every instance of the app. A
  bucket in one instance's memory is not. Options: a shared store (MongoDB with atomic updates is
  already there; Redis is another), or state clearly that the measured run is single-instance and
  why. The scope fence says no multi-instance work, so the honest-scope option is legitimate, but it
  must be written into the results, not hidden.
- **Retry-After should be computed** from how long until the bucket has enough tokens, not a fixed
  guess.
- **Fair queueing:** one heavy user must not starve the others. Named techniques: per-user queues
  served round-robin, or deficit round-robin when requests differ in size.
- **The goodput curve:** increase offered load step by step; plot successful useful kits per minute
  against offered load. Use an **open-loop** load generator, which sends at a fixed rate regardless
  of responses. A closed-loop one (each client waits for its reply) slows down when the system
  slows down and hides the overload. This is the same trap as Holdfast M6, so learn it once here.

---

## 7. Item 6 — the write-up

- **His first draft.** Shape: question / setup / measurement / finding / what surprised me, like
  Holdfast's `M1-results.md`. You may fix grammar. You may not write it.
- **Done** means `docs/v2-results.md` is published **and** the resume's prep-kit line leads with
  measured numbers (eval metrics across versions, the routing crossover, the goodput curve), not
  features. Publishing it is also Holdfast's resume trigger.

---

## 8. The OUT list (do not let these back in)

Agents and tool-calling (they contradict the thesis); voice mock interview; queue + workers,
multi-instance, Kubernetes; vector DB, semantic dedup, fine-tuning; orgs and collaboration; any
redesign. They go in `IDEAS.md` as additions to a shipped project. If he proposes one mid-v2, point
at this list once, then respect what he decides.

Embeddings and vector search are deliberately left for the Reflection Tool
(`Goal/ideas/reflection-tool/`), which comes after v2.

---

## 9. Decisions that are his

Present two or three options, each with a one-line trade-off. Do not decide:

- merging the branch to `main` and redeploying production
- where recording happens (wrapper vs inside `complete`) and whether to widen `LlmComplete`
- what gets recorded for replay (evidence or not), and expiry of cached generations
- what counts as frozen in the golden set
- the routing prediction, and the grading rubric
- single-instance honest scope vs shared state for the token bucket
- every sentence of the write-up

Technical defaults (test layout, helper names, library choice) you may propose. Name the choice and
the reason in one line so he can overrule it.
