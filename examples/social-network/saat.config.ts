import { defineConfig } from "saat";

export default defineConfig({
  // Fixtures live in ./saat (the default). `seed` makes every run reproducible:
  // the same seed always produces the exact same rows.
  seed: 42,
});
