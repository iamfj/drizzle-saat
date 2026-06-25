import { sql } from "drizzle-orm";
import type { DialectAdapter, Row, TableInfo } from "../types.js";
import { dynamicImport } from "../util/dynamic-import.js";
import { SaatError } from "../util/errors.js";
import type { AdapterHandle } from "./index.js";
import { CHUNK_SIZES, PARAM_LIMITS, echoPkValues, paramChunkLimit } from "./shared.js";

/** Single auto-increment primary key, if the table has exactly one such PK. */
function autoIncPk(info: TableInfo): string | undefined {
  if (info.primaryKeys.length !== 1) return undefined;
  const pk = info.primaryKeys[0]!;
  const col = info.columns.find((c) => c.propertyKey === pk);
  return col?.autoIncrement ? pk : undefined;
}

function makeAdapter(chunkSize: number): DialectAdapter {
  return {
    dialect: "mysql",
    chunkSize,
    transaction(db: any, fn: (tx: any) => Promise<any>) {
      return db.transaction(fn);
    },
    async truncate(tx: any, tables: TableInfo[], mode: "cascade" | "restrict"): Promise<void> {
      if (tables.length === 0) return;
      // Wipe with DELETE (DML), not TRUNCATE (DDL): TRUNCATE forces an implicit
      // COMMIT in MySQL, which would silently end the surrounding transaction
      // and void drizzle-saat's all-or-nothing guarantee. DELETE stays transactional, so
      // a later insert failure still rolls the wipe back. Trade-off: DELETE does
      // not reset AUTO_INCREMENT (acceptable for throwaway dev/test data).
      //
      // `restrict` keeps FK checks on and deletes dependent-first (tables arrive
      // in that order), so an unfixtured table still referencing one errors.
      // `cascade` drops FK checks for the wipe so any reference order succeeds.
      if (mode === "restrict") {
        for (const info of tables) {
          await tx.execute(sql.raw(`DELETE FROM \`${info.name}\``));
        }
        return;
      }
      await tx.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 0"));
      try {
        for (const info of tables) {
          await tx.execute(sql.raw(`DELETE FROM \`${info.name}\``));
        }
      } finally {
        // Always re-enable, even if a DELETE throws: FOREIGN_KEY_CHECKS is a
        // session variable and would otherwise leak off on the connection.
        await tx.execute(sql.raw("SET FOREIGN_KEY_CHECKS = 1"));
      }
    },
    async insert(tx: any, info: TableInfo, rows: Row[]): Promise<Row[]> {
      if (rows.length === 0) return [];
      const pk = autoIncPk(info);
      if (pk) {
        const supplied = rows.filter((r) => r[pk] !== undefined).length;
        if (supplied > 0 && supplied < rows.length) {
          throw new SaatError(
            `namespace for table "${info.name}" mixes client-supplied and auto-generated ` +
              `primary keys in one seed. MySQL cannot return ids for a mixed batch — ` +
              "provide the primary key for all rows or none.",
          );
        }
      }
      // Auto-increment PK not supplied by the user → ask MySQL for the ids.
      if (pk && rows.every((r) => r[pk] === undefined)) {
        const ids = (await tx.insert(info.table).values(rows).$returningId()) as Row[];
        if (ids.length !== rows.length) {
          throw new SaatError(
            `MySQL returned ${ids.length} ids for ${rows.length} inserted rows in table ` +
              `"${info.name}". Cannot reliably map generated ids back to rows — this usually ` +
              "means a duplicate/ignored insert. Provide explicit primary keys for this seed.",
          );
        }
        // $returningId keys by the first column; normalize to the PK property.
        return ids.map((idRow) => {
          const value = pk in idRow ? idRow[pk] : Object.values(idRow)[0];
          return { [pk]: value };
        });
      }
      // PK is client-supplied (or composite): insert and echo PK values back.
      await tx.insert(info.table).values(rows);
      return echoPkValues(info, rows);
    },
  };
}

/** MySQL adapter via `mysql2`. */
export async function createMysqlAdapter(
  dbCredentials: Record<string, any>,
): Promise<AdapterHandle> {
  const chunkLimitFor = (columnCount: number) => paramChunkLimit(PARAM_LIMITS.mysql, columnCount);

  // A caller-provided Drizzle instance bypasses driver loading entirely.
  if (dbCredentials.db) {
    return {
      adapter: makeAdapter(CHUNK_SIZES.mysql),
      db: dbCredentials.db,
      dispose: async () => {},
      chunkLimitFor,
    };
  }

  let drizzle: any;
  let mysql: any;
  try {
    ({ drizzle } = await import("drizzle-orm/mysql2"));
    mysql = await dynamicImport("mysql2/promise");
  } catch (err) {
    throw new SaatError(
      `failed to load the MySQL driver. Install it: \`bun add -D mysql2\`. ` +
        `Original error: ${(err as Error).message}`,
    );
  }
  const createConnection = mysql.default?.createConnection ?? mysql.createConnection;
  const connection = await createConnection(dbCredentials.url ? dbCredentials.url : dbCredentials);
  const db = drizzle(connection, { mode: "default" });

  const adapter = makeAdapter(CHUNK_SIZES.mysql);
  // `chunkLimitFor` further clamps batches so they never exceed MySQL's
  // placeholder limit, regardless of the configured chunk size.
  return {
    adapter,
    db,
    dispose: async () => await connection.end(),
    chunkLimitFor,
  };
}
