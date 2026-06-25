// drizzle-saat reads your dialect, schema location, and DB credentials straight from
// the drizzle config — no separate drizzle-saat-side DB setup. (In a real project this
// is usually `import { defineConfig } from "drizzle-kit"`.)
export default {
  dialect: "sqlite",
  schema: "./db/schema.ts",
  dbCredentials: { url: "file:./dev.db" },
};
