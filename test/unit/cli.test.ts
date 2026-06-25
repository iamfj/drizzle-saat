import { describe, expect, test } from "bun:test";
import { parseSeed } from "../../src/cli.js";
import { SaatError } from "../../src/util/errors.js";

describe("parseSeed", () => {
  test("returns undefined when no flag is given", () => {
    expect(parseSeed(undefined)).toBeUndefined();
  });

  test("parses a valid integer (incl. negative and trimmed)", () => {
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed("-7")).toBe(-7);
    expect(parseSeed("  13  ")).toBe(13);
  });

  test("accepts a number (cac passes numeric flags as numbers, not strings)", () => {
    expect(parseSeed(42 as unknown as string)).toBe(42);
    expect(parseSeed(0 as unknown as string)).toBe(0);
  });

  test.each(["abc", "1.5", "", "   ", "NaN", "1e3.2"])(
    "rejects non-integer input %p with a pointed SaatError",
    (value) => {
      expect(() => parseSeed(value)).toThrow(SaatError);
      expect(() => parseSeed(value)).toThrow(/--seed must be an integer/);
    },
  );
});
