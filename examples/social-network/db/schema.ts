import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  handle: text("handle").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio").notNull(),
});

// Self-referential many-to-many: users follow users.
export const follows = sqliteTable("follows", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  followerId: integer("follower_id")
    .notNull()
    .references(() => users.id),
  followeeId: integer("followee_id")
    .notNull()
    .references(() => users.id),
});

export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  // JSON column — drizzle-saat resolves refs nested *inside* it (see `pinnedBy`).
  metadata: text("metadata", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull(),
});

// Threaded comments. `parentId` points at another comment for replies. We keep
// it a soft reference (no Drizzle `.references()`) and let a drizzle-saat `ref("comment")`
// drive ordering: a *declared* self-FK on a table that has two namespaces
// (`comment` + `reply`) would make drizzle-saat's FK ordering see a false cycle. The DB
// still enforces the FK via the DDL constraint.
export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
  authorId: integer("author_id")
    .notNull()
    .references(() => users.id),
  parentId: integer("parent_id"),
  body: text("body").notNull(),
});

export const likes = sqliteTable("likes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
});

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  label: text("label").notNull().unique(),
});

export const postTags = sqliteTable("post_tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
  tagId: integer("tag_id")
    .notNull()
    .references(() => tags.id),
});
