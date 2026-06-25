import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/**
 * Absolute path to drizzle-saat's source entry. Temp-project fixtures import from here
 * so they share the exact module instance the engine loads (ref markers,
 * `setActiveFaker`, and Table identity all line up across the jiti boundary).
 */
export const SAAT_SRC = resolve(import.meta.dir, "../../src/index.ts");

const TMP_ROOT = resolve(import.meta.dir, "../.tmp");

/**
 * Write a throwaway project under `test/.tmp` (inside the repo, so `drizzle-orm`
 * resolves via the repo's node_modules). Returns its absolute cwd.
 */
export function writeProject(files: Record<string, string>): string {
  mkdirSync(TMP_ROOT, { recursive: true });
  const cwd = mkdtempSync(join(TMP_ROOT, "proj-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(cwd, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return cwd;
}

export function rmProject(cwd: string): void {
  rmSync(cwd, { recursive: true, force: true });
}
