/** Minimal leveled logger with no dependencies. */

const colors = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
};

const useColor = process.stdout.isTTY && process.env.NO_COLOR === undefined;
const paint = (fn: (s: string) => string, s: string) => (useColor ? fn(s) : s);

export const log = {
  info(msg: string): void {
    console.log(`${paint(colors.cyan, "saat")} ${msg}`);
  },
  success(msg: string): void {
    console.log(`${paint(colors.green, "saat")} ${msg}`);
  },
  warn(msg: string): void {
    console.warn(`${paint(colors.yellow, "saat")} ${msg}`);
  },
  error(msg: string): void {
    console.error(`${paint(colors.red, "saat")} ${msg}`);
  },
  step(msg: string): void {
    console.log(paint(colors.dim, `  ${msg}`));
  },
};
