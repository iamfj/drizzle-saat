import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seed } from "../../src/engine/seed.js";
import { SAAT_SRC, rmProject, writeProject } from "../helpers/project.js";

const SCHEMA = `
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  email: text("email").notNull(),
});
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  authorId: integer("author_id").notNull().references(() => users.id),
});
`;

const DRIZZLE_CONFIG = `export default {
  dialect: "sqlite",
  schema: "./db/schema.ts",
  dbCredentials: { url: ":memory:" },
};`;

const usersFixture = `
import { defineFixture, faker, ref } from ${JSON.stringify(SAAT_SRC)};
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

function makeDb() {
  const client = new Database(":memory:");
  client.exec("PRAGMA foreign_keys = ON");
  client.exec(`CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    email TEXT NOT NULL
  )`);
  client.exec(`CREATE TABLE posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    author_id INTEGER NOT NULL REFERENCES users(id)
  )`);
  return { client, db: drizzle(client) };
}

let cwd: string;
beforeEach(() => {
  cwd = makeProject();
});
afterEach(() => {
  rmProject(cwd);
});

describe("sqlite e2e", () => {
  test("seeds users and posts with valid foreign keys", async () => {
    const { client, db } = makeDb();
    const report = await seed({ cwd, dbCredentials: { db }, seed: 42 });

    expect(report.total).toBe(20 + 2 + 50 + 2);
    expect(client.query("SELECT count(*) c FROM users").get()).toEqual({ c: 22 });
    expect(client.query("SELECT count(*) c FROM posts").get()).toEqual({ c: 52 });

    // No orphaned foreign keys.
    const orphans = client
      .query(
        "SELECT count(*) c FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE u.id IS NULL",
      )
      .get() as { c: number };
    expect(orphans.c).toBe(0);

    // Keyed/where refs resolved to the right rows.
    const john = client.query("SELECT id FROM users WHERE email = 'john@x.com'").get() as {
      id: number;
    };
    const welcome = client.query("SELECT author_id FROM posts WHERE title = 'Welcome'").get() as {
      author_id: number;
    };
    expect(welcome.author_id).toBe(john.id);
    client.close();
  });

  test("is deterministic for a fixed seed", async () => {
    const a = makeDb();
    const b = makeDb();
    await seed({ cwd, dbCredentials: { db: a.db }, seed: 7 });
    await seed({ cwd, dbCredentials: { db: b.db }, seed: 7 });

    const rowsA = a.client.query("SELECT first_name, email FROM users ORDER BY id").all();
    const rowsB = b.client.query("SELECT first_name, email FROM users ORDER BY id").all();
    expect(rowsA).toEqual(rowsB);

    const postsA = a.client.query("SELECT title, author_id FROM posts ORDER BY id").all();
    const postsB = b.client.query("SELECT title, author_id FROM posts ORDER BY id").all();
    expect(postsA).toEqual(postsB);
    a.client.close();
    b.client.close();
  });

  test("different seeds produce different data", async () => {
    const a = makeDb();
    const b = makeDb();
    await seed({ cwd, dbCredentials: { db: a.db }, seed: 1 });
    await seed({ cwd, dbCredentials: { db: b.db }, seed: 2 });
    const emailsA = a.client.query("SELECT email FROM users ORDER BY id").all();
    const emailsB = b.client.query("SELECT email FROM users ORDER BY id").all();
    expect(emailsA).not.toEqual(emailsB);
    a.client.close();
    b.client.close();
  });

  test("re-seeding wipes and reinserts (stable counts)", async () => {
    const { client, db } = makeDb();
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    expect(client.query("SELECT count(*) c FROM users").get()).toEqual({ c: 22 });
    expect(client.query("SELECT count(*) c FROM posts").get()).toEqual({ c: 52 });
    client.close();
  });

  test("two namespaces mapping to one table both insert (single truncate)", async () => {
    // `user` (20 bulk) and `vip` (2 keyed) both target the `users` table; the
    // table is truncated once up front, so the second namespace must not wipe
    // the first — all 22 rows coexist.
    const { client, db } = makeDb();
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    expect(client.query("SELECT count(*) c FROM users").get()).toEqual({ c: 22 });
    const vips = client
      .query("SELECT count(*) c FROM users WHERE email IN ('john@x.com', 'jane@x.com')")
      .get() as { c: number };
    expect(vips.c).toBe(2);
    client.close();
  });

  test("dry-run writes nothing", async () => {
    const { client, db } = makeDb();
    const report = await seed({ cwd, dbCredentials: { db }, seed: 42, dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.total).toBe(74);
    expect(client.query("SELECT count(*) c FROM users").get()).toEqual({ c: 0 });
    client.close();
  });

  test("inserts spanning multiple chunks map keys to ids correctly", async () => {
    // 20 keyed users with a small chunkSize (7) → 3 chunks. A ref to a key in a
    // later chunk must resolve to the right id, proving the cursor/key mapping
    // across the batch loop in seed.ts.
    const chunkCwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": DRIZZLE_CONFIG,
      "saat.config.ts": "export default { seed: 1, chunkSize: 7 };",
      "saat/users.ts": `import { defineFixture } from ${JSON.stringify(SAAT_SRC)};
import { users } from "../db/schema";
const rows = {};
for (let i = 0; i < 20; i++) rows["u" + i] = { firstName: "U" + i, email: "u" + i + "@x.com" };
export default defineFixture({ seeds: [{ table: users, namespace: "user", rows }] });`,
      "saat/posts.ts": `import { defineFixture, ref } from ${JSON.stringify(SAAT_SRC)};
import { posts } from "../db/schema";
export default defineFixture({ seeds: [{ table: posts, namespace: "post", rows: {
  first: { title: "first", authorId: ref("user", "u0") },
  mid: { title: "mid", authorId: ref("user", "u15") },
  last: { title: "last", authorId: ref("user", "u19") },
} }] });`,
    });
    try {
      const { client, db } = makeDb();
      await seed({ cwd: chunkCwd, dbCredentials: { db }, seed: 1 });
      expect(client.query("SELECT count(*) c FROM users").get()).toEqual({ c: 20 });
      const idOf = (email: string) =>
        (client.query("SELECT id FROM users WHERE email = ?").get(email) as { id: number }).id;
      const authorOf = (title: string) =>
        (
          client.query("SELECT author_id FROM posts WHERE title = ?").get(title) as {
            author_id: number;
          }
        ).author_id;
      expect(authorOf("first")).toBe(idOf("u0@x.com"));
      expect(authorOf("mid")).toBe(idOf("u15@x.com")); // u15 lands in chunk 3
      expect(authorOf("last")).toBe(idOf("u19@x.com"));
      client.close();
    } finally {
      rmProject(chunkCwd);
    }
  });

  test("a failed insert rolls the whole run back (manual BEGIN/ROLLBACK)", async () => {
    // A row violating NOT NULL fails mid-transaction. Truncate + inserts must
    // roll back, leaving a pre-existing sentinel row untouched.
    const badCwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": DRIZZLE_CONFIG,
      "saat.config.ts": "export default { seed: 1 };",
      "saat/bad.ts": `import { defineFixture } from ${JSON.stringify(SAAT_SRC)};
import { users } from "../db/schema";
// Missing required \`firstName\` → SQLite NOT NULL violation on insert.
export default defineFixture({ seeds: [{ table: users, namespace: "user", rows: {
  a: { email: "a@x.com" },
} }] });`,
    });
    try {
      const { client, db } = makeDb();
      client.exec("INSERT INTO users (first_name, email) VALUES ('Sentinel', 's@x.com')");
      await expect(seed({ cwd: badCwd, dbCredentials: { db }, seed: 1 })).rejects.toThrow();
      // Rolled back: the sentinel survives, nothing partial was committed.
      const rows = client.query("SELECT first_name FROM users").all();
      expect(rows).toEqual([{ first_name: "Sentinel" }]);
      client.close();
    } finally {
      rmProject(badCwd);
    }
  });

  test("dry-run surfaces a broken reference without touching a database", async () => {
    const brokenCwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": DRIZZLE_CONFIG,
      "saat.config.ts": "export default { seed: 1 };",
      "saat/posts.ts": `import { defineFixture, ref } from ${JSON.stringify(SAAT_SRC)};
import { posts } from "../db/schema";
export default defineFixture({ seeds: [{ table: posts, namespace: "post", count: 1,
  data: () => ({ title: "t", authorId: ref("ghost").random() }) }] });`,
    });
    try {
      // No db handle supplied — dry-run must fail on the ref before any connect.
      await expect(seed({ cwd: brokenCwd, dryRun: true, seed: 1 })).rejects.toThrow(
        /unknown namespace/,
      );
    } finally {
      rmProject(brokenCwd);
    }
  });
});
