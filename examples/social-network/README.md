# social-network (large)

The deepest graph in the set: **8 tables, 8 namespaces** across three fixture
files (`people.fixture.ts`, `content.fixture.ts`, `engagement.fixture.ts`) — ~90 lines producing **1100+
rows**: users, a follow graph, posts, tags, a post↔tag many-to-many, threaded
comments, and likes — all deterministic.

## Run it

```bash
bun install
bun run seed
bun run verify
```

```
✓ seeded 1113 rows (seed 42)
  tag → tags: 12        user → users: 81      post → posts: 120
  follow → follows: 150 postTag → post_tags: 200
  comment → comments: 150  reply → comments: 100  like → likes: 300
✓ reproducible: two runs with seed 42 produced byte-identical data
```

## Concepts shown

- **Nested refs inside JSON** — `posts.metadata` is a JSON column, and
  `metadata.pinnedBy` is a `ref("user", "ada")`. drizzle-saat resolves refs nested in
  objects/arrays, not just top-level columns:
  ```json
  { "lang": "en", "pinnedBy": 1 }      // ← the ref became Ada's user id
  ```
- **Two namespaces, one table** — `comment` (roots) and `reply` both write into
  `comments`; replies point at a root via `ref("comment").random()`, so drizzle-saat
  inserts roots first.
- **Self-referential & many-to-many edges** — `follows` (user→user) and
  `post_tags` (post↔tag) join via surrogate-id tables.
- **Big graph, tiny code** — ~90 lines of fixtures, 1100+ coherent rows.

## A note on self-referential foreign keys

`comments.parentId` is modelled as a *soft* reference (no Drizzle
`.references()`), and ordering is driven by `ref("comment")` instead. A declared
self-FK on a table that has two namespaces makes drizzle-saat's FK ordering report a
false cycle (`comment → reply → comment`); the soft-reference + ref approach
keeps the graph acyclic while the DDL still enforces the constraint.
