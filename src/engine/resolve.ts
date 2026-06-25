import { type Ref, isPlainObject, isRef } from "../refs/ref.js";
import type { Rng } from "../rng/index.js";
import type { Row } from "../types.js";
import { MissingReferenceError, SaatError } from "../util/errors.js";

/**
 * Logical value equality for `.where()` matching. Primitives compare with
 * `Object.is`; `Date`s compare by time; plain objects/arrays compare
 * structurally. This lets predicates use `Date`/JSON values, not just refs.
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

interface NamespaceStore {
  /** Single primary-key property, or undefined for composite PKs. */
  pkProperty: string | undefined;
  /** Primary-key values in insert order (for `.random()`). */
  idsByInsertOrder: unknown[];
  /** Keyed-row key → primary-key value (for `ref(ns, key)`). */
  keyToId: Map<string, unknown>;
  /** Generated data + resolved id (for `.where()` matching). */
  rows: { data: Row; id: unknown }[];
}

/**
 * Accumulates inserted rows so later namespaces can resolve references to them.
 * References resolve to a single primary-key value, so namespaces with
 * composite primary keys cannot be the target of a reference.
 */
export class ResolvedStore {
  private map = new Map<string, NamespaceStore>();

  init(namespace: string, primaryKeys: string[]): void {
    this.map.set(namespace, {
      pkProperty: primaryKeys.length === 1 ? primaryKeys[0] : undefined,
      idsByInsertOrder: [],
      keyToId: new Map(),
      rows: [],
    });
  }

  private require(namespace: string): NamespaceStore {
    const store = this.map.get(namespace);
    if (!store) {
      throw new MissingReferenceError(
        `reference to namespace "${namespace}" which has not been seeded yet (or does not exist).`,
      );
    }
    return store;
  }

  private pkProperty(namespace: string): string {
    const store = this.require(namespace);
    if (store.pkProperty === undefined) {
      throw new SaatError(
        `namespace "${namespace}" has a composite primary key and cannot be the target of a ` +
          "reference. Reference a namespace with a single-column primary key instead.",
      );
    }
    return store.pkProperty;
  }

  /** Record an inserted row's primary key against its generated data + key. */
  record(namespace: string, generated: { key?: string; data: Row }, pkRow: Row): void {
    const store = this.require(namespace);
    const id = store.pkProperty === undefined ? undefined : pkRow[store.pkProperty];
    store.idsByInsertOrder.push(id);
    store.rows.push({ data: generated.data, id });
    if (generated.key !== undefined) store.keyToId.set(generated.key, id);
  }

  private resolveRef(ref: Ref, rng: Rng): unknown {
    // Touch pkProperty so composite-PK targets fail with a clear message.
    this.pkProperty(ref.namespace);
    const store = this.require(ref.namespace);
    switch (ref.kind) {
      case "key": {
        if (!store.keyToId.has(ref.key!)) {
          throw new MissingReferenceError(
            `ref("${ref.namespace}", "${ref.key}") — no keyed row "${ref.key}" in namespace "${ref.namespace}".`,
          );
        }
        return store.keyToId.get(ref.key!);
      }
      case "random": {
        if (store.idsByInsertOrder.length === 0) {
          throw new MissingReferenceError(
            `ref("${ref.namespace}").random() — namespace "${ref.namespace}" has no seeded rows.`,
          );
        }
        return rng.pick(store.idsByInsertOrder);
      }
      case "where": {
        const predicate = ref.where ?? {};
        const match = store.rows.find((r) =>
          Object.entries(predicate).every(([k, v]) => valuesEqual(r.data[k], v)),
        );
        if (!match) {
          throw new MissingReferenceError(
            `ref("${ref.namespace}").where(${JSON.stringify(predicate)}) — no matching row in ` +
              `namespace "${ref.namespace}".`,
          );
        }
        return match.id;
      }
    }
  }

  /** Return a copy of `data` with every embedded reference resolved to an id. */
  resolveRow(data: Row, rng: Rng): Row {
    const out: Row = {};
    for (const [key, value] of Object.entries(data)) {
      out[key] = this.resolveValue(value, rng);
    }
    return out;
  }

  /**
   * Resolve a single value, recursing into arrays and plain objects (e.g. JSON
   * columns) so references nested inside them are resolved too. `Date`s and
   * other class instances are left untouched.
   */
  private resolveValue(value: unknown, rng: Rng): unknown {
    if (isRef(value)) return this.resolveRef(value, rng);
    if (Array.isArray(value)) return value.map((v) => this.resolveValue(v, rng));
    if (isPlainObject(value)) {
      const out: Row = {};
      for (const [k, v] of Object.entries(value)) out[k] = this.resolveValue(v, rng);
      return out;
    }
    return value;
  }
}
