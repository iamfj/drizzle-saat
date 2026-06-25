import type { Row, TableInfo } from "../types.js";

/**
 * Bound-parameter ceilings per dialect. A batched multi-row INSERT binds one
 * placeholder per (row × column), so the batch size must stay under these so a
 * wide table doesn't blow the driver's parameter limit.
 */
export const PARAM_LIMITS = {
  /** Postgres/MySQL bind parameters are addressed by an Int16 → 65535 max. */
  postgres: 65535,
  mysql: 65535,
  /** SQLite's SQLITE_MAX_VARIABLE_NUMBER is 32766; leave a small margin. */
  sqlite: 32000,
} as const;

/** Default rows-per-INSERT batch per dialect (overridable via config). */
export const CHUNK_SIZES = {
  postgres: 1000,
  mysql: 1000,
  sqlite: 500,
} as const;

/**
 * Largest row batch that keeps `columnCount` placeholders per row under
 * `paramLimit`. Always ≥ 1 so a single (even very wide) row still inserts.
 */
export function paramChunkLimit(paramLimit: number, columnCount: number): number {
  return Math.max(1, Math.floor(paramLimit / Math.max(1, columnCount)));
}

/**
 * Build a Drizzle `.returning()` projection of just the primary-key columns,
 * mapping each PK property key to its column on the table. Empty when the table
 * has no primary key.
 */
export function pkProjection(info: TableInfo): Record<string, unknown> {
  const proj: Record<string, unknown> = {};
  for (const pk of info.primaryKeys) {
    proj[pk] = (info.table as any)[pk];
  }
  return proj;
}

/** Echo back each row's primary-key values (used when ids are client-supplied). */
export function echoPkValues(info: TableInfo, rows: Row[]): Row[] {
  return rows.map((row) => {
    const out: Row = {};
    for (const key of info.primaryKeys) out[key] = row[key];
    return out;
  });
}
