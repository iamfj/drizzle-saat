/**
 * Map a Drizzle column's normalized `dataType` onto a TypeScript type literal.
 * Used only for best-effort codegen fallbacks; the generated `.d.ts` prefers
 * Drizzle's own `InferSelectModel`, so this stays deliberately conservative.
 */
export function columnToTsType(dataType: string): string {
  switch (dataType) {
    case "number":
      return "number";
    case "bigint":
      return "bigint";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "date":
      return "Date";
    case "json":
      return "unknown";
    case "buffer":
      return "Buffer";
    case "array":
      return "unknown[]";
    default:
      return "unknown";
  }
}
