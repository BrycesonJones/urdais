import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODEL_FRONTIER_CLAIM, MODEL_FRONTIER_COST_BOUNDARY } from "@/lib/frontier/types";

/**
 * Copy guardrails.
 *
 * The cost boundary is the condition under which configuration-level plotting is honest, so a
 * claim that crosses it is not a wording slip — it is the product asserting something it
 * cannot support. These read the real files rather than a fixture, because the thing worth
 * catching is a phrase someone adds later to a heading or a tooltip.
 */

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");

/** Surfaces a reader actually sees, plus the methodology that governs them. */
const PUBLIC_SURFACES = [
  "src/components/model-economics/model-frontier-chart.tsx",
  "src/lib/frontier/types.ts",
  "src/lib/frontier/read/surface.ts",
  "docs/methodology/model-frontier.md",
];

/**
 * Claims Model Frontier may never make. Each needs usage or outcome data Urdais does not hold.
 *
 * Written as phrases rather than single words so the methodology can *forbid* them by name --
 * the document has to be able to say "Urdais does not claim total inference cost" without
 * tripping the check, which is why each pattern requires the claim to be asserted rather than
 * merely mentioned.
 */
const PROHIBITED: { pattern: RegExp; claim: string }[] = [
  { pattern: /\bcost per (task|request|query)\b/i, claim: "cost per task" },
  { pattern: /\btotal (inference|token) cost\b/i, claim: "total inference cost" },
  { pattern: /\bcheapest model\b/i, claim: "cheapest model to accomplish an outcome" },
  { pattern: /\bvalue for money\b/i, claim: "value for money" },
  { pattern: /\bmost cost[- ]effective\b/i, claim: "cost effectiveness" },
  { pattern: /\bbest value\b/i, claim: "best value" },
];

/**
 * Where a prohibited claim may legitimately appear: inside a refusal.
 *
 * Checked over a short window rather than the single line, because a refusal is usually a
 * sentence introducing a list -- "Urdais does not claim:" followed by the bullets. A per-line
 * check would flag the list the methodology is required to contain.
 */
const REFUSAL_CONTEXT = /(\bnot\b|never|cannot|outside|prohibited|forbid|refus)/i;
const REFUSAL_WINDOW = 6;

describe("the cost boundary is stated, not merely intended", () => {
  it("is carried on the chart and in the methodology", () => {
    const chart = read("src/components/model-economics/model-frontier-chart.tsx");
    // The chart renders the constant rather than a paraphrase of it.
    expect(chart).toContain("costBoundary");
    const methodology = read("docs/methodology/model-frontier.md");
    expect(methodology).toContain("equal unit token prices do not imply equal total cost");
  });

  it("says the two things it has to say", () => {
    expect(MODEL_FRONTIER_COST_BOUNDARY).toMatch(/provider list price per 1M tokens/);
    expect(MODEL_FRONTIER_COST_BOUNDARY).toMatch(/do not imply equal total cost per request or task/);
  });

  it("keeps the public claim narrow", () => {
    expect(MODEL_FRONTIER_CLAIM).toBe("Benchmark capability against provider list price per 1M tokens.");
    // No superlative, no efficiency, no outcome.
    expect(MODEL_FRONTIER_CLAIM).not.toMatch(/best|cheapest|value|efficien/i);
  });
});

describe("prohibited claims", () => {
  for (const surface of PUBLIC_SURFACES) {
    it(`${surface} asserts none of them`, () => {
      const text = read(surface);
      const lines = text.split("\n");
      for (const { pattern, claim } of PROHIBITED) {
        for (const [index, line] of lines.entries()) {
          if (!pattern.test(line)) continue;
          // Naming a claim in order to refuse it is exactly what the methodology must do, and
          // the refusal is often the sentence that introduces the list.
          const context = lines.slice(Math.max(0, index - REFUSAL_WINDOW), index + 1).join(" ");
          expect(
            REFUSAL_CONTEXT.test(context),
            `${surface}:${index + 1} asserts "${claim}" without refusing it: ${line.trim()}`,
          ).toBe(true);
        }
      }
    });
  }

  it("the page metadata does not promise an economic comparison", () => {
    const page = read("src/app/markets/model-economics/page.tsx");
    for (const { pattern } of PROHIBITED) expect(pattern.test(page)).toBe(false);
  });
});

describe("independence from the demo graph", () => {
  it("the Frontier chart no longer reads any demo fixture", () => {
    const chart = read("src/components/model-economics/model-frontier-chart.tsx");
    expect(chart).not.toContain("@/data/mock");
    expect(chart).not.toContain("FRONTIER_POINTS");
  });

  it("no production frontier module touches the demo graph", () => {
    for (const file of ["src/lib/frontier/types.ts", "src/lib/frontier/read/derive.ts", "src/lib/frontier/read/load.ts"]) {
      expect(read(file)).not.toContain("@/data/mock");
    }
  });

  it("has retired the demo graph entirely, now that the open-weight phase no longer needs it", () => {
    // This test previously asserted the opposite: FRONTIER_POINTS had to survive because the
    // open-weight panels were computed from it. They now derive from evidenced access
    // classifications, so the fixture has no consumer and the file is gone. Asserting its
    // absence is what stops it being reintroduced as a convenient fallback.
    expect(existsSync(path.join(process.cwd(), "src/data/mock/model-economics.ts"))).toBe(false);
    expect(existsSync(path.join(process.cwd(), "src/data/mock/token-providers.ts"))).toBe(false);
  });
});
