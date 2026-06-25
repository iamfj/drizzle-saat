/**
 * Import a module by a runtime specifier. Because the specifier is not a string
 * literal, TypeScript does not attempt to resolve it at build time — exactly
 * what we want for optional peer drivers (`pg`, `mysql2`) that may not be
 * installed in this workspace. Returns `any`.
 */
export function dynamicImport(specifier: string): Promise<any> {
  return import(specifier);
}
