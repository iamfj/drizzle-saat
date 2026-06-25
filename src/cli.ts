#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { cac } from "cac";
import { version } from "../package.json";
import { generateTypes } from "./codegen/generate.js";
import { createLoader, resolveConfig } from "./config/load.js";
import { type SeedReport, seed } from "./engine/seed.js";
import { SaatError } from "./util/errors.js";
import { log } from "./util/log.js";
import { type Watcher, watchFixtures } from "./watch.js";

const cli = cac("drizzle-saat");

interface CommonOptions {
  config?: string;
}

/**
 * Parse the `--seed` flag, rejecting anything that isn't an integer. `cac`
 * hands numeric-looking flags through as a `number`, so accept either form.
 */
export function parseSeed(value: string | number | undefined): number | undefined {
  if (value === undefined) return undefined;
  const text = String(value).trim();
  const n = Number(text);
  // Reject empty/whitespace (Number("") === 0) and non-integers like "1.5".
  if (text === "" || !Number.isInteger(n)) {
    throw new SaatError(`--seed must be an integer, got "${value}".`);
  }
  return n;
}

/** Run an async action, turning SaatErrors into clean exit-1 messages. */
async function run(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof SaatError) {
      log.error(err.message);
    } else {
      log.error(`unexpected error: ${(err as Error).message}`);
      if ((err as Error).stack) console.error((err as Error).stack);
    }
    process.exitCode = 1;
  }
}

function printReport(report: SeedReport): void {
  if (report.dryRun) {
    log.info(`dry run — ${report.total} rows would be inserted (seed ${report.seed}):`);
  } else {
    log.success(
      `seeded ${report.total} rows across ${report.inserted.length} namespaces ` +
        `(seed ${report.seed}) in ${report.durationMs}ms`,
    );
  }
  for (const { namespace, table, count } of report.inserted) {
    log.step(`${namespace} → ${table}  (${count})`);
  }
}

/** Block until SIGINT/SIGTERM, then close the watcher and resolve. */
async function waitForSignal(watcher: Watcher): Promise<void> {
  await new Promise<void>((resolveSignal) => {
    const shutdown = () => {
      log.info("stopping watcher…");
      void watcher.close().finally(() => resolveSignal());
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

async function generateOnce(config: Awaited<ReturnType<typeof resolveConfig>>): Promise<void> {
  const jiti = createLoader();
  const { path, namespaces } = await generateTypes(config, { jiti });
  log.info(`generated types for ${namespaces.length} namespaces → ${path}`);
}

// Default command: regenerate types, then seed.
cli
  .command("", "Wipe and reseed the database (regenerates types first)")
  .option("--scenario <name>", "Also run seeds tagged with this scenario (added to the base set)")
  .option("--seed <n>", "Override the RNG seed for this run")
  .option("--dry-run", "Resolve and order everything without writing")
  .option("--watch", "Regenerate types as fixtures change (does not seed)")
  .option("--config <path>", "Path to drizzle-saat.config.ts")
  .action(
    async (
      options: CommonOptions & {
        scenario?: string;
        seed?: string | number;
        dryRun?: boolean;
        watch?: boolean;
      },
    ) =>
      run(async () => {
        // Validate args before touching config so bad input fails with a
        // pointed message (not a downstream "couldn't find drizzle.config").
        const seedOverride = parseSeed(options.seed);
        const config = await resolveConfig({ configPath: options.config });

        if (options.watch) {
          await generateOnce(config);
          log.info("watching fixtures for changes… (Ctrl-C to stop)");
          const watcher = watchFixtures(config, () =>
            run(async () => {
              await generateTypes(config);
              log.info("types regenerated");
            }),
          );
          await waitForSignal(watcher);
          return;
        }

        await generateOnce(config);
        const report = await seed({
          configPath: options.config,
          scenario: options.scenario,
          seed: seedOverride,
          dryRun: options.dryRun,
        });
        printReport(report);
      }),
  );

// `drizzle-saat generate`: only (re)generate types.
cli
  .command("generate", "(Re)generate the namespace type definitions")
  .option("--watch", "Keep regenerating as fixtures change")
  .option("--config <path>", "Path to drizzle-saat.config.ts")
  .action(async (options: CommonOptions & { watch?: boolean }) =>
    run(async () => {
      const config = await resolveConfig({ configPath: options.config });
      await generateOnce(config);
      if (options.watch) {
        log.info("watching fixtures for changes… (Ctrl-C to stop)");
        const watcher = watchFixtures(config, () =>
          run(async () => {
            // Fresh (uncached) loader so edited fixtures are re-read, not served
            // stale from jiti's module cache.
            await generateTypes(config, { jiti: createLoader({ fresh: true }) });
            log.info("types regenerated");
          }),
        );
        await waitForSignal(watcher);
      }
    }),
  );

cli.help();
cli.version(version);

// Only consume argv when run as the actual CLI entry point. Guarding this keeps
// the module importable (e.g. by unit tests) without parsing the test runner's
// own argv and triggering a seed run.
const isEntry =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
  cli.parse();
}
