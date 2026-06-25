// Raw DDL so the example is self-contained. In a real project these tables come
// from `drizzle-kit push` / migrations; the drizzle-saat fixtures are identical either way.
export const DDL = `
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS customers (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT NOT NULL,
    email   TEXT NOT NULL UNIQUE,
    country TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    stock       INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    status      TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    placed_at   TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id         INTEGER NOT NULL REFERENCES orders(id),
    product_id       INTEGER NOT NULL REFERENCES products(id),
    quantity         INTEGER NOT NULL,
    unit_price_cents INTEGER NOT NULL,
    discount         REAL NOT NULL DEFAULT 0
  );
`;
