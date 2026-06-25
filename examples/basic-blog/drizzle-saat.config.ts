import { defineConfig } from "drizzle-saat";

export default defineConfig({
  // Fixtures live in ./drizzle-saat (the default). `seed` makes every run reproducible:
  // the same seed always produces the exact same rows.
  seed: 42,
});
