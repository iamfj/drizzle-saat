import { type Column, Table, getTableColumns, getTableName, is } from "drizzle-orm";
import { getTableConfig as mysqlGetTableConfig } from "drizzle-orm/mysql-core";
import { getTableConfig as pgGetTableConfig } from "drizzle-orm/pg-core";
import { getTableConfig as sqliteGetTableConfig } from "drizzle-orm/sqlite-core";
import type { Jiti } from "jiti";
import type { ColumnInfo, Dialect, ForeignKeyInfo, SchemaEntry, TableInfo } from "../types.js";
import { SaatError } from "../util/errors.js";
import { columnToTsType } from "./column-types.js";

/** Shape of the dialect-specific `getTableConfig` return we rely on. */
interface AnyTableConfig {
  name: string;
  schema?: string;
  columns: Column[];
  primaryKeys: { columns: Column[] }[];
  foreignKeys: {
    reference(): { columns: Column[]; foreignTable: Table; foreignColumns: Column[] };
  }[];
}

type GetTableConfig = (table: Table) => AnyTableConfig;

/** Pick the dialect-specific `getTableConfig` implementation. */
export function getConfigFn(dialect: Dialect): GetTableConfig {
  switch (dialect) {
    case "postgresql":
      return pgGetTableConfig as unknown as GetTableConfig;
    case "mysql":
      return mysqlGetTableConfig as unknown as GetTableConfig;
    case "sqlite":
      return sqliteGetTableConfig as unknown as GetTableConfig;
  }
}

/**
 * Resolve a Drizzle column to its JS property key. Some dialects (notably
 * Postgres composite `primaryKey(...)`) hold Column instances that are not
 * identical to those from `getTableColumns`, so an identity lookup misses;
 * we then fall back to matching on the SQL column name, and finally to the
 * name itself. This keeps property-key mapping consistent across single PKs,
 * composite PKs, and foreign keys.
 */
function columnResolver(table: Table): (column: Column) => string {
  const byInstance = new Map<Column, string>();
  const byName = new Map<string, string>();
  for (const [key, col] of Object.entries(getTableColumns(table))) {
    byInstance.set(col as Column, key);
    byName.set((col as Column).name, key);
  }
  return (column) => byInstance.get(column) ?? byName.get(column.name) ?? column.name;
}

function detectAutoIncrement(column: Column): boolean {
  if ((column as any).autoIncrement === true) return true;
  // Postgres serial / sqlite rowid integer pk are DB-generated too.
  return /Serial$/.test(column.columnType);
}

/** Introspect a single Drizzle table into a normalized {@link TableInfo}. */
export function introspectTable(table: Table, dialect: Dialect): TableInfo {
  const config = getConfigFn(dialect)(table);
  const keyOf = columnResolver(table);

  const columns: ColumnInfo[] = config.columns.map((column) => {
    const propertyKey = keyOf(column);
    return {
      propertyKey,
      name: column.name,
      columnType: column.columnType,
      dataType: column.dataType,
      notNull: column.notNull,
      hasDefault: column.hasDefault || (column as any).defaultFn !== undefined,
      primaryKey: (column as any).primary === true,
      autoIncrement: detectAutoIncrement(column),
      tsType: columnToTsType(column.dataType),
    };
  });

  // Primary keys: single-column `.primaryKey()` plus composite `primaryKey(...)`.
  const primaryKeys = new Set<string>();
  for (const col of columns) {
    if (col.primaryKey) primaryKeys.add(col.propertyKey);
  }
  for (const pk of config.primaryKeys) {
    for (const column of pk.columns) {
      primaryKeys.add(keyOf(column));
    }
  }

  const foreignKeys: ForeignKeyInfo[] = config.foreignKeys.map((fk) => {
    const ref = fk.reference();
    const foreignKeyOf = columnResolver(ref.foreignTable);
    return {
      columns: ref.columns.map((c) => keyOf(c)),
      foreignTableName: getTableName(ref.foreignTable),
      foreignColumns: ref.foreignColumns.map((c) => foreignKeyOf(c)),
    };
  });

  return {
    table,
    name: config.name,
    schema: config.schema,
    columns,
    primaryKeys: [...primaryKeys],
    foreignKeys,
  };
}

/**
 * Import all schema files and introspect every exported Drizzle table.
 * Returns a map keyed by the Table instance, carrying source file + export
 * name so codegen can emit `typeof schema.<exportName>`.
 */
export async function loadSchema(
  schemaPaths: string[],
  dialect: Dialect,
  jiti: Jiti,
): Promise<Map<Table, SchemaEntry>> {
  const entries = new Map<Table, SchemaEntry>();

  for (const file of schemaPaths) {
    const mod = (await jiti.import(file)) as Record<string, unknown>;
    for (const [exportName, value] of Object.entries(mod)) {
      if (!is(value, Table)) continue;
      const table = value as Table;
      if (entries.has(table)) continue;
      entries.set(table, {
        ...introspectTable(table, dialect),
        sourceFile: file,
        exportName,
      });
    }
  }

  if (entries.size === 0) {
    throw new SaatError(
      `no Drizzle tables found in schema files: ${schemaPaths.join(", ")}. ` +
        "Make sure your tables are exported.",
    );
  }
  return entries;
}
