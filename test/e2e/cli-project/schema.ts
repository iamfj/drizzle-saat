import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Schema for the built-CLI determinism test (test/e2e/built-cli.test.ts).
// Columns match the CREATE TABLE statements that test issues.
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email").notNull(),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  body: text("body").notNull(),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
});
