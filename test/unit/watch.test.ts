import { afterEach, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ResolvedConfig } from "../../src/config/types.js";
import { type Watcher, watchFixtures } from "../../src/watch.js";
import { rmProject, writeProject } from "../helpers/project.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll `cond` until true or `timeout` elapses; throws on timeout. */
async function waitFor(cond: () => boolean, timeout = 3000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeout) throw new Error("waitFor timed out");
    await sleep(20);
  }
}

let cwd: string | undefined;
let watcher: Watcher | undefined;
afterEach(async () => {
  await watcher?.close();
  watcher = undefined;
  if (cwd) rmProject(cwd);
  cwd = undefined;
});

describe("watchFixtures", () => {
  test("fires on ready and on fixture edits, ignores generated .d.ts, stops on close", async () => {
    cwd = writeProject({ "drizzle-saat/a.ts": "export default { seeds: [] };" });
    const dir = join(cwd, "drizzle-saat");
    let calls = 0;
    const config = { fixturesDir: dir, schemaPaths: [] } as unknown as ResolvedConfig;
    watcher = watchFixtures(config, () => {
      calls++;
    });

    // Fires once when the watcher becomes ready.
    await waitFor(() => calls >= 1);
    const afterReady = calls;

    // Editing a fixture triggers a (debounced) regeneration.
    writeFileSync(join(dir, "a.ts"), "export default { seeds: [], changed: true };");
    await waitFor(() => calls > afterReady);
    const afterEdit = calls;

    // Writing a generated .d.ts must NOT trigger a regeneration (no infinite loop).
    writeFileSync(join(dir, "types.d.ts"), "export const x = 1;");
    await sleep(400);
    expect(calls).toBe(afterEdit);

    // After close, further edits are ignored.
    await watcher.close();
    watcher = undefined;
    writeFileSync(join(dir, "a.ts"), "export default { seeds: [], again: true };");
    await sleep(300);
    expect(calls).toBe(afterEdit);
  });
});
