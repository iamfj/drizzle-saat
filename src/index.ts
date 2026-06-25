/**
 * saat — TypeScript-native, type-safe database seeding for Drizzle ORM.
 *
 * Public API surface. Fixtures import from here:
 *
 *   import { defineFixture, faker, ref } from 'saat'
 */

export { defineFixture, defineSeed } from "./fixtures/define.js";
export type {
  FixtureDef,
  SeedDef,
  SeedRowContext,
  RowInput,
  FieldInput,
} from "./fixtures/define.js";

export { ref, isRef, REF_MARKER } from "./refs/ref.js";
export type {
  Ref,
  RefKind,
  RefBuilder,
  RefValueOf,
  KeyOf,
  SaatNamespaces,
  SaatRefValues,
  SaatNamespaceKeys,
} from "./refs/ref.js";

export { faker } from "./faker.js";

export { defineConfig } from "./config/types.js";
export type { SaatUserConfig, ResolvedConfig } from "./config/types.js";

export type { Dialect } from "./types.js";

export { SaatError, CycleError, MissingReferenceError } from "./util/errors.js";

/** Programmatic seeding entry point (used by the CLI and available to users). */
export { seed } from "./engine/seed.js";
export type { SeedOptions, SeedReport } from "./engine/seed.js";
