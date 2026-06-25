import type { Table } from "drizzle-orm";

/** The three SQL dialects drizzle-saat supports in v1. */
export type Dialect = "postgresql" | "mysql" | "sqlite";

/** A single column's introspected metadata, dialect-normalized. */
export interface ColumnInfo {
  /** JS property key on the Drizzle table object (e.g. `authorId`). */
  propertyKey: string;
  /** Actual SQL column name (e.g. `author_id`). */
  name: string;
  /** Drizzle's `columnType` discriminator (e.g. `PgInteger`, `SQLiteText`). */
  columnType: string;
  /** Drizzle's normalized `dataType` (e.g. `number`, `string`, `boolean`, `date`, `json`). */
  dataType: string;
  notNull: boolean;
  hasDefault: boolean;
  primaryKey: boolean;
  /** True for auto-increment / serial primary keys (drives MySQL `$returningId`). */
  autoIncrement: boolean;
  /** Best-effort TypeScript type literal for codegen (e.g. `number`, `string`). */
  tsType: string;
}

/** A foreign-key relationship, used for dependency ordering and truncation. */
export interface ForeignKeyInfo {
  /** Local column property keys participating in the FK. */
  columns: string[];
  /** Referenced table's SQL name. */
  foreignTableName: string;
  /** Referenced column property keys. */
  foreignColumns: string[];
}

/** Dialect-normalized view of a Drizzle table. */
export interface TableInfo {
  /** The original Drizzle table object. */
  table: Table;
  /** SQL table name. */
  name: string;
  /** Schema name, if any (Postgres). */
  schema?: string;
  columns: ColumnInfo[];
  /** Property keys of the primary-key columns. */
  primaryKeys: string[];
  foreignKeys: ForeignKeyInfo[];
}

/** A plain row of values keyed by column property key. */
export type Row = Record<string, unknown>;

/**
 * A {@link TableInfo} plus where its Drizzle table was exported from. Codegen
 * needs the source file and export name to emit `typeof schema.users`.
 */
export interface SchemaEntry extends TableInfo {
  /** Absolute path of the schema file this table was exported from. */
  sourceFile: string;
  /** The export name the table is bound to in that file. */
  exportName: string;
}

/**
 * Per-dialect adapter. Each dialect implements introspection, truncation,
 * batched inserts (returning generated primary keys), and transactions.
 *
 * `tx`/`db` are intentionally `any`: their concrete types differ per Drizzle
 * driver and the engine treats them opaquely.
 */
export interface DialectAdapter {
  readonly dialect: Dialect;
  /** Recommended max rows per INSERT batch for this dialect. */
  readonly chunkSize: number;

  /**
   * Wipe all given tables. Implementations handle FK constraints per dialect
   * (TRUNCATE … CASCADE, FK-checks off, PRAGMA foreign_keys=OFF). `tables` are
   * provided in dependency order (dependents first) for delete-in-order
   * strategies.
   */
  truncate(tx: any, tables: TableInfo[]): Promise<void>;

  /**
   * Insert `rows` for `info.table` and return, for each input row in order, an
   * object of its primary-key column values (property key → value). Used to
   * resolve references from dependent rows.
   */
  insert(tx: any, info: TableInfo, rows: Row[]): Promise<Row[]>;

  /** Run `fn` inside a single all-or-nothing transaction. */
  transaction<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T>;
}
