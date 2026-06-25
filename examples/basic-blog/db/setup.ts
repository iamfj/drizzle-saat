// Raw DDL so the example is self-contained (no drizzle-kit / migration step).
// In a real project your tables come from `drizzle-kit push` or migrations;
// the drizzle-saat fixtures stay exactly the same either way.
export const DDL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE
  );
  CREATE TABLE IF NOT EXISTS posts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    author_id INTEGER NOT NULL REFERENCES users(id),
    title     TEXT NOT NULL,
    body      TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 0
  );
`;
