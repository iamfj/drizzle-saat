import type { Table } from "drizzle-orm";
import { setActiveFaker } from "../faker.js";
import type { LoadedFixture } from "../fixtures/load.js";
import { type Edge, topoSort } from "../graph/toposort.js";
import { collectRefs } from "../refs/ref.js";
import type { Rng } from "../rng/index.js";
import type { Row, SchemaEntry } from "../types.js";
import { SaatError } from "../util/errors.js";

/** A single generated row, possibly still containing unresolved refs. */
export interface GeneratedRow {
  /** Stable key for `ref(ns, key)` lookups (keyed rows only). */
  key?: string;
  data: Row;
}

/** A namespace's seed, with its rows generated and table introspected. */
export interface PlannedSeed {
  namespace: string;
  table: Table;
  info: SchemaEntry;
  rows: GeneratedRow[];
  /** File the seed came from (for diagnostics). */
  file: string;
}

export interface Plan {
  /** Seeds in dependency order (parents before dependents). */
  seeds: PlannedSeed[];
}

export interface BuildPlanOptions {
  scenario?: string;
  /** Resolved `setup()` value per fixture file, passed to each `data()`. */
  setupResults?: Map<string, unknown>;
  /**
   * When true, drop foreign-key-driven ordering edges: FK enforcement is
   * deferred at insert time, so parents need not precede dependents. Reference
   * edges are still honored (ref values resolve to ids in order).
   */
  deferConstraints?: boolean;
}

/**
 * Turn loaded fixtures into an ordered, row-generated {@link Plan}. Filters by
 * scenario, enforces unique namespaces, generates rows (seeding faker), then
 * topologically orders namespaces by reference and foreign-key dependencies.
 */
export function buildPlan(
  fixtures: LoadedFixture[],
  schema: Map<Table, SchemaEntry>,
  rng: Rng,
  opts: BuildPlanOptions = {},
): Plan {
  // 1. Flatten + scenario filter. Bare run keeps scenario-less seeds; a named
  //    scenario additionally pulls in seeds tagged with that scenario.
  const included: {
    namespace: string;
    seed: LoadedFixture["fixture"]["seeds"][number];
    file: string;
  }[] = [];
  for (const { file, fixture } of fixtures) {
    for (const seed of fixture.seeds) {
      const scenario = seed.scenario ?? fixture.scenario;
      const keep = scenario === undefined || scenario === opts.scenario;
      if (keep) included.push({ namespace: seed.namespace, seed, file });
    }
  }

  // 2. Unique namespaces.
  const byNamespace = new Map<string, { file: string }>();
  for (const { namespace, file } of included) {
    const existing = byNamespace.get(namespace);
    if (existing) {
      throw new SaatError(
        `duplicate namespace "${namespace}" defined in ${existing.file} and ${file}. ` +
          "Namespaces are global and must be unique.",
      );
    }
    byNamespace.set(namespace, { file });
  }

  // 3. Generate rows (with faker seeded for the duration).
  const plannedByNamespace = new Map<string, PlannedSeed>();
  setActiveFaker(rng.faker);
  try {
    for (const { namespace, seed, file } of included) {
      const info = schema.get(seed.table as Table);
      if (!info) {
        throw new SaatError(
          `namespace "${namespace}" (${file}) binds a table that is not exported from your ` +
            "drizzle schema. drizzle-saat can only seed tables it can introspect.",
        );
      }

      const rows: GeneratedRow[] = [];
      if (seed.rows) {
        for (const [key, input] of Object.entries(seed.rows)) {
          rows.push({ key, data: { ...(input as Row) } });
        }
      }
      if (seed.count !== undefined) {
        if (typeof seed.data !== "function") {
          throw new SaatError(
            `namespace "${namespace}" (${file}) sets \`count\` but no \`data()\` factory.`,
          );
        }
        const setup = opts.setupResults?.get(file);
        for (let index = 0; index < seed.count; index++) {
          rows.push({ data: { ...(seed.data({ index, setup }) as Row) } });
        }
      }
      // Neither style provided is a mistake; an explicit `count: 0` (or empty
      // `rows`) is a valid no-op that still introspects/truncates the table.
      if (seed.count === undefined && seed.rows === undefined) {
        throw new SaatError(
          `namespace "${namespace}" (${file}) has neither \`rows\` nor \`count\`+\`data()\`. ` +
            "Provide one of them.",
        );
      }

      plannedByNamespace.set(namespace, {
        namespace,
        table: seed.table as Table,
        info,
        rows,
        file,
      });
    }
  } finally {
    setActiveFaker(null);
  }

  // 4. Dependency edges from refs + foreign keys, mapped to included namespaces.
  const namespacesByTableName = new Map<string, string[]>();
  for (const planned of plannedByNamespace.values()) {
    const list = namespacesByTableName.get(planned.info.name) ?? [];
    list.push(planned.namespace);
    namespacesByTableName.set(planned.info.name, list);
  }

  const edges: Edge[] = [];
  for (const planned of plannedByNamespace.values()) {
    // Reference-driven edges (validated at plan time so broken refs fail fast,
    // with file context, instead of surfacing mid-transaction).
    for (const row of planned.rows) {
      for (const targetRef of collectRefs(row.data)) {
        const targetNs = targetRef.namespace;
        const target = plannedByNamespace.get(targetNs);
        if (!target) {
          throw new SaatError(
            `namespace "${planned.namespace}" references unknown namespace "${targetNs}". ` +
              "Did you forget to include its fixture (or filter it out by scenario)?",
          );
        }
        // A namespace's rows are all resolved before any are inserted, so a row
        // cannot reference another row in its own namespace.
        if (targetNs === planned.namespace) {
          throw new SaatError(
            `namespace "${planned.namespace}" (${planned.file}) references its own namespace. ` +
              "All rows in a namespace are resolved before any are inserted, so a row cannot " +
              "reference another row in the same namespace. Split them into two namespaces on " +
              "the same table and reference across them.",
          );
        }
        // References resolve to a single primary-key value, so the target must
        // have exactly one PK column.
        if (target.info.primaryKeys.length !== 1) {
          const why =
            target.info.primaryKeys.length === 0 ? "no primary key" : "a composite primary key";
          throw new SaatError(
            `namespace "${planned.namespace}" (${planned.file}) references "${targetNs}", but ` +
              `"${targetNs}" has ${why} and cannot be the target of a reference. Reference a ` +
              "namespace whose table has a single-column primary key.",
          );
        }
        edges.push([planned.namespace, targetNs]);
      }
    }
    // Foreign-key-driven edges (ensure parents insert first even without a ref).
    // Skipped entirely when constraints are deferred — order no longer matters
    // for FKs, and emitting these edges would falsely reject benign FK cycles.
    if (opts.deferConstraints) continue;
    for (const fk of planned.info.foreignKeys) {
      // Skip self-referential FKs: a table that points at itself imposes no
      // ordering *between distinct namespaces* on that table — only an explicit
      // ref() knows the real direction. Emitting table-identity edges here would
      // wrongly connect sibling namespaces in both directions (a false cycle).
      if (fk.foreignTableName === planned.info.name) continue;
      for (const ns of namespacesByTableName.get(fk.foreignTableName) ?? []) {
        if (ns !== planned.namespace) edges.push([planned.namespace, ns]);
      }
    }
  }

  // 5. Topologically order (preserving insertion order of `included` for ties).
  const order = topoSort([...plannedByNamespace.keys()], edges);
  return { seeds: order.map((ns) => plannedByNamespace.get(ns)!) };
}
