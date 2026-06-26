import { afterEach, describe, expect, test } from "bun:test";
import { DEFAULT_CLOCK_BASE, now, setActiveClock } from "../../src/clock.js";

describe("now() deterministic clock", () => {
  afterEach(() => setActiveClock(null));

  test("falls back to the wall clock outside a run", () => {
    setActiveClock(null);
    const before = Date.now();
    const t = now().getTime();
    const after = Date.now();
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });

  test("returns the fixed base time during a run", () => {
    const base = Date.UTC(2030, 5, 15);
    setActiveClock(base);
    expect(now().getTime()).toBe(base);
    // Stable across calls (no hidden monotonic drift).
    expect(now().getTime()).toBe(base);
  });

  test("applies a millisecond offset for ordered timestamps", () => {
    const base = Date.UTC(2030, 0, 1);
    setActiveClock(base);
    expect(now(0).getTime()).toBe(base);
    expect(now(1000).getTime()).toBe(base + 1000);
    expect(now(5 * 86_400_000).getTime()).toBe(base + 5 * 86_400_000);
  });

  test("default base is 2024-01-01T00:00:00.000Z", () => {
    expect(new Date(DEFAULT_CLOCK_BASE).toISOString()).toBe("2024-01-01T00:00:00.000Z");
  });
});
