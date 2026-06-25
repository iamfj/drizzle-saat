export const DDL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS workspaces (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    plan TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    email        TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
    user_id      INTEGER NOT NULL REFERENCES users(id),
    name         TEXT NOT NULL,
    properties   TEXT NOT NULL,
    ts           TEXT NOT NULL
  );
`;
