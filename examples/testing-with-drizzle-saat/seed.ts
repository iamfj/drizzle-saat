// Runnable demo: build a fresh SQLite DB, then let drizzle-saat seed it.
//
//   bun run seed       # seed dev.db and print a report
//   bun run verify     # prove the seed is reproducible (seed twice, diff)
//
// Uses Bun's built-in `bun:sqlite` so it runs with zero native setup. In a real
// project you'd just run the `drizzle-saat` CLI against your real database instead —
// the fixtures in ./drizzle-saat don't change. See README.md.
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seed } from "drizzle-saat";
import { DDL } from "./db/setup";

const SEED = 42;

function freshDb(path = ":memory:") {
  const client = new Database(path);
  client.exec(DDL);
  return { client, db: drizzle(client) };
}

/** Schema-agnostic snapshot of every table, for the reproducibility check. */
function dumpAll(c: Database): Record<string, unknown[]> {
  const tables = c
    .query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all() as { name: string }[];
  const out: Record<string, unknown[]> = {};
  for (const { name } of tables)
    out[name] = c.query(`SELECT * FROM "${name}" ORDER BY rowid`).all();
  return out;
}

if (process.argv.includes("--verify")) {
  // Same seed → identical data, every time.
  const a = freshDb();
  const b = freshDb();
  await seed({ dbCredentials: { db: a.db }, seed: SEED });
  await seed({ dbCredentials: { db: b.db }, seed: SEED });
  const same = JSON.stringify(dumpAll(a.client)) === JSON.stringify(dumpAll(b.client));
  console.log(
    same
      ? `✓ reproducible: two runs with seed ${SEED} produced byte-identical data`
      : "✗ runs diverged!",
  );
  process.exit(same ? 0 : 1);
} else {
  const { db } = freshDb("dev.db");
  const report = await seed({ dbCredentials: { db }, seed: SEED });
  console.log(`✓ seeded ${report.total} rows (seed ${report.seed}) in ${report.durationMs}ms`);
  for (const { namespace, table, count } of report.inserted) {
    console.log(`  ${namespace} → ${table}: ${count}`);
  }
}
