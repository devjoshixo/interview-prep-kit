import { describe, it, expect } from "vitest";
import {
  partition,
  mergeSection,
  replacementCount,
  type StatusMap,
} from "../src/core/regenerate";

type Item = { id: string; text: string };

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
