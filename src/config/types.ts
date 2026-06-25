import type { Dialect } from "../types.js";

/**
 * How drizzle-saat wipes tables before reseeding.
 *
 * - `"cascade"` (default): wipe fixtured tables *and* anything referencing them
 *   (Postgres `TRUNCATE … CASCADE`; FK-checks-off DELETE on MySQL/SQLite). A
 *   full reseed. Note the blast radius: dependents you didn't fixture are wiped
 *   too.
 * - `"restrict"`: wipe only the fixtured tables, in dependent-first order, and
 *   error if an unfixtured table still references one. Safer for partial seeds.
 * - `false`: don't wipe at all — append to existing data (test-factory mode).
 */
export type TruncateMode = "cascade" | "restrict" | false;

/** Shape of the user's `drizzle-saat.config.ts` (or the `"drizzle-saat"` key in package.json). */
export interface SaatUserConfig {
  /** Fixture directory, relative to project root. Default: `drizzle-saat`. */
  fixtures?: string;
  /** Default RNG seed. Default: `1`. */
  seed?: number;
  /** Path to `drizzle.config.ts` if non-standard. Auto-discovered otherwise. */
  drizzleConfig?: string;
  /** Output path for generated namespace types. Default: `.drizzle-saat/types.d.ts`. */
  typesOut?: string;
  /** Override the per-dialect insert batch size. */
  chunkSize?: number;
  /** How to wipe before reseeding. Default: `"cascade"`. See {@link TruncateMode}. */
  truncate?: TruncateMode;
}

/** Identity helper for type-safe `drizzle-saat.config.ts` authoring. */
export function defineConfig(config: SaatUserConfig): SaatUserConfig {
  return config;
}

/**
 * The relevant slice of the user's `drizzle.config.ts`. Only the fields drizzle-saat
 * needs; everything else is ignored.
 */
export interface DrizzleConfigSlice {
  dialect: string;
  schema?: string | string[];
  dbCredentials?: Record<string, any>;
  out?: string;
}

/** Fully-resolved configuration consumed by the engine. */
export interface ResolvedConfig {
  /** Absolute project root. */
  cwd: string;
  dialect: Dialect;
  /** Absolute, glob-expanded schema file paths. */
  schemaPaths: string[];
  /** Driver credentials from drizzle.config (url/host/etc). */
  dbCredentials: Record<string, any>;
  /** Absolute fixtures directory. */
  fixturesDir: string;
  /** Absolute path for generated types. */
  typesOut: string;
  /** Default seed (CLI `--seed` overrides at run time). */
  seed: number;
  /** Optional chunk-size override. */
  chunkSize?: number;
  /** How to wipe before reseeding. */
  truncate: TruncateMode;
  /** Absolute path to the resolved drizzle config. */
  drizzleConfigPath: string;
}
