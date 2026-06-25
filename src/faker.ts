import { Faker, type Faker as FakerType, base, en } from "@faker-js/faker";

/**
 * Public `faker` helper. Re-exported from `saat` so fixtures can write
 * `faker.person.firstName()` directly. It is a live proxy that forwards to the
 * Faker instance owned by the active seeding run, so faker output is
 * deterministic under the run's seed. Outside a run it falls back to an
 * unseeded default instance.
 *
 * The active instance is held on a process-global slot (keyed by a shared
 * Symbol) rather than module-local state. This is essential: the build emits
 * separate `cli` and `index` bundles, each with its own copy of this module.
 * The engine (cli bundle) calls `setActiveFaker`, while fixtures `import
 * { faker } from "saat"` resolve to the index bundle's copy — a module-local
 * `active` would never reach them and faker output would silently de-seed.
 * Mirrors the `Symbol.for("saat.ref")` marker used for references.
 */

const ACTIVE_FAKER = Symbol.for("saat.activeFaker");
const fallback = new Faker({ locale: [en, base] });

interface FakerGlobal {
  [ACTIVE_FAKER]?: FakerType | null;
}

/** Engine hook: point the public `faker` at the current run's seeded instance. */
export function setActiveFaker(instance: FakerType | null): void {
  (globalThis as FakerGlobal)[ACTIVE_FAKER] = instance;
}

export const faker: FakerType = new Proxy(fallback, {
  get(_target, prop) {
    const instance = (globalThis as FakerGlobal)[ACTIVE_FAKER] ?? fallback;
    // Bind `this` to the real instance, not the proxy, so faker getters work.
    return Reflect.get(instance, prop, instance);
  },
}) as FakerType;
