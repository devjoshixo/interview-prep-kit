import { describe, it, expect } from "vitest";
import { parseJsonArray } from "../src/core/parseArray";

describe("parseJsonArray (model shape drift must not empty a section)", () => {
  it("accepts a bare array", () => {
    expect(parseJsonArray('[{"a":1}]')).toEqual([{ a: 1 }]);
  });

  it("accepts the array wrapped in an object, whatever the key is", () => {
    expect(parseJsonArray('{"flashcards":[{"a":1}]}')).toEqual([{ a: 1 }]);
    expect(parseJsonArray('{"items":[{"b":2}]}')).toEqual([{ b: 2 }]);
    expect(parseJsonArray('{"questions":[{"c":3}]}')).toEqual([{ c: 3 }]);
  });

  it("ignores non-array properties and finds the array", () => {
    expect(parseJsonArray('{"note":"here you go","data":[{"a":1}]}')).toEqual([{ a: 1 }]);
  });

  it("returns [] for unusable output — honest-none is preserved", () => {
    expect(parseJsonArray("not json at all")).toEqual([]);
    expect(parseJsonArray('{"nothing":"useful"}')).toEqual([]);
    expect(parseJsonArray('"a string"')).toEqual([]);
    expect(parseJsonArray("")).toEqual([]);
  });
});
