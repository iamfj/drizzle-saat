import { describe, expect, test } from "bun:test";
import { createRng, sfc32 } from "../../src/rng/index.js";

describe("sfc32", () => {
  test("is deterministic for the same lanes", () => {
    const a = sfc32(1, 2, 3, 4);
    const b = sfc32(1, 2, 3, 4);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  test("produces floats in [0, 1)", () => {
    const r = sfc32(9, 8, 7, 6);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test("diverges for different lanes", () => {
    const a = sfc32(1, 2, 3, 4)();
    const b = sfc32(4, 3, 2, 1)();
    expect(a).not.toBe(b);
  });

  // Golden values: a change here re-keys every existing dataset. If the PRNG is
  // intentionally changed, update these — but treat that as a breaking change.
  test("emits stable golden values for fixed lanes", () => {
    const r = sfc32(1, 2, 3, 4);
    expect([r(), r(), r()]).toEqual([
      1.6298145055770874e-9, 7.916241884231567e-9, 0.01318361610174179,
    ]);
  });
});

describe("createRng", () => {
  test("same seed → identical number/int/pick sequences", () => {
    const r1 = createRng(42);
    const r2 = createRng(42);
    expect(Array.from({ length: 10 }, () => r1.next())).toEqual(
      Array.from({ length: 10 }, () => r2.next()),
    );
    expect(Array.from({ length: 10 }, () => r1.int(0, 100))).toEqual(
      Array.from({ length: 10 }, () => r2.int(0, 100)),
    );
    const items = ["a", "b", "c", "d", "e"];
    expect(Array.from({ length: 10 }, () => r1.pick(items))).toEqual(
      Array.from({ length: 10 }, () => r2.pick(items)),
    );
  });

  test("different seeds → different sequences", () => {
    const r1 = createRng(1);
    const r2 = createRng(2);
    expect(r1.next()).not.toBe(r2.next());
  });

  // Cross-version determinism pin: these concrete values must not drift, or
  // existing seeds would produce different data after an upgrade.
  test("emits stable golden values for a fixed seed", () => {
    const r = createRng(42);
    expect([r.next(), r.next(), r.next()]).toEqual([
      0.8686135609168559, 0.41595513583160937, 0.33768315333873034,
    ]);
    const r2 = createRng(42);
    expect([0, 0, 0, 0, 0].map(() => r2.int(0, 100))).toEqual([87, 42, 34, 51, 89]);
    expect(createRng(7).faker.person.firstName()).toBe("Arden");
  });

  test("same seed → identical faker output", () => {
    const r1 = createRng(7);
    const r2 = createRng(7);
    expect(r1.faker.person.firstName()).toBe(r2.faker.person.firstName());
    expect(r1.faker.internet.email()).toBe(r2.faker.internet.email());
  });

  test("int respects inclusive bounds", () => {
    const r = createRng(123);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(5, 8);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(8);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test("pick throws on empty input", () => {
    const r = createRng(1);
    expect(() => r.pick([])).toThrow();
  });
});
