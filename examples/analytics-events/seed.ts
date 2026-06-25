// Demonstrates saat scenarios + seed reproducibility.
//
//   bun run seed                 # base dataset only (scenario-less)
//   bun run seed -- --scenario load   # base + 5,000 load-test events
//   bun run scenarios            # show row counts for base / load / e2e
//   bun run verify               # base is byte-identical across two seed-42 runs
//
// Bare run seeds scenario-less fixtures; `--scenario X` ADDS the X-tagged ones.
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seed } from "saat";
import { DDL } from "./db/setup";

const SEED = 42;

function freshDb(path = ":memory:") {
  const client = new Database(path);
  client.exec(DDL);
  return { client, db: drizzle(client) };
}

function count(c: Database, table: string): number {
  return (c.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
}

const args = process.argv.slice(2);

if (args.includes("--scenarios")) {
  for (const scenario of [undefined, "load", "e2e"] as const) {
    const { client, db } = freshDb();
    await seed({ dbCredentials: { db }, seed: SEED, scenario });
    console.log(
      `  scenario=${(scenario ?? "(base)").padEnd(6)} → workspaces=${count(client, "workspaces")} users=${count(client, "users")} events=${count(client, "events")}`,
    );
  }
} else if (args.includes("--verify")) {
  const dump = (c: Database) => c.query("SELECT * FROM events ORDER BY id").all();
  const a = freshDb();
  const b = freshDb();
  await seed({ dbCredentials: { db: a.db }, seed: SEED });
  await seed({ dbCredentials: { db: b.db }, seed: SEED });
  const same = JSON.stringify(dump(a.client)) === JSON.stringify(dump(b.client));
  console.log(
    same ? `✓ reproducible: two base runs with seed ${SEED} are identical` : "✗ diverged!",
  );
  process.exit(same ? 0 : 1);
} else {
  const i = args.indexOf("--scenario");
  const scenario = i >= 0 ? args[i + 1] : undefined;
  const { client, db } = freshDb("dev.db");
  const report = await seed({ dbCredentials: { db }, seed: SEED, scenario });
  console.log(
    `✓ seeded ${report.total} rows (seed ${report.seed}, scenario=${scenario ?? "(base)"})`,
  );
  console.log(`  events in db: ${count(client, "events")}`);
}
