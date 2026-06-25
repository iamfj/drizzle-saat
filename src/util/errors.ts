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

/**
 * Wraps a raw driver error (FK violation, NOT NULL, unique, …) raised while
 * inserting a chunk, attributing it to the namespace, table, and the row keys
 * in that batch so the failure points back at the fixture instead of a bare
 * `pg`/`mysql2` error.
 */
export class InsertError extends SaatError {
  constructor(
    public readonly namespace: string,
    public readonly table: string,
    public readonly rowKeys: (string | undefined)[],
    public readonly cause: Error,
  ) {
    const keyed = rowKeys.filter((k): k is string => k !== undefined);
    const where = keyed.length > 0 ? ` (rows: ${keyed.join(", ")})` : "";
    super(`failed inserting namespace "${namespace}" → table "${table}"${where}: ${cause.message}`);
    this.name = "InsertError";
  }
}
