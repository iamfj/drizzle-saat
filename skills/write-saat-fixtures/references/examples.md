# drizzle-saat fixture examples

Distilled from the runnable `examples/` in the drizzle-saat repo.

## Single-file fixture with a keyed anchor row

```ts
import { defineFixture, faker, ref } from "drizzle-saat";
import { posts, users } from "../db/schema";

export default defineFixture({
  seeds: [
    {
      table: users, namespace: "user", count: 25,
      data: () => ({ name: faker.person.fullName(), email: faker.internet.email() }),
      rows: { admin: { name: "Ada Admin", email: "ada@example.com" } }, // → ref("user","admin")
    },
    {
      table: posts, namespace: "post", count: 100,
      data: () => ({
        title: faker.lorem.sentence(),
        body: faker.lorem.paragraphs(2),
        published: faker.datatype.boolean({ probability: 0.7 }),
        authorId: ref("user").random(),
      }),
    },
  ],
});
```

## Cross-file relationships

Namespaces are global, so `orders.ts` references `customer`/`product` defined in a
separate `catalog.ts` — no import of the other fixture.

```ts
// orders.fixture.ts
import { defineFixture, faker, ref } from "drizzle-saat";
import { orderItems, orders } from "../db/schema";

export default defineFixture({
  seeds: [
    {
      table: orders, namespace: "order", count: 80,
      data: () => ({
        customerId: ref("customer").random(),
        status: faker.helpers.arrayElement(["pending", "paid", "shipped", "refunded"]),
        totalCents: faker.number.int({ min: 1_000, max: 200_000 }),
        placedAt: faker.date
          .recent({ days: 90, refDate: "2026-06-01T00:00:00.000Z" }) // fixed refDate!
          .toISOString(),
      }),
      rows: {
        vipOrder: { customerId: ref("customer", "vip"), status: "paid", totalCents: 19_900, placedAt: "2026-01-01T00:00:00.000Z" },
        usOrder:  { customerId: ref("customer").where({ country: "US" }), status: "shipped", totalCents: 4_200, placedAt: "2026-01-02T00:00:00.000Z" },
      },
    },
    {
      table: orderItems, namespace: "orderItem", count: 200,
      data: () => ({
        orderId: ref("order").random(),
        productId: ref("product").random(),
        quantity: faker.number.int({ min: 1, max: 5 }),
        unitPriceCents: faker.number.int({ min: 500, max: 50_000 }),
      }),
    },
  ],
});
```

## ref nested inside a JSON column

```ts
{
  table: posts, namespace: "post", count: 120,
  data: () => ({
    authorId: ref("user").random(),
    body: faker.lorem.paragraph(),
    metadata: {                            // JSON column
      lang: faker.helpers.arrayElement(["en", "de", "fr"]),
      pinnedBy: ref("user", "ada"),        // ref resolved to an id, nested in JSON
    },
    createdAt: faker.date.recent({ days: 30, refDate: "2026-06-01T00:00:00.000Z" }).toISOString(),
  }),
}
```

## Threaded self-reference (two namespaces on one table)

Roots and replies both seed the `comments` table under distinct namespaces; replies
point at roots via `ref("comment").random()`. The `parentId` column is **soft** (no
Drizzle `.references()`) to avoid the declared-self-FK false `CycleError`; the DB DDL
still enforces the FK.

```ts
{
  table: comments, namespace: "comment", count: 150,
  data: () => ({
    postId: ref("post").random(),
    authorId: ref("user").random(),
    body: faker.lorem.sentence(),        // no parentId → a top-level comment
  }),
},
{
  table: comments, namespace: "reply", count: 100,
  data: () => ({
    postId: ref("post").random(),
    authorId: ref("user").random(),
    parentId: ref("comment").random(),   // replies inserted after roots
    body: faker.lorem.sentence(),
  }),
}
```

The matching schema keeps `parentId` soft (`integer("parent_id")` with **no**
`.references()`); the DB DDL still enforces the FK.

## Composite-PK join table (keyed rows only)

A table with a composite PK `(userId, projectId)` cannot be a ref *target*, but can
reference others. Seed it as explicit keyed rows:

```ts
{
  table: memberships, namespace: "membership",
  rows: {
    aliceLaunch: { userId: ref("user", "alice"), projectId: ref("project", "launch"), role: "owner" },
    bobLaunch:   { userId: ref("user", "bob"),   projectId: ref("project", "launch"), role: "editor" },
  },
}
```

## Scenarios

```ts
// base.fixture.ts — no scenario, always runs
export default defineFixture({ seeds: [ /* ... */ ] });

// load.fixture.ts — only runs with `drizzle-saat --scenario load`, in addition to base
export default defineFixture({
  scenario: "load",
  seeds: [ { table: events, namespace: "loadEvent", count: 5_000, data: () => ({ /* ... */ }) } ],
});
```

## Index-based disambiguation for unique columns

```ts
{
  table: users, namespace: "user", count: 1_000,
  data: ({ index }) => ({
    handle: `${faker.internet.username()}_${index}`, // guaranteed unique
    email: faker.internet.email(),
  }),
}
```
