import { describe, it, expect } from "vitest";
import {
  partition,
  mergeSection,
  replacementCount,
  reconcileFresh,
  mergeScoped,
  type StatusMap,
} from "../src/core/regenerate";

type Item = { id: string; text: string };

describe("mergeScoped (per-category regeneration)", () => {
  type Q = { id: string; text: string; category: string };
  const items: Q[] = [
    { id: "q-1", text: "tech kept", category: "technical" },
    { id: "q-2", text: "sd old A", category: "system-design" },
    { id: "q-3", text: "sd edited", category: "system-design" },
    { id: "q-4", text: "tech other", category: "technical" },
    { id: "q-5", text: "sd old B", category: "system-design" },
  ];
  const status: StatusMap = { "q-3": "edited" };
  const inScope = (q: Q) => q.category === "system-design";

  it("replaces only pristine in-scope items and leaves the rest in place", () => {
    const fresh: Q[] = [
      { id: "n-1", text: "sd NEW A", category: "system-design" },
      { id: "n-2", text: "sd NEW B", category: "system-design" },
    ];
    const out = mergeScoped(items, status, inScope, fresh, "q");
    expect(out.items.map((i) => i.text)).toEqual([
      "tech kept", // untouched, other category
      "sd NEW A", // replaced
      "sd edited", // locked, kept verbatim in place
      "tech other", // untouched, other category
      "sd NEW B", // replaced
    ]);
  });

  it("reassigns ids contiguously and re-keys the status map", () => {
    const fresh: Q[] = [
      { id: "n-1", text: "a", category: "system-design" },
      { id: "n-2", text: "b", category: "system-design" },
    ];
    const out = mergeScoped(items, status, inScope, fresh, "q");
    expect(out.items.map((i) => i.id)).toEqual(["q-1", "q-2", "q-3", "q-4", "q-5"]);
    expect(out.status).toEqual({ "q-3": "edited" }); // the edited item is still 3rd
  });

  it("never touches another category's items", () => {
    const out = mergeScoped(items, status, inScope, [], "q");
    const technical = out.items.filter((i) => i.category === "technical").map((i) => i.text);
    expect(technical).toEqual(["tech kept", "tech other"]);
  });
});

describe("reconcileFresh (no silent shrink / no inflation on regenerate)", () => {
  const pristine: Item[] = [
    { id: "q-1", text: "old A" },
    { id: "q-2", text: "old B" },
    { id: "q-3", text: "old C" },
  ];

  it("returns fresh as-is when the count matches", () => {
    const fresh: Item[] = [
      { id: "n-1", text: "new A" },
      { id: "n-2", text: "new B" },
      { id: "n-3", text: "new C" },
    ];
    expect(reconcileFresh(fresh, pristine)).toEqual(fresh);
  });

  it("caps inflation: a chatty model can't grow the section", () => {
    const fresh: Item[] = [
      { id: "n-1", text: "new A" },
      { id: "n-2", text: "new B" },
      { id: "n-3", text: "new C" },
      { id: "n-4", text: "extra" },
    ];
    const out = reconcileFresh(fresh, pristine);
    expect(out).toHaveLength(3);
    expect(out.map((x) => x.text)).toEqual(["new A", "new B", "new C"]);
  });

  it("backfills a shortfall with the original pristine items", () => {
    const fresh: Item[] = [{ id: "n-1", text: "new A" }];
    const out = reconcileFresh(fresh, pristine);
    expect(out).toHaveLength(3); // never shrinks
    expect(out.map((x) => x.text)).toEqual(["new A", "old B", "old C"]);
  });

  it("empty fresh (LLM call failed) keeps ALL originals — a no-op, not data loss", () => {
    const out = reconcileFresh([], pristine);
    expect(out).toEqual(pristine);
  });
});

const items: Item[] = [
  { id: "q-1", text: "edited one" },
  { id: "q-2", text: "pristine one" },
  { id: "q-3", text: "user made" },
  { id: "q-4", text: "another pristine" },
];
const status: StatusMap = { "q-1": "edited", "q-3": "user-created" };

describe("partition", () => {
  it("splits locked (has status) from pristine (no status)", () => {
    const { locked, pristine } = partition(items, status);
    expect(locked.map((l) => l.item.id)).toEqual(["q-1", "q-3"]);
    expect(locked.map((l) => l.status)).toEqual(["edited", "user-created"]);
    expect(pristine.map((p) => p.id)).toEqual(["q-2", "q-4"]);
  });
});

describe("replacementCount", () => {
  it("counts only the pristine items (the ones regenerate replaces)", () => {
    expect(replacementCount(items, status)).toBe(2);
    expect(replacementCount(items, {})).toBe(4); // all pristine
    expect(
      replacementCount(items, { "q-1": "edited", "q-2": "edited", "q-3": "user-created", "q-4": "edited" })
    ).toBe(0); // nothing pristine -> nothing to regenerate
  });
});

describe("mergeSection (the core: locked survive, pristine replaced)", () => {
  it("keeps locked items verbatim, drops pristine, appends fresh as pristine", () => {
    const { locked } = partition(items, status);
    const fresh: Item[] = [{ id: "tmp", text: "brand new question" }];

    const { items: merged, status: newStatus } = mergeSection(locked, fresh, "q");

    // locked content preserved, fresh appended; old pristine (q-2, q-4) gone
    expect(merged.map((m) => m.text)).toEqual([
      "edited one",
      "user made",
      "brand new question",
    ]);
    // ids reassigned contiguously
    expect(merged.map((m) => m.id)).toEqual(["q-1", "q-2", "q-3"]);
    // status re-keyed to new ids; fresh item is pristine (absent)
    expect(newStatus).toEqual({ "q-1": "edited", "q-2": "user-created" });
  });

  it("with everything locked, regenerate changes nothing (fresh is empty)", () => {
    const allLocked: StatusMap = { "q-1": "edited", "q-2": "edited", "q-3": "user-created", "q-4": "user-created" };
    const { locked, pristine } = partition(items, allLocked);
    expect(pristine).toHaveLength(0);
    const { items: merged } = mergeSection(locked, [], "q");
    expect(merged.map((m) => m.text)).toEqual([
      "edited one",
      "pristine one",
      "user made",
      "another pristine",
    ]);
  });

  it("with nothing locked, every item is replaced by fresh", () => {
    const { locked } = partition(items, {});
    const fresh: Item[] = [
      { id: "a", text: "new 1" },
      { id: "b", text: "new 2" },
    ];
    const { items: merged, status: newStatus } = mergeSection(locked, fresh, "q");
    expect(merged.map((m) => m.text)).toEqual(["new 1", "new 2"]);
    expect(newStatus).toEqual({}); // all pristine
  });
});
