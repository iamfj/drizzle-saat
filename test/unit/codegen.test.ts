import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { generateTypes } from "../../src/codegen/generate.js";
import { resolveConfig } from "../../src/config/load.js";
import { SaatError } from "../../src/util/errors.js";
import { SAAT_SRC, rmProject, writeProject } from "../helpers/project.js";

const SCHEMA = `
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
});
`;

const DRIZZLE_CONFIG = `export default { dialect: "sqlite", schema: "./db/schema.ts", dbCredentials: { url: ":memory:" } };`;

const fixture = `
import { defineFixture } from ${JSON.stringify(SAAT_SRC)};
import { users, posts } from "../db/schema";
export default defineFixture({
  seeds: [
    { table: posts, namespace: "post", count: 1, data: () => ({ title: "t" }) },
    { table: users, namespace: "user", count: 1, data: () => ({ name: "n" }),
      rows: { admin: { name: "A" }, root: { name: "R" } } },
  ],
});`;

let cwd: string | undefined;
afterEach(() => {
  if (cwd) rmProject(cwd);
  cwd = undefined;
});

describe("generateTypes", () => {
  test("emits a sorted module augmentation for all namespaces", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": DRIZZLE_CONFIG,
      "drizzle-saat/fixtures.fixture.ts": fixture,
    });
    const config = await resolveConfig({ cwd });
    const result = await generateTypes(config);

    expect(result.namespaces.sort()).toEqual(["post", "user"]);
    const out = readFileSync(result.path, "utf8");

    expect(out).toContain('declare module "drizzle-saat"');
    expect(out).toContain("interface SaatNamespaces");
    expect(out).toContain('import type { InferSelectModel } from "drizzle-orm";');
    // One import alias for the single shared schema file.
    expect(out).toContain("import type * as __schema_0 from");
    // Namespaces are emitted in sorted order.
    expect(out.indexOf('"post"')).toBeLessThan(out.indexOf('"user"'));
    expect(out).toContain("InferSelectModel<typeof __schema_0.users>");
    expect(out).toContain("InferSelectModel<typeof __schema_0.posts>");

    // Value-aware refs: SaatRefValues maps each single-PK namespace to its PK type.
    expect(out).toContain("interface SaatRefValues");
    expect(out).toContain('"user": InferSelectModel<typeof __schema_0.users>["id"]');
    expect(out).toContain('"post": InferSelectModel<typeof __schema_0.posts>["id"]');

    // Keyed-row keys: SaatNamespaceKeys maps namespaces with `rows` to their keys.
    expect(out).toContain("interface SaatNamespaceKeys");
    expect(out).toContain('"user": "admin" | "root";');
    // a namespace without keyed rows is omitted (falls back to `string`)
    expect(out).not.toContain('"post": "');
  });

  test("throws when there are no fixtures", async () => {
    cwd = writeProject({
      "db/schema.ts": SCHEMA,
      "drizzle.config.ts": DRIZZLE_CONFIG,
      "drizzle-saat/.keep": "",
    });
    const config = await resolveConfig({ cwd });
    expect(generateTypes(config)).rejects.toThrow(SaatError);
  });

  test("allocates one import alias per schema file and omits composite-PK namespaces from ref values", async () => {
    cwd = writeProject({
      "db/a.ts": `import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
});`,
      "db/b.ts": `import { integer, sqliteTable, primaryKey } from "drizzle-orm/sqlite-core";
export const membership = sqliteTable("membership", {
  userId: integer("user_id").notNull(),
  groupId: integer("group_id").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.groupId] })]);`,
      "drizzle.config.ts": `export default { dialect: "sqlite", schema: "./db", dbCredentials: { url: ":memory:" } };`,
      "drizzle-saat/fixtures.fixture.ts": `import { defineFixture } from ${JSON.stringify(SAAT_SRC)};
import { users } from "../db/a";
import { membership } from "../db/b";
export default defineFixture({ seeds: [
  { table: users, namespace: "user", count: 1, data: () => ({ name: "n" }) },
  { table: membership, namespace: "member", rows: { x: { userId: 1, groupId: 2 } } },
] });`,
    });
    const config = await resolveConfig({ cwd });
    const result = await generateTypes(config);
    const out = readFileSync(result.path, "utf8");

    // Two distinct schema files → two import aliases.
    expect(out).toContain("import type * as __schema_0 from");
    expect(out).toContain("import type * as __schema_1 from");
    // Composite-PK namespace appears in SaatNamespaces…
    expect(out).toContain('"member": InferSelectModel<typeof');
    // …but is omitted from SaatRefValues (no single id to resolve to).
    expect(out).not.toContain('"member": InferSelectModel<typeof __schema_0.membership>[');
    expect(out).not.toContain('"member": InferSelectModel<typeof __schema_1.membership>[');
    // Its keyed row key is still emitted.
    expect(out).toContain('"member": "x";');
  });
});
