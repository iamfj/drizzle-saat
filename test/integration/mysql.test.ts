import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { seed } from "../../src/engine/seed.js";
import { SAAT_SRC, rmProject, writeProject } from "../helpers/project.js";

/**
 * MySQL has no RETURNING, so it exercises the `$returningId()` code path. These
 * tests need a real MySQL and are gated behind `INTEGRATION=1` + `MYSQL_URL`
 * (CI provides a service container). They are skipped otherwise.
 */
const MYSQL_URL = process.env.MYSQL_URL;
const RUN = process.env.INTEGRATION === "1" && !!MYSQL_URL;

const SCHEMA = `
import { int, mysqlTable, serial, varchar } from "drizzle-orm/mysql-core";
export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
});
export const posts = mysqlTable("posts", {
  id: serial("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  authorId: int("author_id").notNull().references(() => users.id),
});
`;

const drizzleConfig = `export default {
  dialect: "mysql",
  schema: "./db/schema.ts",
  dbCredentials: { url: ${JSON.stringify(MYSQL_URL ?? "")} },
};`;

const usersFixture = `
import { defineFixture, faker } from ${JSON.stringify(SAAT_SRC)};
import { users } from "../db/schema";
export default defineFixture({ seeds: [
  { table: users, namespace: "user", count: 20, data: () => ({
      firstName: faker.person.firstName(), email: faker.internet.email() }) },
  { table: users, namespace: "vip", rows: {
      john: { firstName: "John", email: "john@x.com" },
      jane: { firstName: "Jane", email: "jane@x.com" } } },
] });`;

const postsFixture = `
import { defineFixture, faker, ref } from ${JSON.stringify(SAAT_SRC)};
import { posts } from "../db/schema";
export default defineFixture({ seeds: [
  { table: posts, namespace: "post", count: 50, data: () => ({
      title: faker.lorem.sentence(), authorId: ref("user").random() }) },
  { table: posts, namespace: "featured", rows: {
      welcome: { title: "Welcome", authorId: ref("vip", "john") },
      news: { title: "News", authorId: ref("vip").where({ firstName: "Jane" }) } } },
] });`;

let cwd: string;
let connection: any;
let db: any;

beforeAll(async () => {
  if (!RUN) return;
  const mysql = await import("mysql2/promise");
  const { drizzle } = await import("drizzle-orm/mysql2");
  connection = await mysql.createConnection(MYSQL_URL as string);
  db = drizzle(connection, { mode: "default" });
  await connection.query("DROP TABLE IF EXISTS posts");
  await connection.query("DROP TABLE IF EXISTS users");
  await connection.query(
    "CREATE TABLE users (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, first_name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL)",
  );
  await connection.query(
    "CREATE TABLE posts (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, title VARCHAR(255) NOT NULL, author_id BIGINT UNSIGNED NOT NULL, FOREIGN KEY (author_id) REFERENCES users(id))",
  );
  cwd = writeProject({
    "db/schema.ts": SCHEMA,
    "drizzle.config.ts": drizzleConfig,
    "saat/users.ts": usersFixture,
    "saat/posts.ts": postsFixture,
  });
});

afterAll(async () => {
  if (!RUN) return;
  await connection?.end();
  if (cwd) rmProject(cwd);
});

describe.skipIf(!RUN)("mysql integration", () => {
  test("seeds with valid foreign keys via $returningId", async () => {
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    const [[u]] = await connection.query("SELECT count(*) c FROM users");
    const [[p]] = await connection.query("SELECT count(*) c FROM posts");
    expect(Number(u.c)).toBe(22);
    expect(Number(p.c)).toBe(52);
    const [[orphans]] = await connection.query(
      "SELECT count(*) c FROM posts p LEFT JOIN users u ON p.author_id = u.id WHERE u.id IS NULL",
    );
    expect(Number(orphans.c)).toBe(0);
  });

  test("resolves keyed reference to the right row", async () => {
    await seed({ cwd, dbCredentials: { db }, seed: 42 });
    const [[john]] = await connection.query("SELECT id FROM users WHERE email = 'john@x.com'");
    const [[welcome]] = await connection.query(
      "SELECT author_id FROM posts WHERE title = 'Welcome'",
    );
    expect(Number(welcome.author_id)).toBe(Number(john.id));
  });
});
