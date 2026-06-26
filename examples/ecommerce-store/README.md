# ecommerce-store (mid)

A four-table store with a real foreign-key chain:
**customers → orders → order_items ← products**. drizzle-saat topologically orders the
inserts for you, so parents always exist before the rows that reference them.

Two fixture files (`drizzle-saat/catalog.fixture.ts`, `drizzle-saat/orders.fixture.ts`) — ~70 lines total —
produce ~350 rows: customers, a product catalog, 80+ orders, and 200 line items,
all with valid foreign keys.

## Run it

```bash
bun install
bun run seed       # seed dev.db, print a report
bun run verify     # seed twice with seed 42, assert byte-identical data
```

```
✓ seeded 354 rows (seed 42)
  customer → customers: 41
  product → products: 31
  order → orders: 82
  orderItem → order_items: 200
✓ reproducible: two runs with seed 42 produced byte-identical data
```

## Concepts shown

- **FK chains + automatic topo-ordering** — `order_items` references both
  `orders` and `products`; you declare the fixtures in any order.
- **Three ways to reference a row:**
  - `ref("customer").random()` — any seeded customer
  - `ref("customer", "vip")` — the keyed VIP from `catalog.fixture.ts`
  - `ref("customer").where({ country: "US" })` — first row matching a predicate
- **Multi-file fixtures** sharing namespaces across files.

## ⚠️ Reproducibility gotcha (worth knowing)

`faker.date.*` helpers default their reference point to `Date.now()`, so they are
**not** seed-reproducible on their own. Anchor them with a fixed `refDate`:

```ts
// reproducible:
placedAt: faker.date.recent({ days: 90, refDate: "2026-06-01T00:00:00.000Z" })
// NOT reproducible — different every run:
placedAt: faker.date.recent({ days: 90 })
```

That single change is the difference between `bun run verify` passing and failing.
