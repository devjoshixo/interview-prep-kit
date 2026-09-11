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
