/**
 * Public, deterministic `now()` helper. Re-exported from `drizzle-saat` so
 * fixtures can write `now()` instead of `new Date()` and stay seed-reproducible.
 *
 * Drizzle applies app-level column defaults (`$defaultFn`, `$onUpdate`, …) on
 * insert — including time-based ones like `() => new Date()` — but wall-clock
 * time makes a run non-reproducible. `now()` returns a fixed base time for the
 * duration of a seeding run (configurable via `now` in drizzle-saat.config), so
 * timestamps are stable across runs and machines. Pass an offset (ms) for
 * ordered timestamps, e.g. `now(index * 1000)`.
 *
 * Like the `faker` proxy, the active base time lives on a process-global slot
 * (keyed by a shared Symbol) rather than module-local state, because the build
 * emits separate `cli` and `index` bundles each with their own copy of this
 * module. Outside a run, `now()` falls back to the real wall clock.
 */

const ACTIVE_CLOCK = Symbol.for("drizzle-saat.activeClock");

/** Default base time when `now` is unset: 2024-01-01T00:00:00.000Z. */
export const DEFAULT_CLOCK_BASE = Date.UTC(2024, 0, 1);

interface ClockGlobal {
  [ACTIVE_CLOCK]?: number | null;
}

/** Engine hook: fix `now()` at `baseMs` for the current run (null to clear). */
export function setActiveClock(baseMs: number | null): void {
  (globalThis as ClockGlobal)[ACTIVE_CLOCK] = baseMs;
}

/**
 * The run's deterministic clock. Returns the configured base time (plus an
 * optional millisecond offset) during a seeding run, or the real wall clock
 * outside one.
 */
export function now(offsetMs = 0): Date {
  const base = (globalThis as ClockGlobal)[ACTIVE_CLOCK];
  return new Date((base ?? Date.now()) + offsetMs);
}
