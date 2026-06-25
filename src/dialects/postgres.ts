import { sql } from "drizzle-orm";
import type { DialectAdapter, Row, TableInfo } from "../types.js";
import { dynamicImport } from "../util/dynamic-import.js";
import { SaatError } from "../util/errors.js";
import type { AdapterHandle } from "./index.js";
import { CHUNK_SIZES, PARAM_LIMITS, paramChunkLimit, pkProjection } from "./shared.js";

function quoted(info: TableInfo): string {
  return info.schema ? `"${info.schema}"."${info.name}"` : `"${info.name}"`;
}

const baseAdapter: Pick<DialectAdapter, "dialect" | "chunkSize" | "transaction"> = {
  dialect: "postgresql",
  chunkSize: CHUNK_SIZES.postgres,
  transaction(db: any, fn: (tx: any) => Promise<any>) {
    return db.transaction(fn);
  },
};

const adapter: DialectAdapter = {
  ...baseAdapter,
  async truncate(tx: any, tables: TableInfo[], mode: "cascade" | "restrict"): Promise<void> {
    if (tables.length === 0) return;
    const names = tables.map(quoted).join(", ");
    const clause = mode === "cascade" ? "CASCADE" : "RESTRICT";
    await tx.execute(sql.raw(`TRUNCATE TABLE ${names} RESTART IDENTITY ${clause}`));
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
 * Postgres adapter. Uses `pg` (node-postgres) by default; switches to PGlite
 * when `dbCredentials.driver === 'pglite'` or a pre-built `client` is supplied
 * (used by the in-process test suite).
 */
export async function createPostgresAdapter(
  dbCredentials: Record<string, any>,
): Promise<AdapterHandle> {
  // A caller-provided Drizzle instance bypasses driver loading entirely.
  if (dbCredentials.db) {
    return {
      adapter,
      db: dbCredentials.db,
      dispose: async () => {},
      chunkLimitFor: pgChunkLimitFor,
    };
  }

  const usePglite = dbCredentials.driver === "pglite" || dbCredentials.client !== undefined;

  if (usePglite) {
    const { drizzle } = await importOrThrow(
      () => import("drizzle-orm/pglite"),
      "drizzle-orm/pglite",
    );
    let client = dbCredentials.client;
    let owns = false;
    if (!client) {
      const { PGlite } = await importOrThrow(
        () => import("@electric-sql/pglite"),
        "@electric-sql/pglite",
      );
      client = new PGlite(dbCredentials.url);
      owns = true;
    }
    const db = drizzle(client);
    return {
      adapter,
      db,
      dispose: async () => owns && (await client.close?.()),
      chunkLimitFor: pgChunkLimitFor,
    };
  }

  const { drizzle } = await importOrThrow(
    () => import("drizzle-orm/node-postgres"),
    "drizzle-orm/node-postgres",
  );
  const pg = await importOrThrow(() => dynamicImport("pg"), "pg");
  const Pool = (pg as any).default?.Pool ?? (pg as any).Pool;
  if (!Pool) throw new SaatError("could not load a Postgres Pool from `pg`.");
  const pool = new Pool(
    dbCredentials.url ? { connectionString: dbCredentials.url } : dbCredentials,
  );
  const db = drizzle(pool);
  return { adapter, db, dispose: async () => await pool.end(), chunkLimitFor: pgChunkLimitFor };
}

/** Keep a batch under Postgres' bind-parameter ceiling (Int16 → 65535). */
function pgChunkLimitFor(columnCount: number): number {
  return paramChunkLimit(PARAM_LIMITS.postgres, columnCount);
}

async function importOrThrow<T>(fn: () => Promise<T>, pkg: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw new SaatError(
      `failed to load "${pkg}". Install the Postgres driver: \`bun add -D pg\` ` +
        `(or \`@electric-sql/pglite\`). Original error: ${(err as Error).message}`,
    );
  }
}
