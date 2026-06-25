import { describe, expect, test } from "bun:test";
import type { Table } from "drizzle-orm";
import { type AnyPgColumn, integer, pgTable, primaryKey, serial, text } from "drizzle-orm/pg-core";
import { buildPlan } from "../../src/engine/plan.js";
import { faker } from "../../src/faker.js";
import type { LoadedFixture } from "../../src/fixtures/load.js";
import { ref } from "../../src/refs/ref.js";
import { createRng } from "../../src/rng/index.js";
import { introspectTable } from "../../src/schema/introspect.js";
import type { SchemaEntry } from "../../src/types.js";
import { CycleError, SaatError } from "../../src/util/errors.js";

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
});
const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
});
// Self-referential table (threaded comments): `parentId` points back at `comments`.
const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  parentId: integer("parent_id").references((): AnyPgColumn => comments.id),
});
// Composite-PK table — cannot be the target of a single-id reference.
const membership = pgTable(
  "membership",
  {
    userId: integer("user_id").notNull(),
    groupId: integer("group_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

function schemaMap(): Map<Table, SchemaEntry> {
  const m = new Map<Table, SchemaEntry>();
  for (const [name, table] of [
    ["users", users],
    ["posts", posts],
    ["comments", comments],
    ["membership", membership],
  ] as const) {
    m.set(table, {
      ...introspectTable(table, "postgresql"),
      sourceFile: "/schema.ts",
      exportName: name,
    });
  }
  return m;
}

function fixture(seeds: any[], scenario?: string): LoadedFixture {
  return { file: "/drizzle-saat/test.ts", fixture: { scenario, seeds } };
}

describe("buildPlan", () => {
  test("orders parents before dependents (ref + FK)", () => {
    const fixtures = [
      fixture([
        {
          table: posts,
          namespace: "post",
          count: 3,
          data: () => ({ title: "t", authorId: ref("user").random() }),
        },
        { table: users, namespace: "user", rows: { a: { name: "A" }, b: { name: "B" } } },
      ]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    const order = plan.seeds.map((s) => s.namespace);
    expect(order.indexOf("user")).toBeLessThan(order.indexOf("post"));
  });

  test("generates correct row counts for count and rows", () => {
    const fixtures = [
      fixture([
        { table: users, namespace: "user", count: 10, data: () => ({ name: "x" }) },
        { table: users, namespace: "vip", rows: { a: { name: "A" }, b: { name: "B" } } },
      ]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    const byNs = Object.fromEntries(plan.seeds.map((s) => [s.namespace, s.rows.length]));
    expect(byNs.user).toBe(10);
    expect(byNs.vip).toBe(2);
  });

  test("a single seed may combine count+data and keyed rows (README pattern)", () => {
    const fixtures = [
      fixture([
        {
          table: users,
          namespace: "user",
          count: 3,
          data: () => ({ name: "bulk" }),
          rows: { john: { name: "John" }, jane: { name: "Jane" } },
        },
      ]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    const user = plan.seeds.find((s) => s.namespace === "user")!;
    // Keyed rows + bulk rows share the one namespace.
    expect(user.rows.length).toBe(5);
    expect(
      user.rows
        .filter((r) => r.key !== undefined)
        .map((r) => r.key)
        .sort(),
    ).toEqual(["jane", "john"]);
  });

  test("keyed rows keep their key", () => {
    const fixtures = [
      fixture([{ table: users, namespace: "user", rows: { john: { name: "John" } } }]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    expect(plan.seeds[0]!.rows[0]!.key).toBe("john");
  });

  test("scenario filter: bare run keeps only scenario-less seeds", () => {
    const fixtures = [
      fixture([{ table: users, namespace: "user", count: 1, data: () => ({ name: "x" }) }]),
      fixture(
        [{ table: users, namespace: "checkout", count: 1, data: () => ({ name: "y" }) }],
        "checkout-flow",
      ),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    expect(plan.seeds.map((s) => s.namespace)).toEqual(["user"]);
  });

  test("scenario filter: named scenario adds tagged seeds", () => {
    const fixtures = [
      fixture([{ table: users, namespace: "user", count: 1, data: () => ({ name: "x" }) }]),
      fixture(
        [{ table: users, namespace: "checkout", count: 1, data: () => ({ name: "y" }) }],
        "checkout-flow",
      ),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1), { scenario: "checkout-flow" });
    expect(plan.seeds.map((s) => s.namespace).sort()).toEqual(["checkout", "user"]);
  });

  test("count: 0 is a valid no-op (no error, zero rows)", () => {
    const fixtures = [
      fixture([
        { table: users, namespace: "user", count: 1, data: () => ({ name: "x" }) },
        { table: posts, namespace: "post", count: 0, data: () => ({ title: "t", authorId: 1 }) },
      ]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    const post = plan.seeds.find((s) => s.namespace === "post");
    expect(post).toBeDefined();
    expect(post!.rows.length).toBe(0);
  });

  test("throws when a seed has neither count nor rows", () => {
    const fixtures = [fixture([{ table: users, namespace: "user" }])];
    expect(() => buildPlan(fixtures, schemaMap(), createRng(1))).toThrow(SaatError);
  });

  test("throws on duplicate namespaces", () => {
    const fixtures = [
      fixture([{ table: users, namespace: "user", count: 1, data: () => ({ name: "x" }) }]),
      fixture([{ table: users, namespace: "user", count: 1, data: () => ({ name: "y" }) }]),
    ];
    expect(() => buildPlan(fixtures, schemaMap(), createRng(1))).toThrow(SaatError);
  });

  test("throws when a ref targets an unincluded namespace", () => {
    const fixtures = [
      fixture([
        {
          table: posts,
          namespace: "post",
          count: 1,
          data: () => ({ title: "t", authorId: ref("ghost").random() }),
        },
      ]),
    ];
    expect(() => buildPlan(fixtures, schemaMap(), createRng(1))).toThrow(/unknown namespace/);
  });

  test("detects reference cycles", () => {
    // user.bestFriend -> user is a self-namespace ref; build two namespaces that
    // point at each other to force a cycle.
    const fixtures = [
      fixture([
        {
          table: users,
          namespace: "a",
          rows: { one: { name: "a", id: ref("b", "one") as unknown as number } },
        },
        {
          table: users,
          namespace: "b",
          rows: { one: { name: "b", id: ref("a", "one") as unknown as number } },
        },
      ]),
    ];
    expect(() => buildPlan(fixtures, schemaMap(), createRng(1))).toThrow(CycleError);
  });

  test("self-referential FK with two namespaces on one table does not false-cycle", () => {
    // Regression: a self-FK (comments.parentId -> comments.id) seeded by two
    // namespaces (`root` + `reply`) must not produce a bogus bidirectional edge.
    // The explicit ref (reply -> root) gives the real ordering.
    const fixtures = [
      fixture([
        {
          table: comments,
          namespace: "reply",
          count: 3,
          data: () => ({ body: "re", parentId: ref("root").random() }),
        },
        { table: comments, namespace: "root", rows: { top: { body: "top" } } },
      ]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    const order = plan.seeds.map((s) => s.namespace);
    expect(order.indexOf("root")).toBeLessThan(order.indexOf("reply"));
  });

  test("a self-FK namespace with no cross-namespace ref still plans (single namespace)", () => {
    const fixtures = [
      fixture([{ table: comments, namespace: "comment", count: 2, data: () => ({ body: "x" }) }]),
    ];
    const plan = buildPlan(fixtures, schemaMap(), createRng(1));
    expect(plan.seeds.map((s) => s.namespace)).toEqual(["comment"]);
  });

  test("rejects a row referencing its own namespace at plan time", () => {
    const fixtures = [
      fixture([
        {
          table: comments,
          namespace: "comment",
          count: 2,
          data: () => ({ body: "x", parentId: ref("comment").random() }),
        },
      ]),
    ];
    expect(() => buildPlan(fixtures, schemaMap(), createRng(1))).toThrow(
      /references its own namespace/,
    );
  });

  test("rejects a reference to a composite-PK namespace at plan time", () => {
    const fixtures = [
      fixture([
        {
          table: posts,
          namespace: "post",
          count: 1,
          data: () => ({ title: "t", authorId: ref("member").random() }),
        },
        { table: membership, namespace: "member", rows: { a: { userId: 1, groupId: 2 } } },
      ]),
    ];
    expect(() => buildPlan(fixtures, schemaMap(), createRng(1))).toThrow(/composite primary key/);
  });

  test("faker is seeded and active during generation (deterministic rows)", () => {
    const mk = () =>
      buildPlan(
        [
          fixture([
            {
              table: users,
              namespace: "user",
              count: 3,
              // Calls the live faker proxy, exactly as a real fixture would.
              data: () => ({ name: faker.person.firstName() }),
            },
          ]),
        ],
        schemaMap(),
        createRng(5),
      );
    const a = mk();
    const b = mk();
    const namesA = a.seeds[0]!.rows.map((r) => r.data.name);
    // Faker was actually consumed (names are real, not the literal "x").
    expect(namesA.every((n) => typeof n === "string" && n.length > 0)).toBe(true);
    // Deterministic across runs for the same seed…
    expect(namesA).toEqual(b.seeds[0]!.rows.map((r) => r.data.name));
    // …and it's the seeded instance: the first row matches a fresh Faker(seed 5).
    expect(namesA[0]).toBe(createRng(5).faker.person.firstName());
  });
});
