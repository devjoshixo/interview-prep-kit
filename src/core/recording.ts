// v2 recording layer — the shapes the cache and the eval harness are both built on.
//
// The unit we store is a GENERATION, not a kit. A kit belongs to one user; a
// generation is the blueprint a kit is built from. Two users who paste the same
// JD and the same company URL share a generation and still get their own kit.
//
// We store the RAW model response, never the post-gate output. Skipping the LLM
// call is the expensive win; re-running the gate on read costs a JSON.parse and
// some string matching. Keeping the raw text is what buys us the three things
// that matter:
//   - replay: feed a recorded response through TODAY's validation code;
//   - attribution: when a metric moves, tell a prompt change from a gate change;
//   - retroactive fixes: fix the gate and every cache hit gets the better gate,
//     where a stored post-gate output would stay frozen with the old bug in it.

// What the cache key is computed from. Nothing else may influence the key, and
// nothing outside this set may be DERIVED from and stored in the entry.
export type CacheKeyInputs = {
  readonly jd: string;
  readonly companyUrl: string;
  readonly days: number;
  // Per-step PROMPT_VERSION constants, bumped by hand. Deliberately NOT a hash of
  // the prompt text: a hash invalidates the whole cache on a typo fix, so the
  // decision of what counts as a meaningful change is ours to make. The cost of
  // that is real and it runs the other way — a FORGOTTEN bump serves generations
  // from the old prompt while the report claims they came from the new one, which
  // corrupts the across-version comparison the eval harness exists to make. That
  // is why every recorded call carries its version and the report prints them.
  readonly promptVersions: Readonly<Record<string, string>>;
  readonly model: string;
};

// The outcome of running deterministic code over a raw response. Recorded as a
// FACT ABOUT RECORD TIME, never as the value served: a read re-runs the gate and
// a disagreement with this snapshot means the gate changed underneath us.
export type GateOutcome = {
  readonly parsed: boolean;          // did the raw text parse at all
  readonly accepted: number;         // items that survived the gate
  readonly rejected: number;         // items the gate dropped (e.g. ungrounded)
  readonly rejectedReasons: readonly string[];
};

// One LLM call inside a generation, exactly as it came back.
export type RecordedCall = {
  readonly step: string;             // pipeline step that made the call
  readonly promptVersion: string;    // the PROMPT_VERSION in force for that step
  readonly model: string;
  readonly rawResponse: string;      // verbatim, unparsed, ungated
  readonly gateOutcome: GateOutcome;
  readonly latencyMs: number;
  readonly at: string;               // ISO timestamp
};

// A full recorded generation: the blueprint a per-user kit is built from.
//
// BANNED FROM THIS TYPE, and the reason is one sentence: two different users hit
// the same key, so anything user-specific in here is served to a stranger.
//   - userId / email / any identity
//   - self-reported weak spots and answer grades
//   - user edits and regenerated sections
//   - a schedule anchored to one user's start date (days_available is an input
//     and is IN the key; the calendar it maps onto is not)
// If a field cannot be derived from CacheKeyInputs alone, it does not belong here.
export type CachedGeneration = {
  readonly key: string;
  readonly keyInputs: CacheKeyInputs;
  readonly recordedAt: string;       // ISO timestamp
  readonly calls: readonly RecordedCall[];
};
