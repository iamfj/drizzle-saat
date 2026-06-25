import type { Dialect, DialectAdapter } from "../types.js";
import { createMysqlAdapter } from "./mysql.js";
import { createPostgresAdapter } from "./postgres.js";
import { createSqliteAdapter } from "./sqlite.js";

/** A live adapter plus its Drizzle db handle and a disposer. */
export interface AdapterHandle {
  adapter: DialectAdapter;
  /** The Drizzle database instance, passed to `adapter.transaction`. */
  db: any;
  /** Close the underlying connection/pool. */
  dispose: () => Promise<unknown>;
  /**
   * Optional per-dialect dynamic chunk cap based on a table's column count
   * (MySQL clamps to its 65,535 bound-parameter limit).
   */
  chunkLimitFor?: (columnCount: number) => number;
}

/**
 * Construct the adapter for a dialect, dynamically importing only that
 * dialect's driver so users install just the one they use.
 */
export function createAdapter(
  dialect: Dialect,
  dbCredentials: Record<string, any>,
): Promise<AdapterHandle> {
  switch (dialect) {
    case "postgresql":
      return createPostgresAdapter(dbCredentials);
    case "mysql":
      return createMysqlAdapter(dbCredentials);
    case "sqlite":
      return createSqliteAdapter(dbCredentials);
  }
}
