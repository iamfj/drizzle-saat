# Contributing to saat

Thanks for your interest in improving `saat`! This project uses
[Bun](https://bun.sh) as its package manager and test runner.

By participating, you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting started

```bash
git clone https://github.com/iamfj/saat.git
cd saat
bun install
```

## Useful scripts

| Command                 | What it does                                  |
| ----------------------- | --------------------------------------------- |
| `bun run build`         | Build the library + CLI with tsup.            |
| `bun run typecheck`     | `tsc --noEmit`.                               |
| `bun run check`         | Biome lint + format check.                    |
| `bun run format`        | Auto-format with Biome.                       |
| `bun test`              | Run unit + in-process DB tests.               |
| `bun run test:integration` | Also run dialect integration tests.       |

## Architecture

The engine internals cover config resolution, introspection, planning,
reference resolution, dialect adapters, and codegen. Public contracts live in
`src/types.ts`, `src/config/types.ts`, `src/refs/ref.ts`, and
`src/fixtures/define.ts`.

## Testing against databases

- **SQLite** and **Postgres** tests run fully in-process via `better-sqlite3`
  and [`@electric-sql/pglite`](https://github.com/electric-sql/pglite) — no
  Docker required. These run on every `bun test`.
- **MySQL** integration tests are gated behind `INTEGRATION=1` and need a
  reachable MySQL (set `MYSQL_URL`). They run in CI via a service container.

When adding behavior that branches per dialect, add coverage for all three.

## Code style

- TypeScript, ESM, strict mode. Use `.js` specifiers in relative imports and
  `import type` for type-only imports (`verbatimModuleSyntax` is on).
- Formatting and linting are enforced by **Biome** (`bun run check`).
- All user-facing errors should be `SaatError` subclasses with a clear,
  actionable message.

## Pull requests

1. Branch off `main`.
2. Add a changeset describing your change: `bunx changeset`.
3. Make sure `bun run check`, `bun run typecheck`, and `bun test` pass.
4. Open the PR with a clear description and rationale.

## Releases

Releases are automated with [changesets](https://github.com/changesets/changesets).
Every user-facing change needs a changeset; CI publishes on merge to `main`.
