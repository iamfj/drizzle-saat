import { describe, expect, test } from "bun:test";
import { type Edge, topoSort } from "../../src/graph/toposort.js";
import { CycleError } from "../../src/util/errors.js";

describe("topoSort", () => {
  test("orders dependencies before dependents", () => {
    // post depends on user; comment depends on post + user.
    const order = topoSort(
      ["post", "user", "comment"],
      [
        ["post", "user"],
        ["comment", "post"],
        ["comment", "user"],
      ],
    );
    expect(order.indexOf("user")).toBeLessThan(order.indexOf("post"));
    expect(order.indexOf("post")).toBeLessThan(order.indexOf("comment"));
  });

  test("keeps independent nodes in input order", () => {
    expect(topoSort(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  test("ignores self-edges and unknown endpoints", () => {
    const order = topoSort(["a", "b"], [
      ["a", "a"],
      ["a", "ghost"],
    ] as Edge[]);
    expect(order).toEqual(["a", "b"]);
  });

  test("throws CycleError with the cycle path on a direct cycle", () => {
    let err: unknown;
    try {
      topoSort(
        ["a", "b"],
        [
          ["a", "b"],
          ["b", "a"],
        ],
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(CycleError);
    const cycle = (err as CycleError).cycle;
    expect(cycle.length).toBeGreaterThanOrEqual(2);
    // path closes on itself
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
  });

  test("detects a longer cycle", () => {
    expect(() =>
      topoSort(
        ["a", "b", "c"],
        [
          ["a", "b"],
          ["b", "c"],
          ["c", "a"],
        ],
      ),
    ).toThrow(CycleError);
  });

  test("dedupes repeated edges", () => {
    const order = topoSort(
      ["x", "y"],
      [
        ["y", "x"],
        ["y", "x"],
      ],
    );
    expect(order).toEqual(["x", "y"]);
  });
});
