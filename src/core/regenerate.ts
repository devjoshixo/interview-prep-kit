// Regenerate — the state model's core (pure, no LLM).
//
// A section (questions, flashcards) is a list of items. Edit state lives OUTSIDE
// the graded Kit shape, in a per-section map of item id -> status. Pristine items
// are absent from the map. Deleted items are not in the list at all; their text
// is kept as a tombstone (the "avoid" list) so regenerate won't resurrect them.
//
//   pristine      -> fair game: regenerate may replace it
//   edited        -> locked: the user rewrote it, keep verbatim
//   user-created  -> locked: the user wrote it, keep verbatim
//   deleted       -> tombstone: not shown, fed to the prompt as "do not produce"
//
// Regenerate replaces ONLY the pristine items, working around the locked ones.

export type EditStatus = "edited" | "user-created";
export type StatusMap = Record<string, EditStatus>;

// Split a section's items into locked (carry a status) and pristine (do not).
export function partition<T extends { id: string }>(
  items: T[],
  status: StatusMap
): { locked: { item: T; status: EditStatus }[]; pristine: T[] } {
  const locked: { item: T; status: EditStatus }[] = [];
  const pristine: T[] = [];
  for (const item of items) {
    const st = status[item.id];
    if (st) locked.push({ item, status: st });
    else pristine.push(item);
  }
  return { locked, pristine };
}

// Rebuild a section after regeneration: keep the locked items (content + status
// intact), drop the old pristine ones, append the freshly generated items as
// pristine. Ids are reassigned contiguously (`${idPrefix}-N`) so nothing
// collides; the returned status map is keyed by the new ids.
//
// NOTE: because ids are reassigned, any list that references them by id (e.g. the
// schedule referencing question ids) must be rebuilt by the caller afterwards.
export function mergeSection<T extends { id: string }>(
  locked: { item: T; status: EditStatus }[],
  fresh: T[],
  idPrefix: string
): { items: T[]; status: StatusMap } {
  const combined: { item: T; st?: EditStatus }[] = [
    ...locked.map((l) => ({ item: l.item, st: l.status })),
    ...fresh.map((item) => ({ item, st: undefined })),
  ];

  const items: T[] = [];
  const status: StatusMap = {};
  combined.forEach((entry, i) => {
    const id = `${idPrefix}-${i + 1}`;
    items.push({ ...entry.item, id });
    if (entry.st) status[id] = entry.st;
  });
  return { items, status };
}

// How many fresh items to request: one per pristine slot being replaced.
export function replacementCount<T extends { id: string }>(
  items: T[],
  status: StatusMap
): number {
  return partition(items, status).pristine.length;
}

// Replace ONLY the pristine items that fall inside a scope (e.g. one question
// category), leaving every other item — locked or out-of-scope — exactly where it
// is. Used by per-category regeneration: regenerating "system-design" must not
// disturb the technical questions, and must not renumber them into a collision.
// Ids are reassigned contiguously across the whole section afterwards, and the
// returned status map is keyed by the new ids.
export function mergeScoped<T extends { id: string }>(
  items: T[],
  status: StatusMap,
  inScope: (item: T) => boolean,
  fresh: T[],
  idPrefix: string
): { items: T[]; status: StatusMap } {
  const queue = [...fresh];
  const ordered: { item: T; st?: EditStatus }[] = [];

  for (const item of items) {
    const st = status[item.id];
    if (!st && inScope(item)) {
      const replacement = queue.shift();
      if (replacement) ordered.push({ item: replacement, st: undefined });
      // no replacement available => the slot is dropped (reconcileFresh normally
      // guarantees a 1:1 count, so this is a belt-and-braces path)
    } else {
      ordered.push({ item, st });
    }
  }
  for (const extra of queue) ordered.push({ item: extra, st: undefined });

  const out: T[] = [];
  const outStatus: StatusMap = {};
  ordered.forEach((entry, i) => {
    const id = `${idPrefix}-${i + 1}`;
    out.push({ ...entry.item, id });
    if (entry.st) outStatus[id] = entry.st;
  });
  return { items: out, status: outStatus };
}

// Reconcile freshly generated items against the pristine slots they replace.
// Two failure modes to guard against, both otherwise silent:
//   - the model returns MORE than requested -> cap to the pristine count so the
//     section can't grow every time regenerate is clicked;
//   - the model returns FEWER (e.g. the call threw and grounded to []) -> keep
//     the leftover ORIGINAL pristine items instead of dropping them, so the
//     section never silently shrinks (empty fresh => an honest no-op).
export function reconcileFresh<T extends { id: string }>(
  fresh: T[],
  pristine: T[]
): T[] {
  const capped = fresh.slice(0, pristine.length);
  if (capped.length >= pristine.length) return capped;
  return [...capped, ...pristine.slice(capped.length)];
}
