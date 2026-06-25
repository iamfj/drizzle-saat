# analytics-events (mid-large) — scenarios & volume

One schema (workspaces → users → events), **three datasets** selected by
`--scenario`:

| run | fixtures included | events |
|-----|-------------------|--------|
| `bun run seed` (base) | scenario-less only | 50 |
| `--scenario load` | base **+** `load.ts` | 5,050 |
| `--scenario e2e` | base **+** `e2e.ts` | 52 |

**Bare run seeds the scenario-less base; `--scenario X` *adds* the X-tagged
fixtures on top.** Same base, different overlays — for local dev, load testing,
and deterministic end-to-end tests respectively.

## Run it

```bash
bun install
bun run seed                    # base dataset (50 events)
bun run seed -- --scenario load # base + 5,000 load-test events
bun run scenarios               # print counts for base / load / e2e
bun run verify                  # base is identical across two seed-42 runs
```

```
scenario=(base) → workspaces=4 users=13 events=50
scenario=load   → workspaces=4 users=13 events=5050
scenario=e2e    → workspaces=4 users=13 events=52
✓ reproducible: two base runs with seed 42 are identical
```

## Concepts shown

- **Scenarios** — `defineFixture({ scenario: "load", … })` tags a whole fixture;
  it only seeds when that scenario is requested. The base always seeds.
- **High volume, still fast & reproducible** — 5,000 generated events from one
  `data()` factory, byte-identical for a fixed seed.
- **Shared base across scenarios** — `load`/`e2e` fixtures reference the base
  `workspace`/`user` namespaces; you don't redefine them.
- **JSON `properties`** generated per event.

With the real CLI this is just `npx saat`, `npx saat --scenario load`, etc.
