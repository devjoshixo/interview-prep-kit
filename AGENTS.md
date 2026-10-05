# Interview Prep Kit — agent brief

**Read `../AGENTS.md` first** (also mirrored at `../Goal/AGENTS.md`). This file is only what is
specific to this project.

## What this is
A shipped Next.js/TS app that turns a job description + company URL into a study kit. The engineering
claim is one rule: **the model never makes a decision.** It fills a structured JSON form; code reads
the fields by name and enforces every constraint.

**This is the ACTIVE project.** Live at interview-prep-kit-sigma.vercel.app.

## Read before touching anything
**`docs/prep-kit-reference.html`** — 28 sections, every file documented. The gate catalogue in §10 is
the one to have in your head: every place code refuses to take the model at its word.

Then `docs/v2-item1-plan.md` for the in-flight work, and `Goal/tracker.md` → V2 SCOPE for the build
order and the **OUT list** — hold that list, the risk here is scope creep, not effort.

## State
v2 item 1 (recording layer): rungs 1–2 done (`src/core/recording.ts`, `src/core/cacheKey.ts`,
21 tests). **Five rungs left**, listed in `docs/v2-item1-plan.md`. Rung 6 — rebuilding a per-user kit
from a recorded generation — is the hard one and the real test of the "blueprint, not kit" boundary.

Branch `docs/architecture-diagram` is pushed and **not merged**. Merging redeploys production.

## Decisions that are settled — do not reverse
- **Store the raw model response; re-run the gate on read.** Buys replay, attribution, retroactive
  gate fixes. A stored post-gate output freezes today's bug into every cached row.
- **The cached unit is a generation, not a kit.** Two users share a key, so anything user-specific in
  an entry is a cross-user leak, not a stale cache.
- **Key on hand-bumped `PROMPT_VERSION` constants, not a hash of the prompt text.**
- **Case is not normalised** in the cache key. Pinned by a test on purpose.

## Working mode here
He owns architecture and decisions; the assistant may type. **But apply the predict-the-file rule
from the root brief** — he writes the field list before you write the file. That rule exists because
of this repo: he made every decision in `recording.ts` and still could not judge it when it appeared.

Every session opens with one ~10-minute revision unit before any code. Units 1–2 done (DI, grounding);
unit 3 (retrieval) scored 2 of 3 and is back in the rotation.

## Known, unfixed
`src/lib/llm.ts` still defaults Groq to `llama-3.3-70b-versatile`, which **is no longer on the model
list** — anyone running with `LLM_PROVIDER=groq` gets a model-not-found. One-line fix.
`KitView.tsx` is 1,407 lines against the repo's own 800-line ceiling.
