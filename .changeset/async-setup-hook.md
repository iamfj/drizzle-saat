---
"drizzle-saat": minor
---

First-class async fixtures. Top-level `await` in a fixture module is now a
documented, supported pattern (the cleanest way to compute a fully-typed shared
value). In addition, `defineFixture` accepts an optional async `setup()` hook
that runs once before row generation; its resolved value is passed to each
`data()` as `ctx.setup` (typed `unknown` — annotate or cast). `SeedRowContext`
gains the `setup` field.
