import type { Dialect } from "../types.js";

/** Shape of the user's `saat.config.ts` (or the `"saat"` key in package.json). */
export interface SaatUserConfig {
  /** Fixture directory, relative to project root. Default: `saat`. */
  fixtures?: string;
  /** Default RNG seed. Default: `1`. */
  seed?: number;
  /** Path to `drizzle.config.ts` if non-standard. Auto-discovered otherwise. */
  drizzleConfig?: string;
  /** Output path for generated namespace types. Default: `.saat/types.d.ts`. */
  typesOut?: string;
  /** Override the per-dialect insert batch size. */
  chunkSize?: number;
}

/** Identity helper for type-safe `saat.config.ts` authoring. */
export function defineConfig(config: SaatUserConfig): SaatUserConfig {
  return config;
}

/**
 * The relevant slice of the user's `drizzle.config.ts`. Only the fields saat
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
  /** Absolute path to the resolved drizzle config. */
  drizzleConfigPath: string;
}
