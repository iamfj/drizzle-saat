import type { Table } from "drizzle-orm";
import { setActiveClock } from "../clock.js";
import { createLoader, resolveConfig } from "../config/load.js";
import type { TruncateMode } from "../config/types.js";
import { createAdapter } from "../dialects/index.js";
import { loadFixtures } from "../fixtures/load.js";
import { createRng } from "../rng/index.js";
import { loadSchema } from "../schema/introspect.js";
import type { Row, SchemaEntry } from "../types.js";
import { InsertError } from "../util/errors.js";
import { type PlannedSeed, buildPlan } from "./plan.js";
import { ResolvedStore } from "./resolve.js";

export interface SeedOptions {
  cwd?: string;
  /** Explicit drizzle-saat config path (CLI `--config`). */
  configPath?: string;
  /** Run only the named scenario (plus scenario-less seeds). */
  scenario?: string;
  /** Override the RNG seed for this run. */
  seed?: number;
  /** Resolve and order everything but write nothing. */
  dryRun?: boolean;
  /** Override the configured wipe strategy for this run. See {@link TruncateMode}. */
  truncate?: TruncateMode;
  /**
   * Override/augment the connection credentials resolved from drizzle.config.
   * Notably accepts a pre-built Drizzle instance as `{ db }` or a driver client
   * as `{ client }`, so callers (and tests) can seed an in-process database.
   */
  dbCredentials?: Record<string, any>;
}

export interface SeedReport {
  inserted: { namespace: string; table: string; count: number }[];
  total: number;
  seed: number;
  dryRun: boolean;
  /** SQL names of the tables that were (or, in dry-run, would be) wiped. */
  truncated: string[];
  durationMs: number;
}

/** Deduplicate planned tables, keeping the given order (used for truncation). */
function uniqueTables(seeds: PlannedSeed[]): SchemaEntry[] {
  const seen = new Set<Table>();
  const out: SchemaEntry[] = [];
  for (const s of seeds) {
    if (!seen.has(s.table)) {
      seen.add(s.table);
      out.push(s.info);
    }
  }
  return out;
}

/**
 * Run the seeder end-to-end: resolve config, load schema + fixtures, plan and
 * order, then (unless `dryRun`) wipe and reseed inside a single transaction.
 */
export async function seed(opts: SeedOptions = {}): Promise<SeedReport> {
  const start = Date.now();
  const config = await resolveConfig({ cwd: opts.cwd, configPath: opts.configPath });
  const jiti = createLoader();
  const effectiveSeed = opts.seed ?? config.seed;
  const rng = createRng(effectiveSeed, config.locale);

  // Fix the deterministic clock across fixture loading *and* row generation, so
  // `now()` is stable whether it's called in a keyed `rows` literal (evaluated
  // at fixture import) or a lazy `data()` factory (evaluated during planning).
  setActiveClock(config.clockBase);
  let plan: Plan;
  try {
    const schema = await loadSchema(config.schemaPaths, config.dialect, jiti);
    const fixtures = await loadFixtures(config.fixturesDir, jiti);
    plan = buildPlan(fixtures, schema, rng, { scenario: opts.scenario });
  } finally {
    setActiveClock(null);
  }

  const inserted = plan.seeds.map((s) => ({
    namespace: s.namespace,
    table: s.info.name,
    count: s.rows.length,
  }));
  const total = inserted.reduce((n, s) => n + s.count, 0);

  const truncateMode = opts.truncate ?? config.truncate;
  // Wipe dependents first.
  const truncateTargets = uniqueTables([...plan.seeds].reverse());
  const truncated = truncateMode === false ? [] : truncateTargets.map((t) => t.name);

  if (opts.dryRun) {
    simulate(plan, rng);
    return {
      inserted,
      total,
      seed: effectiveSeed,
      dryRun: true,
      truncated,
      durationMs: Date.now() - start,
    };
  }

  const dbCredentials = { ...config.dbCredentials, ...opts.dbCredentials };
  const handle = await createAdapter(config.dialect, dbCredentials);
  const { adapter } = handle;
  try {
    await adapter.transaction(handle.db, async (tx) => {
      if (truncateMode !== false) {
        await adapter.truncate(tx, truncateTargets, truncateMode);
      }

      const store = new ResolvedStore();
      for (const planned of plan.seeds) {
        store.init(planned.namespace, planned.info.primaryKeys);

        const resolved = planned.rows.map((r) => store.resolveRow(r.data, rng));
        const columnCount = planned.info.columns.length;
        const chunkSize = clampChunk(
          config.chunkSize ?? adapter.chunkSize,
          columnCount,
          handle.chunkLimitFor,
        );

        let cursor = 0;
        for (let i = 0; i < resolved.length; i += chunkSize) {
          const chunk = resolved.slice(i, i + chunkSize);
          let pkRows: Row[];
          try {
            pkRows = await adapter.insert(tx, planned.info, chunk);
          } catch (err) {
            // Attribute raw driver errors back to the fixture: which namespace,
            // table, and (keyed) rows were in the failing batch.
            throw new InsertError(
              planned.namespace,
              planned.info.name,
              planned.rows.slice(i, i + chunk.length).map((r) => r.key),
              err as Error,
            );
          }
          for (let j = 0; j < chunk.length; j++) {
            store.record(
              planned.namespace,
              { key: planned.rows[cursor]!.key, data: chunk[j]! },
              pkRows[j] ?? {},
            );
            cursor++;
          }
        }
      }
    });
  } catch (err) {
    // Tear down, but never let a dispose failure bury the real seeding error.
    await handle.dispose().catch(() => {});
    throw err;
  }
  // Success path: let a dispose failure surface (nothing to mask).
  await handle.dispose();

  return {
    inserted,
    total,
    seed: effectiveSeed,
    dryRun: false,
    truncated,
    durationMs: Date.now() - start,
  };
}

function clampChunk(
  base: number,
  columnCount: number,
  limitFor?: (columnCount: number) => number,
): number {
  if (!limitFor) return base;
  return Math.max(1, Math.min(base, limitFor(columnCount)));
}

/**
 * Validate references without a database by assigning synthetic sequential ids
 * per namespace, so `dry-run` reports counts and surfaces broken refs/cycles.
 */
function simulate(plan: Plan, rng: ReturnType<typeof createRng>): void {
  const store = new ResolvedStore();
  for (const planned of plan.seeds) {
    store.init(planned.namespace, planned.info.primaryKeys);
    const pk = planned.info.primaryKeys.length === 1 ? planned.info.primaryKeys[0]! : undefined;
    // Resolve every row up front (mirroring the real seed path) before
    // recording, so dry-run consumes the RNG and sees candidate rows
    // identically to a real run.
    const resolved = planned.rows.map((r) => store.resolveRow(r.data, rng));
    let counter = 1;
    for (let i = 0; i < resolved.length; i++) {
      const data = resolved[i]!;
      const syntheticId = pk !== undefined && data[pk] !== undefined ? data[pk] : counter++;
      const pkRow: Row = pk !== undefined ? { [pk]: syntheticId } : {};
      store.record(planned.namespace, { key: planned.rows[i]!.key, data }, pkRow);
    }
  }
}

type Plan = ReturnType<typeof buildPlan>;
