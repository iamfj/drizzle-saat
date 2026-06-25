import { afterEach, describe, expect, test } from "bun:test";
import { createLoader } from "../../src/config/load.js";
import { loadFixtures } from "../../src/fixtures/load.js";
import { SaatError } from "../../src/util/errors.js";
import { SAAT_SRC, rmProject, writeProject } from "../helpers/project.js";

const FIX = `import { defineFixture } from ${JSON.stringify(SAAT_SRC)};
export default defineFixture({ seeds: [] });`;

let cwd: string | undefined;
afterEach(() => {
  if (cwd) rmProject(cwd);
  cwd = undefined;
});

describe("loadFixtures", () => {
  test("loads *.fixture.* in stable sorted order and skips .d.ts files", async () => {
    cwd = writeProject({
      "drizzle-saat/b.fixture.ts": FIX,
      "drizzle-saat/a.fixture.ts": FIX,
      "drizzle-saat/nested/c.fixture.ts": FIX,
      "drizzle-saat/types.d.ts": "export const x = 1;",
    });
    const loaded = await loadFixtures(`${cwd}/drizzle-saat`, createLoader());
    const names = loaded.map((f) => f.file.replace(`${cwd}/drizzle-saat/`, ""));
    expect(names).toEqual(["a.fixture.ts", "b.fixture.ts", "nested/c.fixture.ts"]);
  });

  test("ignores non-fixture files so helpers/catalogs can colocate", async () => {
    cwd = writeProject({
      "drizzle-saat/users.fixture.ts": FIX,
      // Plain modules without a default fixture export — must be skipped, not error.
      "drizzle-saat/data.ts": "export const SHARED = 1;",
      "drizzle-saat/helpers.ts": "export function h() { return 2; }",
    });
    const loaded = await loadFixtures(`${cwd}/drizzle-saat`, createLoader());
    const names = loaded.map((f) => f.file.replace(`${cwd}/drizzle-saat/`, ""));
    expect(names).toEqual(["users.fixture.ts"]);
  });

  test("throws a pointed error when a *.fixture file does not default-export a fixture", async () => {
    cwd = writeProject({ "drizzle-saat/bad.fixture.ts": "export default 42;" });
    expect(loadFixtures(`${cwd}/drizzle-saat`, createLoader())).rejects.toThrow(SaatError);
    expect(loadFixtures(`${cwd}/drizzle-saat`, createLoader())).rejects.toThrow(
      /does not default-export a fixture/,
    );
  });

  test("throws a migration hint when source files exist but none match *.fixture.*", async () => {
    cwd = writeProject({ "drizzle-saat/users.ts": FIX, "drizzle-saat/posts.ts": FIX });
    expect(loadFixtures(`${cwd}/drizzle-saat`, createLoader())).rejects.toThrow(SaatError);
    expect(loadFixtures(`${cwd}/drizzle-saat`, createLoader())).rejects.toThrow(
      /only loads fixtures named `\*\.fixture\.\*`/,
    );
  });

  test("returns an empty list for a directory with no source files", async () => {
    cwd = writeProject({ "drizzle-saat/.keep": "" });
    const loaded = await loadFixtures(`${cwd}/drizzle-saat`, createLoader());
    expect(loaded).toEqual([]);
  });
});
