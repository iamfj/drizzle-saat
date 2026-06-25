import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const organizations = sqliteTable("organizations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  plan: text("plan", { enum: ["free", "pro", "enterprise"] }).notNull(),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
});

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "archived"] }).notNull(),
});

// Join table with a COMPOSITE primary key (user_id, project_id).
export const memberships = sqliteTable(
  "memberships",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id),
    role: text("role", { enum: ["owner", "editor", "viewer"] }).notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.projectId] }) }),
);

export const invitations = sqliteTable("invitations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orgId: integer("org_id")
    .notNull()
    .references(() => organizations.id),
  email: text("email").notNull(),
  invitedBy: integer("invited_by")
    .notNull()
    .references(() => users.id),
  status: text("status", { enum: ["pending", "accepted", "expired"] }).notNull(),
});
