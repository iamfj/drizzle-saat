# saas-multitenant (mid-large)

A multi-tenant SaaS: **organizations** own **users** and **projects**;
**memberships** join users to projects via a **composite primary key**;
**invitations** track pending access. Five tables, every tenant-scoped row
wired through a ref.

Two fixture files (`drizzle-saat/tenants.ts`, `drizzle-saat/access.ts`) — ~80 lines — produce a
coherent multi-tenant dataset where every user, project, invitation, and
membership belongs to a real organization.

## Run it

```bash
bun install
bun run seed
bun run verify
```

```
✓ seeded 124 rows (seed 42)
  org → organizations: 6
  user → users: 62
  project → projects: 22
  invitation → invitations: 30
  membership → memberships: 4
✓ reproducible: two runs with seed 42 produced byte-identical data
```

## Concepts shown

- **Tenant scoping** — every `user`/`project`/`invitation` references an `org`,
  so the whole graph stays within valid tenants.
- **Composite primary key** — `memberships` is keyed on `(user_id, project_id)`.
  drizzle-saat introspects the composite PK and inserts it correctly.
- **Many-to-many done cleanly** — join rows are seeded as explicit keyed `rows`
  so each `(user, project)` pair is unique and deterministic. (Random
  many-to-many would risk duplicate composite keys; keyed rows avoid that.)
- **Composite-PK tables can't be ref targets** — a ref resolves to a single id,
  so you reference single-PK tables (`user`, `project`, `org`) and let the join
  table point at them, never the other way around.
