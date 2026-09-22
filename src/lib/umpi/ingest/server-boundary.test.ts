import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { UMPI_DATA_GO_KR_SERVICE_KEY_ENV, UMPI_ECOS_API_KEY_ENV } from "../config";

const root = process.cwd();

function filesUnder(dir: string, extensions = [".ts", ".tsx"]): string[] {
  const absolute = path.join(root, dir);
  const walk = (rel: string): string[] =>
    readdirSync(path.join(absolute, rel), { withFileTypes: true }).flatMap((entry) => {
      const child = path.join(rel, entry.name);
      if (entry.isDirectory()) return walk(child);
      return extensions.some((ext) => entry.name.endsWith(ext)) ? [child] : [];
    });
  return walk(".");
}

/**
 * The adapters run server-side only. A key that reaches a browser bundle is a key that has been
 * published, so the boundary is asserted rather than assumed: nothing a client renders may
 * mention the credential names or import the ingestion modules.
 */
describe("the ingestion layer stays server-side", () => {
  const clientTrees = ["src/app", "src/components", "src/data"];

  it("no credential name appears anywhere a browser bundle could reach", () => {
    for (const tree of clientTrees) {
      for (const file of filesUnder(tree)) {
        const source = readFileSync(path.join(root, tree, file), "utf8");
        expect(source, `${tree}/${file}`).not.toContain(UMPI_ECOS_API_KEY_ENV);
        expect(source, `${tree}/${file}`).not.toContain(UMPI_DATA_GO_KR_SERVICE_KEY_ENV);
      }
    }
  });

  it("nothing client-side imports the UMPI ingestion modules", () => {
    for (const tree of clientTrees) {
      for (const file of filesUnder(tree)) {
        const source = readFileSync(path.join(root, tree, file), "utf8");
        expect(source, `${tree}/${file}`).not.toMatch(/from "@\/lib\/umpi\/ingest/);
      }
    }
  });

  it("no credential value is committed anywhere in the ingestion layer or its fixtures", () => {
    // The redaction tests must contain something key-shaped in order to prove it gets removed,
    // so the named placeholders are allowed by name. Anything else key-shaped fails, which is
    // the case this guard exists for: a real key pasted into a fixture or a debug URL.
    const placeholders = ["SECRETVALUE", "REDACTED", "MYKEY123", "test-key"];
    const withoutPlaceholders = (source: string) =>
      placeholders.reduce((text, token) => text.split(token).join("X"), source);

    for (const file of filesUnder("src/lib/umpi")) {
      const source = withoutPlaceholders(readFileSync(path.join(root, "src/lib/umpi", file), "utf8"));
      expect(source, file).not.toMatch(/serviceKey=[A-Za-z0-9%+/]{8,}/);
      expect(source, file).not.toMatch(/StatisticSearch\/[A-Za-z0-9]{10,}\//);
    }
  });

  it("the ingestion entry point is a script, not a route", () => {
    const routes = filesUnder("src/app").filter((file) => /route\.tsx?$/.test(file));
    for (const route of routes) {
      const source = readFileSync(path.join(root, "src/app", route), "utf8");
      expect(source, route).not.toContain("umpi");
    }
  });
});
