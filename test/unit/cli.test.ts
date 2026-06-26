import { describe, expect, test } from "bun:test";
import { parseSeed, parseTruncate } from "../../src/cli.js";
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

describe("parseTruncate", () => {
  test("returns undefined when no flag is given", () => {
    expect(parseTruncate(undefined)).toBeUndefined();
  });

  test("parses cascade and restrict (case-insensitive, trimmed)", () => {
    expect(parseTruncate("cascade")).toBe("cascade");
    expect(parseTruncate("RESTRICT")).toBe("restrict");
    expect(parseTruncate("  cascade  ")).toBe("cascade");
  });

  test.each(["none", "false", "off"])("maps %p to false (append mode)", (value) => {
    expect(parseTruncate(value)).toBe(false);
  });

  test("treats cac --no-truncate (boolean false) as append", () => {
    expect(parseTruncate(false)).toBe(false);
  });

  test.each(["yes", "all", "1"])("rejects unknown mode %p with a pointed SaatError", (value) => {
    expect(() => parseTruncate(value)).toThrow(SaatError);
    expect(() => parseTruncate(value)).toThrow(/--truncate must be one of/);
  });
});
