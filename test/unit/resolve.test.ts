import { describe, expect, test } from "bun:test";
import { ResolvedStore } from "../../src/engine/resolve.js";
import { ref } from "../../src/refs/ref.js";
import { createRng } from "../../src/rng/index.js";
import { MissingReferenceError, SaatError } from "../../src/util/errors.js";

/** Seed a namespace with rows {key?, data} and sequential ids. */
function seedNamespace(
  store: ResolvedStore,
  ns: string,
  rows: { key?: string; data: Record<string, unknown> }[],
) {
  store.init(ns, ["id"]);
  rows.forEach((r, i) => store.record(ns, r, { id: i + 1 }));
}

describe("ResolvedStore", () => {
  test("resolves ref by key", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [
      { key: "john", data: { name: "John" } },
      { key: "jane", data: { name: "Jane" } },
    ]);
    const out = store.resolveRow({ authorId: ref("user", "jane") }, createRng(1));
    expect(out.authorId as number).toBe(2);
  });

  test("resolves ref by where predicate", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [
      { data: { name: "John", role: "admin" } },
      { data: { name: "Jane", role: "user" } },
    ]);
    const out = store.resolveRow({ authorId: ref("user").where({ name: "Jane" }) }, createRng(1));
    expect(out.authorId as number).toBe(2);
  });

  test("matches where on multiple fields", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [
      { data: { name: "John", role: "admin" } },
      { data: { name: "John", role: "user" } },
    ]);
    const out = store.resolveRow(
      { authorId: ref("user").where({ name: "John", role: "user" }) },
      createRng(1),
    );
    expect(out.authorId as number).toBe(2);
  });

  test("matches where on a Date value by logical equality", () => {
    const store = new ResolvedStore();
    const when = new Date("2024-01-02T03:04:05.000Z");
    seedNamespace(store, "event", [
      { data: { name: "a", at: new Date("2020-01-01T00:00:00.000Z") } },
      { data: { name: "b", at: new Date("2024-01-02T03:04:05.000Z") } },
    ]);
    // A different Date instance with the same time must still match.
    const out = store.resolveRow({ eventId: ref("event").where({ at: when }) }, createRng(1));
    expect(out.eventId as number).toBe(2);
  });

  test("matches where on an object value structurally", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "doc", [
      { data: { name: "a", meta: { plan: "free" } } },
      { data: { name: "b", meta: { plan: "pro" } } },
    ]);
    const out = store.resolveRow(
      { docId: ref("doc").where({ meta: { plan: "pro" } }) },
      createRng(1),
    );
    expect(out.docId as number).toBe(2);
  });

  test("random picks deterministically for a fixed seed", () => {
    const make = () => {
      const store = new ResolvedStore();
      seedNamespace(store, "user", [
        { data: { name: "a" } },
        { data: { name: "b" } },
        { data: { name: "c" } },
      ]);
      const rng = createRng(99);
      return [0, 1, 2, 3].map(() => store.resolveRow({ x: ref("user").random() }, rng).x);
    };
    expect(make()).toEqual(make());
    for (const id of make()) expect([1, 2, 3]).toContain(id as number);
  });

  test("leaves non-ref values untouched", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [{ data: { name: "a" } }]);
    const out = store.resolveRow({ title: "hello", n: 5, b: true }, createRng(1));
    expect(out).toEqual({ title: "hello", n: 5, b: true });
  });

  test("resolves refs nested inside arrays", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [
      { key: "john", data: { name: "John" } },
      { key: "jane", data: { name: "Jane" } },
    ]);
    const out = store.resolveRow(
      { authorIds: [ref("user", "jane"), ref("user", "john")] },
      createRng(1),
    );
    expect(out.authorIds).toEqual([2, 1]);
  });

  test("resolves refs nested inside plain objects (e.g. JSON columns)", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [{ key: "jane", data: { name: "Jane" } }]);
    const out = store.resolveRow(
      { meta: { owner: ref("user", "jane"), label: "x" } },
      createRng(1),
    );
    expect(out.meta).toEqual({ owner: 1, label: "x" });
  });

  test("leaves Date values inside JSON untouched (no recursion into class instances)", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [{ data: { name: "a" } }]);
    const when = new Date("2024-01-02T03:04:05.000Z");
    const out = store.resolveRow({ meta: { at: when } }, createRng(1));
    expect((out.meta as { at: Date }).at).toBe(when);
  });

  test("throws on unknown namespace", () => {
    const store = new ResolvedStore();
    expect(() => store.resolveRow({ x: ref("ghost", "k") }, createRng(1))).toThrow(
      MissingReferenceError,
    );
  });

  test("throws on missing key", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [{ key: "john", data: { name: "John" } }]);
    expect(() => store.resolveRow({ x: ref("user", "nobody") }, createRng(1))).toThrow(
      MissingReferenceError,
    );
  });

  test("throws on where with no match", () => {
    const store = new ResolvedStore();
    seedNamespace(store, "user", [{ data: { name: "John" } }]);
    expect(() =>
      store.resolveRow({ x: ref("user").where({ name: "Nobody" }) }, createRng(1)),
    ).toThrow(MissingReferenceError);
  });

  test("throws on random over an empty namespace", () => {
    const store = new ResolvedStore();
    store.init("user", ["id"]);
    expect(() => store.resolveRow({ x: ref("user").random() }, createRng(1))).toThrow(
      MissingReferenceError,
    );
  });

  test("rejects referencing a composite-PK namespace", () => {
    const store = new ResolvedStore();
    store.init("membership", ["userId", "groupId"]);
    store.record("membership", { data: {} }, { userId: 1, groupId: 2 });
    expect(() => store.resolveRow({ x: ref("membership").random() }, createRng(1))).toThrow(
      SaatError,
    );
  });
});
