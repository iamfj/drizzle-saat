import { Faker, type LocaleDefinition, base, en } from "@faker-js/faker";

/**
 * Deterministic seeding infrastructure. A single numeric seed drives both the
 * Faker instance (column data) and an independent `sfc32` PRNG used for random
 * reference picks, so the same seed always produces the same dataset.
 */

/** Tiny, fast, seedable PRNG (sfc32). Returns floats in [0, 1). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** Hash a numeric seed into four 32-bit lanes for sfc32 initialization. */
function seedLanes(seed: number): [number, number, number, number] {
  // splitmix32-style expansion so adjacent seeds diverge immediately.
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) | 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
  return [next(), next(), next(), next()];
}

export interface Rng {
  /** The numeric seed this Rng was created from. */
  readonly seed: number;
  /** Shared, deterministically-seeded Faker instance. */
  readonly faker: Faker;
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick a random element; throws on empty input. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number, locale?: LocaleDefinition | LocaleDefinition[]): Rng {
  const [a, b, c, d] = seedLanes(seed);
  const rand = sfc32(a, b, c, d);

  // A single locale gets en/base as sensible fallbacks; an explicit array is
  // used as-is so callers control the whole chain.
  const localeChain = locale ? (Array.isArray(locale) ? locale : [locale, en, base]) : [en, base];
  const faker = new Faker({ locale: localeChain });
  faker.seed(seed);

  return {
    seed,
    faker,
    next: rand,
    int(min, max) {
      return Math.floor(rand() * (max - min + 1)) + min;
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("drizzle-saat: cannot pick from an empty set");
      }
      return items[Math.floor(rand() * items.length)] as (typeof items)[number];
    },
  };
}
