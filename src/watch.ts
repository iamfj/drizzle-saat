import { watch } from "chokidar";
import type { ResolvedConfig } from "./config/types.js";

export interface Watcher {
  close: () => Promise<void>;
}

/**
 * Watch the fixtures directory and schema files; invoke `onChange` (debounced)
 * whenever something changes, plus once when the watcher is ready.
 */
export function watchFixtures(
  config: ResolvedConfig,
  onChange: () => void | Promise<void>,
): Watcher {
  const watcher = watch([config.fixturesDir, ...config.schemaPaths], {
    ignoreInitial: true,
    ignored: (path) => path.endsWith(".d.ts"),
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void onChange(), 100);
  };

  watcher.on("ready", () => void onChange());
  watcher.on("add", trigger);
  watcher.on("change", trigger);
  watcher.on("unlink", trigger);

  return {
    close: async () => {
      if (timer) clearTimeout(timer);
      await watcher.close();
    },
  };
}
