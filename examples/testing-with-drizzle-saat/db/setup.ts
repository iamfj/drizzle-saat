export const DDL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS todos (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  INTEGER NOT NULL REFERENCES users(id),
    title    TEXT NOT NULL,
    done     INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL
  );
`;
