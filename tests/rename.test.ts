import { describe, expect, it } from "vitest";
import {
  getAt,
  parseJson,
  renameColumn,
  stringifyJson,
} from "../src/core/json";

describe("object-array column rename", () => {
  it("renames all own occurrences in order, keeping missing cells and exact numbers", () => {
    const source = parseJson(
      '{"rows":[{"a":9007199254740993,"b":2},{"b":3},{"a":1e999}]}',
    );
    const result = renameColumn(source, ["rows"], "a", "__proto__");
    expect(stringifyJson(result)).toBe(
      '{"rows":[{"__proto__":9007199254740993,"b":2},{"b":3},{"__proto__":1e999}]}',
    );
    expect(stringifyJson(source)).toContain('"a":9007199254740993');
    expect(getAt(result, ["rows", 0, "__proto__"])).toBe(
      getAt(source, ["rows", 0, "a"]),
    );
  });
  it("rejects a collision anywhere without changing any row", () => {
    const source = parseJson('[{"a":1},{"other":2}]');
    expect(() => renameColumn(source, [], "a", "other")).toThrow("Duplicate");
    expect(stringifyJson(source)).toBe('[{"a":1},{"other":2}]');
    expect(renameColumn(source, [], "a", "a")).toBe(source);
    expect(() => renameColumn(parseJson("[{},null]"), [], "a", "b")).toThrow(
      "object array",
    );
  });
});
