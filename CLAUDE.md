# CLAUDE.md

@AGENTS.md

The shared agent guidance lives in [AGENTS.md](./AGENTS.md) (imported above).
This file adds Claude Code–specific notes and overrides.

## Claude Code notes

- Prefer running a **single test file** over the whole suite while iterating:
  `bun test test/unit/<name>.test.ts`. Run the full `bun test` before wrapping up.
- After a series of changes, **typecheck** (`bun run typecheck`) and run
  `bun run check` — these are the CI gates.
- This repo uses Biome, not Prettier/ESLint. Don't hand-format; run
  `bun run format`.

## IMPORTANT: commit attribution

**Do not add yourself as a commit co-author or author.** Do not append a
`Co-Authored-By: Claude ...` trailer to commit messages, and do not set
AI tooling as the author/committer. This overrides the default Claude Code
behavior of adding a co-author trailer. Commit authorship is the human
contributor only. (See the Appendix in [AGENTS.md](./AGENTS.md).)
