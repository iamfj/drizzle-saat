import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { seed } from "../../src/engine/seed.js";
import { SAAT_SRC, rmProject, writeProject } from "../helpers/project.js";

const SCHEMA = `
import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firstName: text("first_name").notNull(),
  email: text("email").notNull(),
});
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
});
`;

const DRIZZLE_CONFIG = `export default {
  dialect: "postgresql",
  schema: "./db/schema.ts",
  dbCredentials: { url: "memory://" },
};`;

const usersFixture = `
import { defineFixture, faker } from ${JSON.stringify(SAAT_SRC)};
import { users } from "../db/schema";
export default defineFixture({
  seeds: [
    { table: users, namespace: "user", count: 20, data: () => ({
        firstName: faker.person.firstName(),
        email: faker.internet.email(),
    }) },
    { table: users, namespace: "vip", rows: {
        john: { firstName: "John", email: "john@x.com" },
        jane: { firstName: "Jane", email: "jane@x.com" },
    } },
  ],
});`;

const postsFixture = `
import { defineFixture, faker, ref } from ${JSON.stringify(SAAT_SRC)};
import { posts } from "../db/schema";
export default defineFixture({
  seeds: [
    { table: posts, namespace: "post", count: 50, data: () => ({
        title: faker.lorem.sentence(),
        authorId: ref("user").random(),
    }) },
    { table: posts, namespace: "featured", rows: {
        welcome: { title: "Welcome", authorId: ref("vip", "john") },
        news: { title: "News", authorId: ref("vip").where({ firstName: "Jane" }) },
    } },
  ],
});`;

function makeProject() {
  return writeProject({
    "db/schema.ts": SCHEMA,
    "drizzle.config.ts": DRIZZLE_CONFIG,
    "saat.config.ts": "export default { seed: 42 };",
    "saat/users.ts": usersFixture,
    "saat/posts.ts": postsFixture,
  });
}

async function makeDb() {
  const client = new PGlite();
  await client.exec(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      first_name TEXT NOT NULL,
      email TEXT NOT NULL
    );
    CREATE TABLE posts (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      author_id INTEGER NOT NULL REFERENCES users(id)
    );
  `);
  return { client, db: drizzle(client) };
}

const count = async (client: PGlite, table: string) =>
  Number((await client.query<{ c: number }>(`SELECT count(*)::int c FROM ${table}`)).rows[0]!.c);

let cwd: string;
beforeEach(() => {
  cwd = makeProject();
});
afterEach(() => {
  rmProject(cwd);
});

describe("postgres (pglite) e2e", () => {
  test("seeds with valid foreign keys", async () => {
    const { client, db } = await makeDb();
    const report = await seed({ cwd, dbCredentials: { db }, seed: 42 });
    expect(report.total).toBe(74);
    expect(await count(client, "users")).toBe(22);
    expect(await count(client, "posts")).toBe(52);

    const orphans = await client.query<{ c: number }>(
      "SELECT count(*)::int c FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE u.id IS NULL",
    );
    expect(orphans.rows[0]!.c).toBe(0);

    const john = await client.query<{ id: number }>(
      "SELECT id FROM users WHERE email = 'john@x.com'",
    );
    const welcome = await client.query<{ author_id: number }>(
      "SELECT author_id FROM posts WHERE title = 'Welcome'",
    );
    expect(welcome.rows[0]!.author_id).toBe(john.rows[0]!.id);
    await client.close();
  });

  test("TRUNCATE…RESTART IDENTITY resets serials on re-seed", async () => {
    const { client, db } = await makeDb();
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    expect(await count(client, "users")).toBe(22);
    const maxId = await client.query<{ m: number }>("SELECT max(id)::int m FROM users");
    expect(maxId.rows[0]!.m).toBe(22); // identity restarted, not 44
    await client.close();
  });

  test("is deterministic for a fixed seed", async () => {
    const a = await makeDb();
    const b = await makeDb();
    await seed({ cwd, dbCredentials: { db: a.db }, seed: 7 });
    await seed({ cwd, dbCredentials: { db: b.db }, seed: 7 });
    const ra = (await a.client.query("SELECT first_name, email FROM users ORDER BY id")).rows;
    const rb = (await b.client.query("SELECT first_name, email FROM users ORDER BY id")).rows;
    expect(ra).toEqual(rb);
    await a.client.close();
    await b.client.close();
  });

  test("rolls back the whole run on failure (atomicity)", async () => {
    // Inject a fixture that violates NOT NULL to force a mid-run error.
    const badCwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": DRIZZLE_CONFIG,
      "saat/users.ts": `
        import { defineFixture } from ${JSON.stringify(SAAT_SRC)};
        import { users } from "../db/schema";
        export default defineFixture({ seeds: [
          { table: users, namespace: "user", rows: { bad: { firstName: "X" } } },
        ] });`,
    });
    const { client, db } = await makeDb();
    await expect(seed({ cwd: badCwd, dbCredentials: { db }, seed: 1 })).rejects.toThrow();
    expect(await count(client, "users")).toBe(0); // nothing committed
    await client.close();
    rmProject(badCwd);
  });
});
