import { sql } from "drizzle-orm";
import type { DialectAdapter, Row, TableInfo } from "../types.js";
import { SaatError } from "../util/errors.js";
import type { AdapterHandle } from "./index.js";
import { CHUNK_SIZES, PARAM_LIMITS, paramChunkLimit, pkProjection } from "./shared.js";

const adapter: DialectAdapter = {
  dialect: "sqlite",
  chunkSize: CHUNK_SIZES.sqlite,
  /**
   * better-sqlite3 is synchronous; its native `transaction()` commits as soon
   * as the (async) callback returns its promise, which would break atomicity.
   * We instead drive BEGIN/COMMIT/ROLLBACK manually on the single connection —
   * every drizzle sqlite statement resolves synchronously, so ordering holds.
   */
  async transaction(db: any, fn: (tx: any) => Promise<any>): Promise<any> {
    await db.run(sql.raw("BEGIN"));
    try {
      const result = await fn(db);
      await db.run(sql.raw("COMMIT"));
      return result;
    } catch (err) {
      await db.run(sql.raw("ROLLBACK"));
      throw err;
    }
  },
  async truncate(tx: any, tables: TableInfo[]): Promise<void> {
    if (tables.length === 0) return;
    // Defer FK checks until COMMIT so we can wipe parents and children freely.
    await tx.run(sql.raw("PRAGMA defer_foreign_keys = ON"));
    const hasSeq =
      (
        (await tx.all(
          sql.raw("SELECT name FROM sqlite_master WHERE type='table' AND name='sqlite_sequence'"),
        )) as unknown[]
      ).length > 0;
    for (const info of tables) {
      await tx.run(sql.raw(`DELETE FROM "${info.name}"`));
      if (hasSeq) {
        // Parameterize the name so table names with quotes can't break/inject.
        await tx.run(sql`DELETE FROM sqlite_sequence WHERE name = ${info.name}`);
      }
    }
    // No explicit reset needed: `defer_foreign_keys` is automatically cleared
    // when the surrounding transaction COMMITs, restoring immediate FK checks.
  },
  async insert(tx: any, info: TableInfo, rows: Row[]): Promise<Row[]> {
    if (rows.length === 0) return [];
    const proj = pkProjection(info);
    if (Object.keys(proj).length === 0) {
      await tx.insert(info.table).values(rows);
      return rows.map(() => ({}));
    }
    return (await tx.insert(info.table).values(rows).returning(proj)) as Row[];
  },
};

/**
 * SQLite adapter via `better-sqlite3`. Accepts a file path, `:memory:`, a
 * pre-built driver `client`, or an already-constructed Drizzle instance as
 * `db` (used to seed an in-process database — e.g. `bun:sqlite` or `libsql`).
 */
export async function createSqliteAdapter(
  dbCredentials: Record<string, any>,
): Promise<AdapterHandle> {
  // A caller-provided Drizzle instance bypasses driver loading entirely.
  if (dbCredentials.db) {
    return {
      adapter,
      db: dbCredentials.db,
      dispose: async () => {},
      chunkLimitFor,
    };
  }

  let drizzle: any;
  let Database: any;
  try {
    ({ drizzle } = await import("drizzle-orm/better-sqlite3"));
  } catch (err) {
    throw new SaatError(
      `failed to load "drizzle-orm/better-sqlite3". Install the driver: \`bun add -D better-sqlite3\`. ` +
        `Original error: ${(err as Error).message}`,
    );
  }

  let client = dbCredentials.client;
  let owns = false;
  if (!client) {
    try {
      Database = (await import("better-sqlite3")).default;
    } catch (err) {
      throw new SaatError(
        `failed to load "better-sqlite3". Install it: \`bun add -D better-sqlite3\`. ` +
          `Original error: ${(err as Error).message}`,
      );
    }
    const url: string = dbCredentials.url ?? ":memory:";
    const path = url.startsWith("file:") ? url.slice("file:".length) : url;
    client = new Database(path);
    owns = true;
  }
  const db = drizzle(client);
  return {
    adapter,
    db,
    dispose: async () => owns && client.close(),
    chunkLimitFor,
  };
}

/** Keep a batch under SQLite's bound-variable ceiling. */
function chunkLimitFor(columnCount: number): number {
  return paramChunkLimit(PARAM_LIMITS.sqlite, columnCount);
}
