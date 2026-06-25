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

const SOURCE_EXTS = "{ts,mts,cts,js,mjs}";

/**
 * Discover and load every fixture in `fixturesDir`. Only files matching
 * `*.fixture.{ts,mts,cts,js,mjs}` are loaded, so shared catalogs / helpers can
 * live alongside fixtures without being globbed. Files are loaded in a stable,
 * sorted order so seeding is deterministic. Each one must default-export a
 * {@link FixtureDef}.
 */
export async function loadFixtures(fixturesDir: string, jiti: Jiti): Promise<LoadedFixture[]> {
  const files = (
    await glob(`**/*.fixture.${SOURCE_EXTS}`, {
      cwd: fixturesDir,
      absolute: true,
      dot: false,
    })
  )
    .filter((f) => !f.endsWith(".d.ts"))
    .sort();

  // Migration guard: if there are source files but none follow the convention,
  // fail loudly instead of silently seeding nothing.
  if (files.length === 0) {
    const candidates = (
      await glob(`**/*.${SOURCE_EXTS}`, { cwd: fixturesDir, absolute: true, dot: false })
    ).filter((f) => !f.endsWith(".d.ts"));
    if (candidates.length > 0) {
      throw new SaatError(
        `no \`*.fixture.${SOURCE_EXTS}\` files found in ${fixturesDir}, but ${candidates.length} ` +
          "other source file(s) are present. drizzle-saat only loads fixtures named " +
          "`*.fixture.*` — rename them (e.g. `users.ts` → `users.fixture.ts`).",
      );
    }
  }

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
