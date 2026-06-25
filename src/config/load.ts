import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { type Jiti, createJiti } from "jiti";
import { glob } from "tinyglobby";
import { DEFAULT_CLOCK_BASE } from "../clock.js";
import type { Dialect } from "../types.js";
import { SaatError } from "../util/errors.js";
import { log } from "../util/log.js";
import type { DrizzleConfigSlice, ResolvedConfig, SaatUserConfig } from "./types.js";

/** Resolve the configured `now` base time (Date / epoch ms / string) to epoch ms. */
function resolveClockBase(now: SaatUserConfig["now"]): number {
  if (now === undefined) return DEFAULT_CLOCK_BASE;
  const ms = now instanceof Date ? now.getTime() : typeof now === "number" ? now : Date.parse(now);
  if (Number.isNaN(ms)) {
    throw new SaatError(`invalid \`now\` in drizzle-saat config: ${JSON.stringify(now)}.`);
  }
  return ms;
}

const SAAT_CONFIG_NAMES = [
  "drizzle-saat.config.ts",
  "drizzle-saat.config.mjs",
  "drizzle-saat.config.js",
];
const DRIZZLE_CONFIG_NAMES = ["drizzle.config.ts", "drizzle.config.mjs", "drizzle.config.js"];

/**
 * Create the jiti instance used to import user TS at runtime.
 *
 * Pass `{ fresh: true }` to disable jiti's module/fs caches. This is essential
 * for watch mode: a cached loader re-imports an edited fixture from cache and
 * returns its stale contents, so `--watch` would regenerate types that never
 * reflect the change. A fresh loader re-evaluates the file on every import.
 */
export function createLoader(opts: { fresh?: boolean } = {}): Jiti {
  return createJiti(import.meta.url, {
    interopDefault: true,
    ...(opts.fresh ? { moduleCache: false, fsCache: false } : {}),
  });
}

function findFirst(cwd: string, names: string[]): string | undefined {
  for (const name of names) {
    const full = resolve(cwd, name);
    if (existsSync(full)) return full;
  }
  return undefined;
}

/** Map a drizzle-kit dialect string onto drizzle-saat's supported {@link Dialect}. */
function normalizeDialect(dialect: string): Dialect {
  switch (dialect) {
    case "postgresql":
    case "postgres":
      return "postgresql";
    case "mysql":
      return "mysql";
    case "sqlite":
    case "turso":
    case "libsql":
      return "sqlite";
    default:
      throw new SaatError(
        `unsupported drizzle dialect "${dialect}". drizzle-saat v1 supports postgresql, mysql, and sqlite (incl. turso).`,
      );
  }
}

/** Ensure a dynamically-imported config module is a usable object. */
function assertConfigObject<T>(imported: unknown, path: string, label: string): T {
  if (imported === null || typeof imported !== "object") {
    throw new SaatError(
      `${label} at ${path} did not export a config object (got ${imported === null ? "null" : typeof imported}). ` +
        "Make sure it has a default export, e.g. `export default defineConfig({ … })`.",
    );
  }
  return imported as T;
}

/** Read the `"drizzle-saat"` key from package.json, if present. */
async function readPackageJsonConfig(cwd: string): Promise<SaatUserConfig | undefined> {
  const pkgPath = resolve(cwd, "package.json");
  if (!existsSync(pkgPath)) return undefined;
  try {
    const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
    return pkg["drizzle-saat"] as SaatUserConfig | undefined;
  } catch (err) {
    log.warn(`could not read the "drizzle-saat" key from package.json: ${(err as Error).message}`);
    return undefined;
  }
}

/** Expand a drizzle `schema` entry (file, dir, or glob) to absolute file paths. */
async function expandSchema(schema: string | string[] | undefined, cwd: string): Promise<string[]> {
  if (!schema) {
    throw new SaatError(
      "drizzle.config has no `schema` path. drizzle-saat needs it to introspect your tables.",
    );
  }
  const patterns = (Array.isArray(schema) ? schema : [schema]).map((entry) => {
    const abs = isAbsolute(entry) ? entry : resolve(cwd, entry);
    // A bare directory: glob its TS/JS files. A file or glob: use as-is.
    if (existsSync(abs) && !/[*?{}[\]]/.test(entry)) {
      // Heuristic: directories have no extension.
      if (!/\.[cm]?[jt]s$/.test(abs)) return `${abs.replace(/\/$/, "")}/**/*.{ts,mts,cts,js,mjs}`;
    }
    return abs;
  });
  const files = await glob(patterns, { absolute: true, dot: false });
  const filtered = files.filter((f) => !f.endsWith(".d.ts")).sort();
  if (filtered.length === 0) {
    throw new SaatError(`drizzle.config \`schema\` matched no files: ${JSON.stringify(schema)}`);
  }
  return filtered;
}

export interface ResolveConfigOptions {
  cwd?: string;
  /** Explicit path to drizzle-saat.config (CLI `--config`). */
  configPath?: string;
}

/**
 * Resolve the full drizzle-saat configuration by combining the user's drizzle config
 * (dialect, schema, credentials) with drizzle-saat-specific settings.
 */
export async function resolveConfig(opts: ResolveConfigOptions = {}): Promise<ResolvedConfig> {
  const cwd = resolve(opts.cwd ?? process.cwd());
  const jiti = createLoader();

  // 1. drizzle-saat-specific config. The package.json "drizzle-saat" key is the base; a
  //    drizzle-saat.config file overlays it per-field (file wins, but unset fields fall
  //    back to package.json rather than being wiped out).
  const packageConfig = (await readPackageJsonConfig(cwd)) ?? {};
  let fileConfig: SaatUserConfig = {};
  const saatConfigPath = opts.configPath
    ? resolve(cwd, opts.configPath)
    : findFirst(cwd, SAAT_CONFIG_NAMES);
  if (saatConfigPath) {
    if (!existsSync(saatConfigPath)) {
      throw new SaatError(`drizzle-saat config not found at ${saatConfigPath}`);
    }
    const imported = await jiti.import(saatConfigPath, { default: true });
    fileConfig = assertConfigObject(imported, saatConfigPath, "drizzle-saat config");
  }
  const userConfig: SaatUserConfig = { ...packageConfig, ...fileConfig };

  // 2. drizzle config (dialect, schema, credentials).
  const drizzleConfigPath = userConfig.drizzleConfig
    ? resolve(cwd, userConfig.drizzleConfig)
    : findFirst(cwd, DRIZZLE_CONFIG_NAMES);
  if (!drizzleConfigPath || !existsSync(drizzleConfigPath)) {
    throw new SaatError(
      "could not find drizzle.config.ts. drizzle-saat reads your dialect, schema, and credentials from it. " +
        "Set `drizzleConfig` in drizzle-saat.config.ts if it lives elsewhere.",
    );
  }
  const drizzleConfig = assertConfigObject<DrizzleConfigSlice>(
    await jiti.import(drizzleConfigPath, { default: true }),
    drizzleConfigPath,
    "drizzle config",
  );

  if (typeof drizzleConfig.dialect !== "string") {
    throw new SaatError(
      `drizzle config at ${drizzleConfigPath} has no \`dialect\` string. ` +
        "drizzle-saat needs it to pick the right database adapter.",
    );
  }
  const dialect = normalizeDialect(drizzleConfig.dialect);
  const schemaPaths = await expandSchema(drizzleConfig.schema, cwd);

  // 3. Apply defaults and absolutize paths.
  const fixturesDir = resolve(cwd, userConfig.fixtures ?? "drizzle-saat");
  const typesOut = resolve(cwd, userConfig.typesOut ?? ".drizzle-saat/types.d.ts");

  return {
    cwd,
    dialect,
    schemaPaths,
    dbCredentials: drizzleConfig.dbCredentials ?? {},
    fixturesDir,
    typesOut,
    seed: userConfig.seed ?? 1,
    chunkSize: userConfig.chunkSize,
    truncate: userConfig.truncate ?? "cascade",
    locale: userConfig.locale,
    clockBase: resolveClockBase(userConfig.now),
    drizzleConfigPath,
  };
}
