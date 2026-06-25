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
  test("loads fixtures in stable sorted order and skips .d.ts files", async () => {
    cwd = writeProject({
      "saat/b.ts": FIX,
      "saat/a.ts": FIX,
      "saat/nested/c.ts": FIX,
      "saat/types.d.ts": "export const x = 1;",
    });
    const loaded = await loadFixtures(`${cwd}/saat`, createLoader());
    const names = loaded.map((f) => f.file.replace(`${cwd}/saat/`, ""));
    expect(names).toEqual(["a.ts", "b.ts", "nested/c.ts"]);
  });

  test("throws a pointed error when a file does not default-export a fixture", async () => {
    cwd = writeProject({ "saat/bad.ts": "export default 42;" });
    expect(loadFixtures(`${cwd}/saat`, createLoader())).rejects.toThrow(SaatError);
    expect(loadFixtures(`${cwd}/saat`, createLoader())).rejects.toThrow(
      /does not default-export a fixture/,
    );
  });

  test("returns an empty list for a directory with no fixtures", async () => {
    cwd = writeProject({ "saat/.keep": "" });
    const loaded = await loadFixtures(`${cwd}/saat`, createLoader());
    expect(loaded).toEqual([]);
  });
});
