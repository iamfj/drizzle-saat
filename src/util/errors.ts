/** Base error for all user-facing drizzle-saat failures. Carries a clean message. */
export class SaatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaatError";
  }
}

/** Thrown when the reference dependency graph contains a cycle. */
export class CycleError extends SaatError {
  constructor(public readonly cycle: string[]) {
    super(
      `dependency cycle detected between namespaces: ${cycle.join(" → ")}. ` +
        `References must form an acyclic graph so inserts can be ordered.`,
    );
    this.name = "CycleError";
  }
}

/** Thrown when a reference points at an unknown namespace/key/row. */
export class MissingReferenceError extends SaatError {
  constructor(message: string) {
    super(message);
    this.name = "MissingReferenceError";
  }
}
