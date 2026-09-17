import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  APPROVED_NUMERIC_PARAMETERS,
  APPROVED_TEXT_PARAMETERS,
  CONCENTRATION_PUBLICATION_GATE,
  CONSTITUENT_VARIANCE_CARRY,
  MIN_COVERED_ISSUER_COUNT,
  MIN_COVERED_PARENT_WEIGHT,
  N30,
  N365,
  UAVI_AGGREGATION_FORM,
  UNRESOLVED_PARAMETERS,
} from "@/lib/uavi/parameters";

const MIGRATION = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20260917250000_uavi_options_foundation.sql"),
  "utf8",
);

/** The approved parameter rows, parsed out of the migration that seeds them. */
function approvedRows(): { numeric: Map<string, number>; text: Map<string, string> } {
  const start = MIGRATION.indexOf("'approved', date '2026-09-17'");
  const end = MIGRATION.indexOf("'draft', v.why");
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  const block = MIGRATION.slice(start, end);

  const numeric = new Map<string, number>();
  const text = new Map<string, string>();
  const pattern = /\('([a-z_]+)',\s*(null(?:::numeric)?|-?[0-9.]+),\s*(null|'([^']*)')/g;
  for (const match of block.matchAll(pattern)) {
    const [, key, numericValue, , textValue] = match;
    if (numericValue !== undefined && !numericValue.startsWith("null")) {
      numeric.set(key!, Number(numericValue));
    }
    if (textValue !== undefined) text.set(key!, textValue);
  }
  return { numeric, text };
}

/**
 * The constants in this codebase and the approved rows in the database are two statements of the
 * same parameter set. A constant that drifts from its approved row is the failure this test
 * exists to prevent: the calculation would use one value, an auditor querying the methodology
 * would read another, and nothing would disagree out loud.
 */
describe("the UAVI parameter set agrees with its approved rows", () => {
  it("matches every approved numeric parameter", () => {
    const { numeric } = approvedRows();
    for (const [key, value] of Object.entries(APPROVED_NUMERIC_PARAMETERS)) {
      expect(numeric.has(key), `${key} is not an approved row`).toBe(true);
      expect(numeric.get(key), `${key} disagrees with its approved row`).toBe(value);
    }
  });

  it("matches every approved textual parameter", () => {
    const { text } = approvedRows();
    for (const [key, value] of Object.entries(APPROVED_TEXT_PARAMETERS)) {
      expect(text.has(key), `${key} is not an approved row`).toBe(true);
      expect(text.get(key), `${key} disagrees with its approved row`).toBe(value);
    }
  });

  it("records every unresolved parameter as a draft row and never as an approved one", () => {
    const { numeric, text } = approvedRows();
    for (const key of UNRESOLVED_PARAMETERS) {
      expect(numeric.has(key), `${key} was approved`).toBe(false);
      expect(text.has(key), `${key} was approved`).toBe(false);
      expect(MIGRATION).toContain(`('${key}', 'UNRESOLVED'`);
    }
  });
});

describe("the frozen values themselves", () => {
  it("fixes the aggregation form as the weighted arithmetic mean", () => {
    expect(UAVI_AGGREGATION_FORM).toBe("weighted_arithmetic_mean_of_constituent_volatility");
    // Named so that a regression to version 0.1.0-draft's root-mean-square form is a visible
    // change to a parameter rather than a quiet change to an expression.
    expect(UAVI_AGGREGATION_FORM).not.toContain("root_mean_square");
  });

  it("fixes the calendar minute constants", () => {
    expect(N30).toBe(43_200);
    expect(N365).toBe(525_600);
  });

  it("fixes the two publication gates and no others", () => {
    expect(MIN_COVERED_PARENT_WEIGHT).toBe(0.8);
    expect(MIN_COVERED_ISSUER_COUNT).toBe(8);
    expect(CONCENTRATION_PUBLICATION_GATE).toBe("none");
  });

  it("prohibits any carry of a constituent variance", () => {
    expect(CONSTITUENT_VARIANCE_CARRY).toBe("prohibited");
  });

  it("keeps the rate curve family and the freshness tolerance unresolved", () => {
    // Both are marked for live-pipeline validation. Choosing either now on implementation
    // convenience is the decision the methodology forbids.
    expect(UNRESOLVED_PARAMETERS).toContain("usd_rate_curve_family");
    expect(UNRESOLVED_PARAMETERS).toContain("quote_freshness_tolerance");
  });
});

describe("the methodology document matches what the code computes", () => {
  const DOC = readFileSync(path.join(process.cwd(), "docs/methodology/uavi.md"), "utf8");

  it("states the arithmetic aggregation and marks the RMS form as superseded", () => {
    expect(DOC).toContain("UAVI_t = 100 × Σ_{i∈C_t} v_i,t × σ_i,30,t");
    expect(DOC).toContain("weighted arithmetic mean");
    // The old form may still be named -- the version history and the research appendix both refer
    // to it -- but never as what UAVI publishes.
    expect(DOC).not.toContain("`UAVI_t = 100 × sqrt(V_t)`");
  });

  it("states the frozen gates and the absence of a concentration gate", () => {
    expect(DOC).toContain("`W_t ≥ 0.80`");
    expect(DOC).toContain("`|C_t| ≥ 8`");
    expect(DOC).toContain("no concentration gate in V1");
  });

  it("states the frozen snapshot instant in a named zone", () => {
    expect(DOC).toContain("15:45:00.000 America/New_York");
    expect(DOC).toContain("never as a fixed UTC offset");
  });

  it("resolves the locked-versus-crossed quote predicate explicitly", () => {
    expect(DOC).toContain("A locked quote is valid; only a crossed quote is rejected");
  });

  it("carries the version this code stamps its calculations with", () => {
    expect(DOC).toContain("version 0.2.0-draft");
  });
});
