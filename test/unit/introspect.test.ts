import { afterEach, describe, expect, test } from "bun:test";
import {
  type AnyPgColumn,
  integer as pgInteger,
  pgTable,
  text as pgText,
  primaryKey,
  serial,
  varchar,
} from "drizzle-orm/pg-core";
import { createLoader } from "../../src/config/load.js";
import { columnToTsType } from "../../src/schema/column-types.js";
import { introspectTable, loadSchema } from "../../src/schema/introspect.js";
import { rmProject, writeProject } from "../helpers/project.js";

const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: pgText("first_name").notNull(),
  nickname: pgText("nickname"),
});

const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  authorId: pgInteger("author_id")
    .notNull()
    .references(() => users.id),
});

const membership = pgTable(
  "membership",
  {
    userId: pgInteger("user_id").notNull(),
    groupId: pgInteger("group_id").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.groupId] })],
);

const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  parentId: pgInteger("parent_id").references((): AnyPgColumn => comments.id),
});

describe("introspectTable", () => {
  test("reads table name and columns", () => {
    const info = introspectTable(users, "postgresql");
    expect(info.name).toBe("users");
    const byKey = Object.fromEntries(info.columns.map((c) => [c.propertyKey, c]));
    expect(byKey.firstName!.name).toBe("first_name");
    expect(byKey.firstName!.notNull).toBe(true);
    expect(byKey.nickname!.notNull).toBe(false);
    expect(byKey.id!.primaryKey).toBe(true);
  });

  test("maps property keys to SQL column names", () => {
    const info = introspectTable(posts, "postgresql");
    const authorId = info.columns.find((c) => c.propertyKey === "authorId");
    expect(authorId?.name).toBe("author_id");
  });

  test("detects single primary key", () => {
    const info = introspectTable(users, "postgresql");
    expect(info.primaryKeys).toEqual(["id"]);
  });

  test("detects auto-increment serial pk", () => {
    const info = introspectTable(users, "postgresql");
    const id = info.columns.find((c) => c.propertyKey === "id");
    expect(id?.autoIncrement).toBe(true);
  });

  test("extracts foreign keys with property-key mapping", () => {
    const info = introspectTable(posts, "postgresql");
    expect(info.foreignKeys.length).toBe(1);
    const fk = info.foreignKeys[0]!;
    expect(fk.columns).toEqual(["authorId"]);
    expect(fk.foreignTableName).toBe("users");
    expect(fk.foreignColumns).toEqual(["id"]);
  });

  test("collects all columns of a composite primary key", () => {
    const info = introspectTable(membership, "postgresql");
    expect(info.primaryKeys.sort()).toEqual(["groupId", "userId"]);
  });

  test("reports a self-referential FK as pointing at its own table", () => {
    const info = introspectTable(comments, "postgresql");
    expect(info.foreignKeys.length).toBe(1);
    expect(info.foreignKeys[0]!.foreignTableName).toBe("comments");
  });
});

describe("loadSchema", () => {
  let cwd: string | undefined;
  afterEach(() => {
    if (cwd) rmProject(cwd);
    cwd = undefined;
  });

  test("imports every exported table across files with source + export name", async () => {
    cwd = writeProject({
      "db/a.ts": `import { pgTable, serial } from "drizzle-orm/pg-core";
export const users = pgTable("users", { id: serial("id").primaryKey() });`,
      "db/b.ts": `import { pgTable, serial } from "drizzle-orm/pg-core";
export const posts = pgTable("posts", { id: serial("id").primaryKey() });`,
    });
    const schema = await loadSchema(
      [`${cwd}/db/a.ts`, `${cwd}/db/b.ts`],
      "postgresql",
      createLoader(),
    );
    const byName = [...schema.values()].map((e) => e.exportName).sort();
    expect(byName).toEqual(["posts", "users"]);
    expect([...schema.values()].every((e) => e.sourceFile.startsWith(cwd!))).toBe(true);
  });

  test("throws a clear error when no tables are exported", async () => {
    cwd = writeProject({ "db/empty.ts": "export const notATable = 1;" });
    expect(loadSchema([`${cwd}/db/empty.ts`], "postgresql", createLoader())).rejects.toThrow(
      /no Drizzle tables found/,
    );
  });
});

describe("columnToTsType", () => {
  test("maps known data types", () => {
    expect(columnToTsType("number")).toBe("number");
    expect(columnToTsType("string")).toBe("string");
    expect(columnToTsType("boolean")).toBe("boolean");
    expect(columnToTsType("date")).toBe("Date");
  });

  test("falls back to unknown", () => {
    expect(columnToTsType("mystery")).toBe("unknown");
  });
});
