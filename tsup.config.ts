import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  shims: true,
  target: "node20",
  // drizzle-orm and the DB drivers are peer/runtime deps — never bundle them.
  external: [
    "drizzle-orm",
    "@faker-js/faker",
    "better-sqlite3",
    "@electric-sql/pglite",
    "mysql2",
    "postgres",
    "pg",
    "@libsql/client",
  ],
});
