# testing-with-drizzle-saat (practical)

Using drizzle-saat to give every test a **fresh, realistic, deterministic** database —
no hand-built fixtures, no shared mutable state between tests.

The whole pattern is one helper:

```ts
// test/helper.ts
export async function seededDb(seedValue = 42) {
  const client = new Database(":memory:");
  client.exec(DDL);                                   // create tables
  await seed({ dbCredentials: { db: drizzle(client) }, seed: seedValue });
  return client;                                       // isolated, seeded DB
}
```

Then tests assert against stable keyed rows and known invariants:

```ts
test("keyed rows are stable anchors", async () => {
  const db = await seededDb();
  const alice = db.query("SELECT id FROM users WHERE email = 'alice@example.com'").get();
  const welcome = db.query("SELECT user_id FROM todos WHERE title = 'Welcome to drizzle-saat'").get();
  expect(welcome.user_id).toBe(alice.id);   // ref("user","alice") resolved to Alice
});
```

## Run it

```bash
bun install
bun test
```

```
 5 pass
 0 fail
Ran 5 tests across 1 file.
```

## Concepts shown

- **Per-test isolation** — a fresh in-memory DB per `seededDb()` call; tests
  never bleed into each other.
- **Deterministic data** — a fixed seed means assertions are stable across runs
  and machines (CI included). Change the seed to fuzz; pin it to reproduce.
- **Keyed rows as assertion anchors** — `alice` and the `welcome` todo are known,
  while 20+ surrounding rows keep the scenario realistic.
- **Invariants over snapshots** — assert "no orphan foreign keys", exact counts,
  and resolved refs instead of brittle full-table snapshots.
