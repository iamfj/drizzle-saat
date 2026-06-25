import type { Jiti } from "jiti";
import { glob } from "tinyglobby";
import { SaatError } from "../util/errors.js";
import type { FixtureDef } from "./define.js";

export interface LoadedFixture {
  /** Absolute path of the fixture file. */
  file: string;
  fixture: FixtureDef;
}

function isFixtureDef(value: unknown): value is FixtureDef {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { seeds?: unknown }).seeds)
  );
}

/**
 * Discover and load every fixture in `fixturesDir`. Files are globbed in a
 * stable, sorted order so seeding is deterministic. Each fixture must
 * default-export a {@link FixtureDef}.
 */
export async function loadFixtures(fixturesDir: string, jiti: Jiti): Promise<LoadedFixture[]> {
  const files = (
    await glob("**/*.{ts,mts,cts,js,mjs}", {
      cwd: fixturesDir,
      absolute: true,
      dot: false,
    })
  )
    .filter((f) => !f.endsWith(".d.ts"))
    .sort();

  const fixtures: LoadedFixture[] = [];
  for (const file of files) {
    const fixture = (await jiti.import(file, { default: true })) as unknown;
    if (!isFixtureDef(fixture)) {
      throw new SaatError(
        `${file} does not default-export a fixture. Use \`export default defineFixture({ seeds: [...] })\`.`,
      );
    }
    fixtures.push({ file, fixture });
  }
  return fixtures;
}
