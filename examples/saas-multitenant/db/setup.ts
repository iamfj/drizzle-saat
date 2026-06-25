// Raw DDL so the example is self-contained. Note the composite primary key on
// `memberships`. In a real project these come from drizzle-kit / migrations.
export const DDL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS organizations (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plan TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    name   TEXT NOT NULL,
    email  TEXT NOT NULL UNIQUE,
    role   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS projects (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id INTEGER NOT NULL REFERENCES organizations(id),
    name   TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS memberships (
    user_id    INTEGER NOT NULL REFERENCES users(id),
    project_id INTEGER NOT NULL REFERENCES projects(id),
    role       TEXT NOT NULL,
    PRIMARY KEY (user_id, project_id)
  );
  CREATE TABLE IF NOT EXISTS invitations (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    org_id     INTEGER NOT NULL REFERENCES organizations(id),
    email      TEXT NOT NULL,
    invited_by INTEGER NOT NULL REFERENCES users(id),
    status     TEXT NOT NULL
  );
`;
