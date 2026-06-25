import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Determinism guard against the BUILT artifact. The unit/e2e tests import from
 * `src/` — a single shared module — so they cannot catch a regression where the
 * `cli` and `index` bundles each carry their own faker state (the D1 release
 * blocker). This test runs the compiled CLI (`dist/cli.js`, the engine bundle)
 * against the example whose fixtures `import { faker } from "drizzle-saat"` (the `index`
 * bundle), exercising the real cross-bundle path.
 *
 * Requires `bun run build` first; skips otherwise (and `bun test` alone).
 */
const REPO = resolve(import.meta.dir, "../..");
const CLI = resolve(REPO, "dist/cli.js");
// A self-owned fixture project (not examples/, which are user-facing docs).
const EXAMPLE = resolve(REPO, "test/e2e/cli-project");
const DB = resolve(EXAMPLE, "dev.db");
const SAAT_LINK = resolve(REPO, "node_modules/drizzle-saat");
const RUN = existsSync(CLI);

function createTables() {
  rmSync(DB, { force: true });
  const db = new Database(DB);
  db.exec(
    "CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT, email TEXT NOT NULL)",
  );
  db.exec(
    "CREATE TABLE posts (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL, author_id INTEGER NOT NULL REFERENCES users(id))",
  );
  db.close();
}

/** Seed via the built CLI, then read back the generated user rows. */
function seedAndRead(seed: number): { first_name: string; email: string }[] {
  execFileSync("node", [CLI, "--seed", String(seed)], { cwd: EXAMPLE, stdio: "pipe" });
  const db = new Database(DB, { readonly: true });
  const rows = db.query("SELECT first_name, email FROM users ORDER BY id").all() as {
    first_name: string;
    email: string;
  }[];
  db.close();
  return rows;
}

beforeAll(() => {
  if (!RUN) return;
  if (!existsSync(SAAT_LINK)) symlinkSync(REPO, SAAT_LINK, "dir");
  createTables();
});

afterAll(() => {
  if (!RUN) return;
  rmSync(DB, { force: true });
  rmSync(resolve(EXAMPLE, ".drizzle-saat"), { recursive: true, force: true });
  try {
    unlinkSync(SAAT_LINK);
  } catch {
    /* ignore */
  }
});

describe.skipIf(!RUN)("built CLI determinism (real bundles)", () => {
  test("same seed → identical faker output across cli/index bundles", () => {
    const a = seedAndRead(7);
    const b = seedAndRead(7);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
    // Guard against the de-seed regression: faker must not be the unseeded
    // fallback (which would still be internally consistent run-to-run only by
    // luck) — assert the values are real generated strings.
    expect(a[0]!.first_name.length).toBeGreaterThan(0);
  });

  test("different seeds → different faker output", () => {
    const a = seedAndRead(7);
    const c = seedAndRead(8);
    expect(c).not.toEqual(a);
  });
});
