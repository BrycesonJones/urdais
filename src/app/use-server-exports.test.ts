import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A `"use server"` module may only export async functions. Anything else passes
 * unit tests and `next build`, then fails every action in the file at runtime
 * with "A "use server" file can only export async functions, found object." —
 * which is how the audience step shipped returning 500. Shared form state
 * belongs in a sibling `form-state.ts`, as @/app/auth/form-state does.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const NON_FUNCTION_EXPORT = /^export\s+(?:const|let|var|class|enum|default\s+(?!async\s+function))\b|^export\s*\{/m;

describe('"use server" modules', () => {
  const serverModules = sourceFiles(join(process.cwd(), "src")).filter((path) =>
    /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use server["']/.test(readFileSync(path, "utf8")),
  );

  it("are found", () => {
    expect(serverModules.length).toBeGreaterThan(0);
  });

  it.each(serverModules.map((path) => [path.slice(process.cwd().length + 1), path]))(
    "%s exports only functions and types",
    (_name, path) => {
      expect(readFileSync(path, "utf8")).not.toMatch(NON_FUNCTION_EXPORT);
    },
  );
});
