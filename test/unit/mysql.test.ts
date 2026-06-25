import { describe, expect, test } from "bun:test";
import { int, mysqlTable, primaryKey, varchar } from "drizzle-orm/mysql-core";
import { createMysqlAdapter } from "../../src/dialects/mysql.js";
import { introspectTable } from "../../src/schema/introspect.js";
import type { Row, TableInfo } from "../../src/types.js";
import { SaatError } from "../../src/util/errors.js";

const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
});
const membership = mysqlTable(
  "membership",
  {
    userId: int("user_id").notNull(),
    groupId: int("group_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

const usersInfo = introspectTable(users, "mysql") as TableInfo;
const membershipInfo = introspectTable(membership, "mysql") as TableInfo;

/** A caller-provided `db` short-circuits driver loading, so we get the pure adapter. */
async function getAdapter() {
  const { adapter } = await createMysqlAdapter({ db: {} });
  return adapter;
}

/**
 * Fake tx whose insert builder is awaitable (client-supplied path) and also
 * exposes `$returningId()` (auto-increment path), returning `returning`.
 */
function insertTx(returning?: Row[]) {
  return {
    insert() {
      return {
        values() {
          // A real Promise so `await ...values(rows)` works without a hand-rolled
          // `then`; attach `$returningId` for the auto-increment branch.
          const builder = Promise.resolve(undefined) as Promise<unknown> & {
            $returningId: () => Promise<Row[] | undefined>;
          };
          builder.$returningId = async () => returning;
          return builder;
        },
      };
    },
  };
}

describe("mysql adapter insert", () => {
  test("auto-increment PK: maps $returningId results back to the pk property", async () => {
    const adapter = await getAdapter();
    const tx = insertTx([{ id: 1 }, { id: 2 }]);
    const out = await adapter.insert(tx as any, usersInfo, [{ name: "a" }, { name: "b" }]);
    expect(out).toEqual([{ id: 1 }, { id: 2 }]);
  });

  test("auto-increment PK: normalizes when $returningId keys by a different column", async () => {
    const adapter = await getAdapter();
    // Some MySQL builds key the result by the first column, not the pk name.
    const tx = insertTx([{ insertId: 5 }]);
    const out = await adapter.insert(tx as any, usersInfo, [{ name: "a" }]);
    expect(out).toEqual([{ id: 5 }]);
  });

  test("throws when MySQL returns fewer ids than rows", async () => {
    const adapter = await getAdapter();
    const tx = insertTx([{ id: 1 }]); // only one id for two rows
    expect(adapter.insert(tx as any, usersInfo, [{ name: "a" }, { name: "b" }])).rejects.toThrow(
      SaatError,
    );
  });

  test("throws on a batch mixing client-supplied and auto-generated PKs", async () => {
    const adapter = await getAdapter();
    const tx = insertTx([]);
    expect(
      adapter.insert(tx as any, usersInfo, [{ id: 10, name: "a" }, { name: "b" }]),
    ).rejects.toThrow(/mixes client-supplied and auto-generated/);
  });

  test("client-supplied PKs: echoes the supplied ids back (no $returningId)", async () => {
    const adapter = await getAdapter();
    const tx = insertTx(); // $returningId must not be used on this path
    const out = await adapter.insert(tx as any, usersInfo, [
      { id: 7, name: "a" },
      { id: 8, name: "b" },
    ]);
    expect(out).toEqual([{ id: 7 }, { id: 8 }]);
  });

  test("composite PK: echoes all pk columns back", async () => {
    const adapter = await getAdapter();
    const tx = insertTx();
    const out = await adapter.insert(tx as any, membershipInfo, [
      { userId: 1, groupId: 2 },
      { userId: 3, groupId: 4 },
    ]);
    expect(out).toEqual([
      { userId: 1, groupId: 2 },
      { userId: 3, groupId: 4 },
    ]);
  });
});

/** Fake tx that records execute calls and can throw on the Nth one. */
function truncateTx(throwOnCall?: number) {
  const calls: number[] = [];
  return {
    calls,
    async execute() {
      calls.push(calls.length + 1);
      if (throwOnCall !== undefined && calls.length === throwOnCall) {
        throw new Error("boom");
      }
    },
  };
}

describe("mysql adapter truncate", () => {
  const tables = [{ name: "t1" }, { name: "t2" }] as TableInfo[];

  test("cascade disables FK checks, DELETEs each table, then re-enables (4 statements)", async () => {
    const adapter = await getAdapter();
    const tx = truncateTx();
    await adapter.truncate(tx as any, tables, "cascade");
    // SET FK=0, DELETE t1, DELETE t2, SET FK=1.
    expect(tx.calls.length).toBe(4);
  });

  test("cascade re-enables FK checks even if a DELETE throws (finally restores session var)", async () => {
    const adapter = await getAdapter();
    const tx = truncateTx(3); // throw on the second DELETE (3rd statement)
    expect(adapter.truncate(tx as any, tables, "cascade")).rejects.toThrow("boom");
    // Give the rejected promise a tick, then assert the finally's SET ran.
    await Promise.resolve();
    expect(tx.calls.length).toBe(4);
  });

  test("restrict DELETEs each table with FK checks left on (no SET statements)", async () => {
    const adapter = await getAdapter();
    const tx = truncateTx();
    await adapter.truncate(tx as any, tables, "restrict");
    // Just DELETE t1, DELETE t2 — no FK-checks toggling.
    expect(tx.calls.length).toBe(2);
  });
});

describe("mysql adapter deferConstraints", () => {
  test("disables FK checks and returns a restore that re-enables them", async () => {
    const adapter = await getAdapter();
    const tx = truncateTx();
    const restore = await adapter.deferConstraints(tx as any);
    // SET FOREIGN_KEY_CHECKS = 0
    expect(tx.calls.length).toBe(1);
    await restore();
    // SET FOREIGN_KEY_CHECKS = 1
    expect(tx.calls.length).toBe(2);
  });
});
