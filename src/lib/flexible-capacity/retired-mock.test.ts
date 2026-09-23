/**
 * The retired Flexible Capacity mock, and the guarantee that it stays retired.
 *
 * Until FC-4A the section was drawn from `src/data/mock/power-analytics.ts`: a saturating curve
 * `1 - exp(-hours/90)` over fourteen invented per-market gigawatt figures, an unexplained 0.8
 * multiplier on a battery term, and an x-axis whose unit was never defined. None of it survives,
 * and this file is what makes "none of it survives" a failing test rather than a claim.
 *
 * The scan is over runtime code only. Documentation and research records may discuss the retired
 * model — explaining why it was wrong is part of the record — but nothing that ships may use it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/** Identifiers the mock exported, and the field names it published. */
const RETIRED_IDENTIFIERS = [
  "FLEXIBILITY_CURVE", "FLEXIBILITY_HEADLINE", "FLEXIBILITY_SCENARIOS",
  "FLEXIBILITY_SATURATION_HOURS", "FLEXIBILITY_ASSUMPTIONS", "FLEXIBILITY_SCENARIO_HOURS",
  "FLEXIBILITY_HEADLINE_HOURS", "flexibilityScenario", "unlockShare",
  "unlockedGw", "interruptibleGw", "batteryGw", "flexibleHoursPerYear",
  "interruptibleLoadGw", "batteryShiftableLoadGw",
  "LOAD_OBSERVATIONS", "INTERCONNECTION_OBSERVATIONS", "queueRanking", "POWER_ANALYTICS_AS_OF",
] as const;

/**
 * The one file allowed to name the retired fields: the contract check that refuses them.
 *
 * A guard has to spell out what it guards against, exactly as `methodology.ts` has to hold the
 * list of forbidden framings. Exempting it by name keeps the scan honest everywhere else.
 */
const GUARD_FILES = new Set([
  path.join("src", "lib", "flexible-capacity", "analytics", "read-contract.ts"),
]);

/** Every runtime source file: the app, the libraries and the components, tests excluded. */
function runtimeFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) { runtimeFiles(full, found); continue; }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    found.push(full);
  }
  return found;
}

describe("1. the mock modules are gone", () => {
  it("neither the data nor its types remain", async () => {
    const { access } = await import("node:fs/promises");
    await expect(access("src/data/mock/power-analytics.ts")).rejects.toThrow();
    await expect(access("src/types/power-analytics.ts")).rejects.toThrow();
  });

  it("leaves the unrelated mocks alone, which other products still use", async () => {
    const { access } = await import("node:fs/promises");
    await expect(access("src/data/mock/market-detail.ts")).resolves.toBeUndefined();
    await expect(access("src/data/mock/ucpi.ts")).resolves.toBeUndefined();
  });
});

describe("2. no runtime code uses the retired vocabulary", () => {
  const files = runtimeFiles("src");

  it("scans a meaningful number of files", () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it.each(RETIRED_IDENTIFIERS)("no runtime file mentions %s", (identifier) => {
    const offenders = files.filter((file) => {
      if (GUARD_FILES.has(file)) return false;
      const source = readFileSync(file, "utf8");
      // Comments may name the retired concept to explain what replaced it; code may not.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      return code.includes(identifier);
    });
    expect(offenders).toEqual([]);
  });
});

describe("3. nothing imports the retired modules", () => {
  it("no runtime file imports the Power Analytics mock or its types", () => {
    const offenders = runtimeFiles("src").filter((file) =>
      /from\s+["']@\/(data\/mock\/power-analytics|types\/power-analytics)["']/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("4. the Power Analytics page no longer excuses demo data", () => {
  it("carries no demo-data badge, because there is no demo data left", () => {
    const source = readFileSync("src/components/power-analytics/power-analytics-page.tsx", "utf8");
    expect(source).not.toMatch(/Demo data except/);
  });

  it("passes a read model to every one of its five sections", () => {
    const source = readFileSync("src/components/power-analytics/power-analytics-page.tsx", "utf8");
    for (const prop of ["model={gap}", "analytics={queue}", "analytics={headroom}",
      "analytics={buildout}", "analytics={flexibility}"]) {
      expect(source).toContain(prop);
    }
    // And no section renders without one.
    expect(source).not.toMatch(/<FlexibleCapacityChart\s*\/>/);
  });
});
