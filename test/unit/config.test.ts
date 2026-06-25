import { afterEach, describe, expect, test } from "bun:test";
import { resolveConfig } from "../../src/config/load.js";
import { SaatError } from "../../src/util/errors.js";
import { rmProject, writeProject } from "../helpers/project.js";

const SCHEMA = `
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});
`;

function drizzleConfig(dialect: string): string {
  return `export default { dialect: ${JSON.stringify(dialect)}, schema: "./db/schema.ts", dbCredentials: { url: ":memory:" } };`;
}

let cwd: string | undefined;
afterEach(() => {
  if (cwd) rmProject(cwd);
  cwd = undefined;
});

describe("resolveConfig — dialect normalization", () => {
  test.each([
    ["postgres", "postgresql"],
    ["postgresql", "postgresql"],
    ["mysql", "mysql"],
    ["sqlite", "sqlite"],
    ["turso", "sqlite"],
    ["libsql", "sqlite"],
  ])("maps drizzle dialect %p to %p", async (input, expected) => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig(input),
    });
    const config = await resolveConfig({ cwd });
    expect(config.dialect).toBe(expected as "postgresql" | "mysql" | "sqlite");
  });

  test("throws on an unsupported dialect", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig("oracle"),
    });
    expect(resolveConfig({ cwd })).rejects.toThrow(/unsupported drizzle dialect/);
  });

  test("throws when dialect is missing", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": `export default { schema: "./db/schema.ts" };`,
    });
    expect(resolveConfig({ cwd })).rejects.toThrow(SaatError);
  });
});

describe("resolveConfig — sources & validation", () => {
  test('reads saat settings from the package.json "saat" key', async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig("sqlite"),
      "package.json": JSON.stringify({ name: "tmp", saat: { seed: 99, fixtures: "seeds" } }),
    });
    const config = await resolveConfig({ cwd });
    expect(config.seed).toBe(99);
    expect(config.fixturesDir.endsWith("/seeds")).toBe(true);
  });

  test("saat.config.ts wins over the package.json key", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig("sqlite"),
      "saat.config.ts": "export default { seed: 7 };",
      "package.json": JSON.stringify({ name: "tmp", saat: { seed: 99 } }),
    });
    const config = await resolveConfig({ cwd });
    expect(config.seed).toBe(7);
  });

  test("saat.config.ts overlays package.json per-field (unset fields fall back)", async () => {
    // File sets only `seed`; `fixtures` should still come from package.json
    // rather than being wiped out by the file taking over entirely.
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig("sqlite"),
      "saat.config.ts": "export default { seed: 7 };",
      "package.json": JSON.stringify({ name: "tmp", saat: { seed: 99, fixtures: "seeds" } }),
    });
    const config = await resolveConfig({ cwd });
    expect(config.seed).toBe(7); // file overrides
    expect(config.fixturesDir.endsWith("/seeds")).toBe(true); // package.json fills the gap
  });

  test("throws a clean error when saat.config exports a non-object", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig("sqlite"),
      "saat.config.ts": "export default 42;",
    });
    expect(resolveConfig({ cwd })).rejects.toThrow(/did not export a config object/);
  });

  test("throws when drizzle.config is absent", async () => {
    cwd = writeProject({ "db/schema.ts": SCHEMA });
    expect(resolveConfig({ cwd })).rejects.toThrow(/could not find drizzle\.config/);
  });

  test("throws when the schema glob matches no files", async () => {
    cwd = writeProject({
      "drizzle.config.ts": `export default { dialect: "sqlite", schema: "./db/missing.ts" };`,
    });
    expect(resolveConfig({ cwd })).rejects.toThrow(/matched no files/);
  });

  test("applies defaults for seed, fixtures, and typesOut", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": drizzleConfig("sqlite"),
    });
    const config = await resolveConfig({ cwd });
    expect(config.seed).toBe(1);
    expect(config.fixturesDir.endsWith("/saat")).toBe(true);
    expect(config.typesOut.endsWith("/.saat/types.d.ts")).toBe(true);
    expect(config.schemaPaths).toHaveLength(1);
  });
});
