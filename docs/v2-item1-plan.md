# v2 Item 1 — the recording layer, remaining work

Written 2026-09-21 so this is executable without the conversation it came from.
Read `Goal/tracker.md` ("V2 SCOPE" and "WHY THIS ORDER") for why item 1 comes first.

**Thesis it serves:** the model never makes a decision, and that is provable with numbers.
Item 1 is what makes anything measurable at all — you cannot measure what you never recorded.

## Done

| Rung | File | What it settled |
|---|---|---|
| 1 | `src/core/recording.ts` | `CacheKeyInputs`, `GateOutcome`, `RecordedCall`, `CachedGeneration`. Store the RAW model response, never post-gate output. User-derived fields banned from a shared entry. |
| 2 | `src/core/cacheKey.ts` + `tests/cacheKey.test.ts` | Normalise then hash. Also fixed `normalizeCompanyUrl` in `visitSite.ts` to drop the path. |

Commit `3bedc8c`.

### Decisions already made — do not silently reverse these

- **Store raw, re-gate on read.** Re-running the gate costs a parse and some string matching.
  It buys replay against today's validation code, attribution when a metric moves (prompt change
  vs gate change), and retroactive gate fixes. A stored post-gate output is frozen with whatever
  bug it had at write time.
- **The stored unit is a generation, not a kit.** Two users who paste the same JD and company URL
  share a key. Anything user-specific in the entry gets served to a stranger — that is a
  cross-user leak, not a stale cache. Banned: user id, self-reported weak spots, answer grades,
  user edits, regenerated sections, a schedule anchored to one user's start date.
- **Key on hand-bumped `PROMPT_VERSION` constants, not a hash of the prompt text.** A text hash
  invalidates the whole cache on a typo fix. The cost runs the other way: a FORGOTTEN bump serves
  old-prompt generations while the report claims the new prompt produced them, which corrupts the
  across-version comparison item 2 exists to make. Mitigation: every recorded call carries its
  version, and the eval report prints the versions its cases actually ran under.
- **JD case is not normalised.** "SENIOR ENGINEER" may genuinely be a different prompt. Pinned by
  a test so a later change has to argue with it.
- **Company URL reduces to the host.** A pasted route is the same company by another door, and
  `visitSite` drops the path too, so the key describes exactly what gets fetched. Subdomains stay
  separate.

## Remaining rungs

### 3. `PROMPT_VERSION` in the seven LLM-calling steps

Files: `src/core/steps/` — `readJd.ts`, `visitSite.ts`, `searchWeb.ts`, `makeQuestions.ts`,
`makeFlashcards.ts`, `fillGaps.ts`, `regenerateSection.ts`.

Export a `const PROMPT_VERSION = "1"` from each, and collect them into the
`promptVersions` record that feeds `cacheKey`. Mechanical, one session.

Bump the version whenever a prompt change could alter the output distribution. Whitespace and
comment edits do not count. When in doubt, bump — a wasted cache entry is cheap, a corrupted
comparison is not.

### 4. A `Generation` store

Next to `src/models/kit.ts`. Persists a `CachedGeneration` keyed by `key`, with a unique index
on it. Reads are `findOne({ key })`.

Two debts to settle here, both deliberately deferred from rung 1:

- **`schemaVersion` on `CachedGeneration`.** Without it, a later shape change makes old rows
  deserialize silently into the new type.
- **A runtime guard on the write path.** The ban list in `recording.ts` is a comment, and a
  comment prevents nothing. Data arriving as JSON bypasses TypeScript entirely. Reject a write
  containing any banned key, and test THAT — there was nothing to test at the type level, because
  the compiler already rejects it.

Also decide the eviction/TTL story here or write down that there isn't one.

### 5. Record raw responses and gate outcomes on a live run

The invasive one. `src/core/pipeline.ts` runs the steps; each step calls `deps.llm`.

Cleanest approach that does not rewrite the steps: wrap the injected `llm` in a recorder that
captures prompt version, raw response and latency per call, and have the pipeline write one
`CachedGeneration` at the end. The gate outcome is known where the step parses and filters, so
either return it alongside or have the recorder re-derive it.

This is where dependency injection pays off — the same seam the tests already use.

### 6. The read path: rebuild a per-user kit from a recorded generation

**The hard one, and the one that tests whether "blueprint, not kit" actually holds.**

On generate: compute the key, look it up. Miss — run the pipeline and record. Hit — take the
recorded raw responses, run them through today's gate and today's assembly code, and produce a
fresh kit for THIS user.

A cache hit must not return a stored kit. It replays the recorded generation. If that turns out
to be impossible without storing something user-specific, the boundary was wrong and it is worth
stopping to fix rather than working around.

### 7. Resumable `cli/evaluate.ts`

Today a 429 mid-sweep costs the whole run. Persist per-case results as they complete and skip
completed cases on restart, so a failure costs one case.

This is what makes item 2 affordable: the golden set gets run over and over, and the cache means
most cases cost nothing the second time.

## Then item 2 begins

Ten frozen JDs, the four metrics persisted rather than discarded, compared across prompt
versions. Add one field while you are there: whether `visitSite` returned `pages_used: []`.
That gives the SPA-coverage number for free, and that number decides whether a headless browser
is ever worth revisiting (it is in `IDEAS.md`, deliberately out of v2 scope).
