import { CycleError } from "../util/errors.js";

/** A directed edge `[from, to]` meaning `to` must be ordered before `from`. */
export type Edge = [from: string, to: string];

/**
 * Topologically sort `nodes` given dependency `edges`, using Kahn's algorithm.
 * An edge `[from, to]` means `from` depends on `to`, so `to` appears first.
 * Throws {@link CycleError} (with a concrete cycle path) if the graph is cyclic.
 */
export function topoSort(nodes: string[], edges: Edge[]): string[] {
  const nodeSet = new Set(nodes);
  // dependencies: node -> set of nodes that must come before it.
  const deps = new Map<string, Set<string>>();
  // dependents: node -> set of nodes that depend on it.
  const dependents = new Map<string, Set<string>>();
  for (const n of nodes) {
    deps.set(n, new Set());
    dependents.set(n, new Set());
  }

  for (const [from, to] of edges) {
    if (!nodeSet.has(from) || !nodeSet.has(to) || from === to) continue;
    if (!deps.get(from)!.has(to)) {
      deps.get(from)!.add(to);
      dependents.get(to)!.add(from);
    }
  }

  // Seed the queue with nodes that have no remaining dependencies. Preserve the
  // input order for deterministic output.
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n, deps.get(n)!.size);
  const queue = nodes.filter((n) => indegree.get(n) === 0);
  const ordered: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    ordered.push(node);
    for (const dependent of dependents.get(node)!) {
      const next = indegree.get(dependent)! - 1;
      indegree.set(dependent, next);
      if (next === 0) queue.push(dependent);
    }
  }

  if (ordered.length !== nodes.length) {
    const remaining = nodes.filter((n) => indegree.get(n)! > 0);
    throw new CycleError(findCycle(remaining, deps));
  }
  return ordered;
}

/** DFS the unresolved subgraph to surface one concrete cycle for the error. */
function findCycle(remaining: string[], deps: Map<string, Set<string>>): string[] {
  const remainingSet = new Set(remaining);
  const visited = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();

  const dfs = (node: string): string[] | null => {
    visited.add(node);
    stack.push(node);
    onStack.add(node);
    for (const dep of deps.get(node) ?? []) {
      if (!remainingSet.has(dep)) continue;
      if (onStack.has(dep)) {
        const start = stack.indexOf(dep);
        return [...stack.slice(start), dep];
      }
      if (!visited.has(dep)) {
        const found = dfs(dep);
        if (found) return found;
      }
    }
    stack.pop();
    onStack.delete(node);
    return null;
  };

  for (const node of remaining) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return remaining;
}
