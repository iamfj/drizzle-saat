---
"drizzle-saat": minor
---

Add deterministic time and configurable Faker locale.

- **`now()`** — a new exported helper that returns a fixed base time for the
  duration of a seeding run (so timestamps stay reproducible), with an optional
  millisecond offset for ordering: `now(index * 1000)`. The base is configurable
  via `now` in `drizzle-saat.config.ts` (a `Date`, epoch ms, or date string;
  default 2024-01-01T00:00:00.000Z). Outside a run it falls back to the wall
  clock. Use it instead of `() => new Date()` for seed-reproducible timestamps.
- **`locale`** config — set the Faker locale(s) for generated data (e.g.
  `import { de } from "@faker-js/faker"; export default defineConfig({ locale: de })`).
  A single locale uses `en`/`base` as fallbacks; pass an array to control the
  chain. Defaults to English.

Note: Drizzle already applies app-level column defaults (`$default`,
`$defaultFn`, `$onUpdate`) on insert, and those columns are optional in
fixtures — no need to restate `createdAt`/`updatedAt`.
