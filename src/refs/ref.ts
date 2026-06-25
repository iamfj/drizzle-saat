/**
 * References let a row point at another seeded row's primary key, across
 * fixture files. Three styles, all resolving to the referenced row's id:
 *
 *   ref('user').random()                     // any random row in the namespace
 *   ref('user', 'john')                      // direct lookup by explicit key
 *   ref('user').where({ firstName: 'John' }) // query lookup by field(s)
 */

/** Unique marker so the engine can distinguish refs from real column values. */
export const REF_MARKER = Symbol.for("saat.ref");

/** Phantom key carrying the value type a ref resolves to (type-level only). */
declare const REF_VALUE: unique symbol;

export type RefKind = "random" | "key" | "where";

/**
 * A resolved-at-seed-time placeholder embedded in row data. `V` is the type the
 * reference resolves to (the target's primary-key type), so a ref only type-checks
 * into a column of a compatible type. It is phantom — never present at runtime.
 */
export interface Ref<V = unknown> {
  readonly [REF_MARKER]: true;
  /** Phantom: the value type this ref resolves to. Not present at runtime. */
  readonly [REF_VALUE]?: V;
  readonly namespace: string;
  readonly kind: RefKind;
  /** For `kind: 'key'`. */
  readonly key?: string;
  /** For `kind: 'where'`. */
  readonly where?: Record<string, unknown>;
}

export function isRef(value: unknown): value is Ref {
  return typeof value === "object" && value !== null && (value as any)[REF_MARKER] === true;
}

/** True for `{}`-style objects — not Dates, class instances, arrays, or null. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Recursively collect every {@link Ref} embedded in a row's values, descending
 * into arrays and plain objects (e.g. JSON columns) but not into class
 * instances like `Date`. Shared by the planner (to derive dependency edges) and
 * the resolver (to substitute ids), so both agree on what counts as a ref.
 */
export function collectRefs(data: Record<string, unknown>): Ref[] {
  const out: Ref[] = [];
  const visit = (value: unknown): void => {
    if (isRef(value)) out.push(value);
    else if (Array.isArray(value)) for (const v of value) visit(v);
    else if (isPlainObject(value)) for (const v of Object.values(value)) visit(v);
  };
  for (const value of Object.values(data)) visit(value);
  return out;
}

function makeRef<V>(ref: {
  namespace: string;
  kind: RefKind;
  key?: string;
  where?: Record<string, unknown>;
}): Ref<V> {
  return { [REF_MARKER]: true, ...ref } as Ref<V>;
}

/**
 * Global registry of fixture namespaces and their row shapes. Codegen augments
 * this interface (via `declare module 'saat'`) so that `ref()` namespace
 * arguments and `.where()` predicates are type-checked and autocompleted across
 * files. Empty by default; falls back to permissive types before first codegen.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by generated .d.ts
export interface SaatNamespaces {}

/**
 * Per-namespace primary-key value type (e.g. `{ user: number }`). Codegen
 * augments this so a `ref('user')` is typed as the id it resolves to, and only
 * fits columns of a matching type. Empty by default → refs are permissive (`any`)
 * until the first `saat generate`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by generated .d.ts
export interface SaatRefValues {}

/**
 * Per-namespace union of keyed-row keys (e.g. `{ user: "alice" | "john" }`).
 * Codegen augments this so `ref(ns, key)` validates the key. Empty by default →
 * keys fall back to `string` (any key) before the first `saat generate`, and for
 * namespaces that define no keyed `rows`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: augmented by generated .d.ts
export interface SaatNamespaceKeys {}

type NamespaceName = keyof SaatNamespaces extends never ? string : keyof SaatNamespaces;

type RowOf<K> = K extends keyof SaatNamespaces ? SaatNamespaces[K] : Record<string, unknown>;

/** The value a `ref(K)` resolves to — its target's PK type, or `any` pre-codegen. */
export type RefValueOf<K> = K extends keyof SaatRefValues ? SaatRefValues[K] : any;

/** Valid keyed-row keys for `ref(K, key)` — the namespace's keys, or `string`. */
export type KeyOf<K> = K extends keyof SaatNamespaceKeys ? SaatNamespaceKeys[K] : string;

export interface RefBuilder<K extends NamespaceName> {
  /** Resolve to a random seeded row's id (deterministic under a fixed seed). */
  random(): Ref<RefValueOf<K>>;
  /** Resolve to the id of the row matching the given field(s). */
  where(predicate: Partial<RowOf<K>>): Ref<RefValueOf<K>>;
}

/**
 * Reference another seeded row's id.
 *
 * The returned `Ref<V>` carries the target's primary-key type, so it only
 * type-checks into a column of a compatible type (once `saat generate` has run;
 * permissive before that).
 */
export function ref<K extends NamespaceName>(namespace: K): RefBuilder<K>;
export function ref<K extends NamespaceName>(namespace: K, key: KeyOf<K>): Ref<RefValueOf<K>>;
export function ref(namespace: string, key?: string): any {
  if (key !== undefined) {
    return makeRef({ namespace, kind: "key", key });
  }
  return {
    random: () => makeRef({ namespace, kind: "random" }),
    where: (predicate: Record<string, unknown>) =>
      makeRef({ namespace, kind: "where", where: predicate }),
  } satisfies RefBuilder<any>;
}
