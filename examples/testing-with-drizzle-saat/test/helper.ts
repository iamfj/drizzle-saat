import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { seed } from "drizzle-saat";
import { DDL } from "../db/setup";

/**
 * Build a fresh in-memory database and seed it with drizzle-saat. Each call is fully
 * isolated, so every test gets its own realistic, deterministic dataset.
 */
export async function seededDb(seedValue = 42): Promise<Database> {
  const client = new Database(":memory:");
  client.exec(DDL);
  await seed({ dbCredentials: { db: drizzle(client) }, seed: seedValue });
  return client;
}
