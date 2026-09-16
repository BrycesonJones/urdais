import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { OPEN_WEIGHT_BOUNDARY, OPEN_WEIGHT_CLAIM } from "@/lib/open-weight/types";

/**
 * Copy guardrails.
 *
 * "Open-weight" is the phrase most likely to be over-read, in both directions: as open source,
 * and as a share of the industry rather than of one marketplace's observed traffic. These read
 * the real files rather than a fixture, because the thing worth catching is a phrase someone
 * adds later to a heading or a tooltip.
 */

const read = (relative: string) => readFileSync(path.join(process.cwd(), relative), "utf8");

const PUBLIC_SURFACES = [
  "src/components/model-economics/open-weight-analysis.tsx",
  "src/lib/open-weight/types.ts",
  "src/lib/open-weight/surface.ts",
  "docs/methodology/open-weight-proprietary.md",
];

/** Claims this product may never make. Each needs data or judgement Urdais does not hold. */
const PROHIBITED: { pattern: RegExp; claim: string }[] = [
  { pattern: /\bopen[- ]source models?\b/i, claim: "open-weight means open source" },
  { pattern: /\bfree to use\b/i, claim: "an open-weight licence permits any use" },
  { pattern: /\b(share|percent) of the AI (industry|market)\b/i, claim: "share of the industry" },
  { pattern: /\bcost per (task|request|query)\b/i, claim: "cost per task" },
  { pattern: /\btotal (inference|token) cost\b/i, claim: "total inference cost" },
  { pattern: /\bcheapest model\b/i, claim: "cheapest model to accomplish an outcome" },
  { pattern: /\bbetter than proprietary\b/i, claim: "open-weight models are better" },
];

/** Naming a claim in order to refuse it is what the methodology is required to do. */
const REFUSAL_CONTEXT = /(\bnot\b|never|cannot|outside|prohibited|forbid|refus|does not mean)/i;
const REFUSAL_WINDOW = 6;

describe("the semantic boundary is stated, not merely intended", () => {
  it("says all three things it has to say", () => {
    expect(OPEN_WEIGHT_BOUNDARY).toMatch(/does not mean open source/);
    expect(OPEN_WEIGHT_BOUNDARY).toMatch(/non-commercial use only are reported as Unclassified/);
    expect(OPEN_WEIGHT_BOUNDARY).toMatch(/observed OpenRouter token volume, not of the industry/);
    expect(OPEN_WEIGHT_BOUNDARY).toMatch(/list prices per token, not total inference cost/);
  });

  it("is carried on the section and in the methodology", () => {
    // The component renders the constant rather than a paraphrase that could drift from it.
    expect(read("src/components/model-economics/open-weight-analysis.tsx")).toContain("view.boundary");
    expect(read("docs/methodology/open-weight-proprietary.md")).toContain("It does not mean open source");
  });

  it("keeps the public claim narrow", () => {
    expect(OPEN_WEIGHT_CLAIM).toMatch(/^Whether each model's publisher released downloadable weights/);
    // No superlative, no quality judgement, no legal advice.
    expect(OPEN_WEIGHT_CLAIM).not.toMatch(/best|better|cheapest|value|efficien|licen[cs]ed to/i);
  });

  it("inherits Model Frontier's cost boundary rather than restating it loosely", () => {
    // The same list-price arithmetic needs the same bound, and a second, weaker wording of it
    // would be the crack the claim escapes through.
    expect(OPEN_WEIGHT_BOUNDARY).toMatch(/more reasoning tokens/);
  });
});

describe("prohibited claims", () => {
  for (const surface of PUBLIC_SURFACES) {
    it(`${surface} asserts none of them`, () => {
      const lines = read(surface).split("\n");
      for (const { pattern, claim } of PROHIBITED) {
        for (const [index, line] of lines.entries()) {
          if (!pattern.test(line)) continue;
          const context = lines.slice(Math.max(0, index - REFUSAL_WINDOW), index + 1).join(" ");
          expect(
            REFUSAL_CONTEXT.test(context),
            `${surface}:${index + 1} asserts "${claim}" without refusing it: ${line.trim()}`,
          ).toBe(true);
        }
      }
    });
  }
});

describe("the section owns no second frontier", () => {
  it("computes no Pareto rule of its own", () => {
    // The requirement is not merely that the answers agree today; it is that there is one
    // implementation, so they cannot disagree tomorrow.
    const derive = read("src/lib/open-weight/derive.ts");
    expect(derive).not.toMatch(/\bdominates\b/);
    expect(derive).not.toMatch(/function markFrontier/);
    // Membership is read off the points Model Frontier already marked.
    expect(derive).toContain("point.onFrontier");
  });

  it("draws its points from Model Frontier's loader and derivation", () => {
    const surface = read("src/lib/open-weight/surface.ts");
    expect(surface).toContain("@/lib/frontier/read/derive");
    expect(surface).toContain("@/lib/frontier/read/load");
  });
});

describe("the methodology states the decisions a reader could otherwise not check", () => {
  const methodology = read("docs/methodology/open-weight-proprietary.md");

  it("states the fold rather than performing it silently", () => {
    expect(methodology).toMatch(/Restricted weights roll up to Open-weight/i);
  });

  it("states that non-commercial weights are excluded from the open-weight bucket", () => {
    expect(methodology).toMatch(/\*\*Non-commercial weights do not\.\*\*/);
    expect(methodology).toMatch(/\*\*Unclassified\*\* — open_weights_noncommercial/);
  });

  it("keeps the source-defined residual separately identified", () => {
    expect(methodology).toMatch(/source-defined residual/i);
  });

  it("states that failing to find weights is not evidence", () => {
    expect(methodology).toMatch(/Failing to find weights is not evidence/i);
  });

  it("takes the price population from the Model Frontier's own Pareto set", () => {
    expect(methodology).toMatch(/Pareto-efficient configurations of the Model Frontier/i);
    expect(methodology).toMatch(/The population is not selected here/i);
  });

  it("states that there is no capability threshold of any kind", () => {
    // The correction this replaced: a derived threshold is still a threshold, and a second
    // selection rule here could drift from the frontier the chart draws.
    expect(methodology).toMatch(/no capability threshold\*\*, fixed or derived/i);
    expect(methodology).not.toMatch(/capability-matched/i);
    expect(methodology).not.toMatch(/lower of the two class/i);
  });

  it("states the sample floor below which no ratio is published", () => {
    expect(methodology).toMatch(/only when both classes carry at least three/i);
    expect(methodology).toMatch(/Insufficient comparable frontier coverage/);
  });

  it("keeps configurations as the unit and refuses to collapse them first", () => {
    expect(methodology).toMatch(/Configurations remain the unit, and are never collapsed first/i);
  });

  it("states the denominator it shares with Market Share", () => {
    expect(methodology).toMatch(/denominator is total observed tokens/i);
  });

  it("states the even-count median convention, so the number is reproducible", () => {
    expect(methodology).toMatch(/median averages the two middle values/i);
  });
});

describe("independence from the demo graph", () => {
  it("the section reads no demo fixture", () => {
    expect(read("src/components/model-economics/open-weight-analysis.tsx")).not.toContain("@/data/mock");
  });

  it("no production open-weight module touches the demo graph", () => {
    for (const file of [
      "src/lib/open-weight/types.ts",
      "src/lib/open-weight/derive.ts",
      "src/lib/open-weight/load.ts",
      "src/lib/open-weight/surface.ts",
    ]) {
      expect(read(file)).not.toContain("@/data/mock");
    }
  });

  it("the Model Economics page no longer badges any section as demo data", () => {
    const page = read("src/components/model-economics/model-economics-page.tsx");
    expect(page).not.toContain("Open-weight is demo data");
    expect(page).not.toContain("Demo data");
  });
});
