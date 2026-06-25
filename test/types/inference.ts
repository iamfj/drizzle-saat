/**
 * Compile-time type tests, checked by `tsc --noEmit` (this file is in the
 * `test` include). Most assertions are type-level (`Expect<…>`) so they are
 * robust to formatting; a few `@ts-expect-error` cases verify that real call
 * sites are rejected. This file is excluded from Biome (formatting would move
 * the `@ts-expect-error` directives off the lines they guard).
 */
import { boolean, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import type { FieldInput, RowInput } from "../../src/fixtures/define.js";
import { defineFixture, defineSeed } from "../../src/fixtures/define.js";
import type { KeyOf, Ref } from "../../src/refs/ref.js";
import { ref } from "../../src/refs/ref.js";

// ── assertion helpers ───────────────────────────────────────────────────────
type Expect<T extends true> = T;
type Not<T extends boolean> = T extends true ? false : true;
/** Is `From` assignable to `To`? (distribution-safe via tuple wrap) */
type Assignable<From, To> = [From] extends [To] ? true : false;

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  age: integer("age").notNull(),
  active: boolean("active").notNull(),
  nickname: text("nickname"), // nullable → optional on insert
});
const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id").notNull(),
});

type UserRow = RowInput<typeof users>;

// Each entry must be `true` or tsc errors. Exported so it counts as "used".
export type TypeAssertions = [
  // NOT NULL enforcement: required columns required, defaults/nullable optional
  Expect<Assignable<{ name: string; age: number; active: boolean }, UserRow>>,
  Expect<Not<Assignable<{ name: string }, UserRow>>>, // missing required age/active
  Expect<Not<Assignable<{ name: number; age: number; active: boolean }, UserRow>>>, // wrong type
  Expect<Assignable<{ name: string; age: number; active: boolean; id: number }, UserRow>>, // id optional

  // refs are value-aware: Ref<V> only fills a column of type V
  Expect<Assignable<Ref<number>, FieldInput<number>>>,
  Expect<Not<Assignable<Ref<number>, FieldInput<string>>>>,
  Expect<Not<Assignable<Ref<number>, FieldInput<boolean>>>>,
  Expect<Assignable<string, FieldInput<string>>>,

  // keyed-row keys: KeyOf falls back to `string` for namespaces with no codegen'd
  // keys; codegen narrows it to the actual key union (verified end-to-end).
  Expect<Assignable<"anything", KeyOf<"unknownNamespace">>>,
  Expect<Assignable<KeyOf<"unknownNamespace">, string>>,
];

// ── defineFixture / defineSeed: real call sites are rejected ─────────────────
// valid usage compiles
defineFixture({ seeds: [{ table: users, namespace: "user", count: 1, data: () => ({ name: "a", age: 1, active: true }) }] });
defineSeed({ table: users, namespace: "user", count: 1, data: () => ({ name: "a", age: 1, active: true }) });
// refs slot into compatible columns (permissive pre-codegen)
defineFixture({ seeds: [{ table: posts, namespace: "post", count: 1, data: () => ({ title: "t", authorId: ref("user").random() }) }] });

// @ts-expect-error data() with a wrong column type is rejected
defineFixture({ seeds: [{ table: users, namespace: "user", count: 1, data: () => ({ name: 123, age: 1, active: true }) }] });
// @ts-expect-error data() missing a required NOT NULL column is rejected
defineFixture({ seeds: [{ table: users, namespace: "user", count: 1, data: () => ({ name: "a" }) }] });
// @ts-expect-error defineSeed data() with a wrong column type is rejected
defineSeed({ table: users, namespace: "user", count: 1, data: () => ({ name: "a", age: "old", active: true }) });
// @ts-expect-error defineSeed keyed rows with a wrong column type is rejected
defineSeed({ table: users, namespace: "user", rows: { admin: { name: 123, age: 1, active: true } } });

// ── setup(): async hook compiles; ctx.setup is unknown (annotate/cast) ───────
// async setup() is accepted alongside seeds; ctx.setup is consumed via a cast
defineFixture({ setup: async () => ({ hash: "x" }), seeds: [{ table: users, namespace: "user", count: 1, data: ({ setup }) => ({ name: (setup as { hash: string }).hash, age: 1, active: true }) }] });
// sync setup() works too; String(unknown) is allowed
defineFixture({ setup: () => 42, seeds: [{ table: users, namespace: "user", count: 1, data: ({ setup }) => ({ name: String(setup), age: 1, active: true }) }] });
// @ts-expect-error ctx.setup is `unknown` — a property access without narrowing is rejected
defineFixture({ setup: async () => ({ hash: "x" }), seeds: [{ table: users, namespace: "user", count: 1, data: ({ setup }) => ({ name: setup.hash, age: 1, active: true }) }] });
