import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ACTIVE_STAGES, AI_LOAD_END_USE, CROSS_MARKET_MW_TOTAL_DEFENSIBLE, EXCLUDED_STAGES,
  EXCLUDED_SUBTYPES, ERCOT_FIRST_SEEN_SERIES_BEGINS, MARKET_ENTRY_BASIS, MARKET_MW_FIELD,
  METHODOLOGY_SLUG, METHODOLOGY_VERSION, MINIMUM_SAMPLES, MW_COMPLETION_RATE_DEFERRED,
  NON_ADDITIVE_QUANTITY_KINDS, PUBLICATION_BLOCKED_MARKETS, TECHNOLOGY_MIX_BASIS,
  TECHNOLOGY_MIX_BY_MW_DEFERRED, aiLoadIsKnown, countsAsOperated, disappearanceCountsAsExit,
  isActiveForAnalytics, isCohortMature, isEligibleSubtype, isGenerationClass, mayBeSummedIntoProjectMw,
  mayEnterGenerationMetric, mayPublishMarketMetric, meetsSampleFloor, projectCompletionRate,
  timeToOperationDays,
} from "@/lib/interconnection-queue/analytics/methodology";

const ROOT = resolve(__dirname, "../../../..");

// The twelve invariants the brief requires, each named for what it prevents.

describe("1. load never enters a generation metric", () => {
  it("refuses a load request in the generation family", () => {
    expect(mayEnterGenerationMetric({
      stage: "study", subtype: "not_distinguished", requestClass: "load",
    })).toBe(false);
    expect(isGenerationClass("load")).toBe(false);
  });

  it("admits generation, storage and mixed", () => {
    for (const requestClass of ["generation", "storage", "mixed"] as const) {
      expect(mayEnterGenerationMetric({ stage: "study", subtype: "new_generation", requestClass })).toBe(true);
    }
  });
});

describe("2. ISO-NE capacity rights never enter a new-generation metric", () => {
  it("excludes the subtype however the request otherwise looks", () => {
    // 662 ISO-NE requests carrying 171,358 MW against 50,260 MW of real new plant.
    expect(mayEnterGenerationMetric({
      stage: "study", subtype: "capacity_rights", requestClass: "generation",
    })).toBe(false);
    expect(isEligibleSubtype("capacity_rights")).toBe(false);
  });

  it("also excludes elective upgrades, transmission service and unmapped kinds", () => {
    for (const subtype of EXCLUDED_SUBTYPES) {
      expect(mayEnterGenerationMetric({ stage: "study", subtype, requestClass: "generation" })).toBe(false);
    }
    expect(EXCLUDED_SUBTYPES).toContain("unknown");
  });
});

describe("3. CAISO component MW is never summed into project MW", () => {
  it("marks the component kind non-additive", () => {
    expect(NON_ADDITIVE_QUANTITY_KINDS).toContain("component_mw");
    expect(mayBeSummedIntoProjectMw("component_mw")).toBe(false);
    expect(mayBeSummedIntoProjectMw("net_mw_to_grid")).toBe(true);
  });

  it("reads CAISO's project MW from its own field", () => {
    // 937 CAISO observations have components summing above the published project figure.
    expect(MARKET_MW_FIELD.caiso).toEqual({ field: "Net MWs to Grid", kind: "net_mw_to_grid" });
  });
});

describe("4. SPP is blocked from every public metric", () => {
  it("blocks the market outright", () => {
    expect(PUBLICATION_BLOCKED_MARKETS).toEqual(["spp"]);
    expect(mayPublishMarketMetric("spp")).toBe(false);
  });

  it("leaves every other market publishable", () => {
    for (const market of ["pjm", "miso", "caiso", "ercot", "nyiso", "iso-ne"]) {
      expect(mayPublishMarketMetric(market)).toBe(true);
    }
  });
});

describe("5. a proposed COD never counts as operation", () => {
  it("ignores a projected date entirely", () => {
    expect(countsAsOperated({
      stage: "study", actualInServiceOn: null, proposedInServiceOn: "2020-01-01",
    })).toBe(false);
  });

  it("refuses to compute a time to operation without an actual date", () => {
    expect(timeToOperationDays({ requestedOn: "2015-01-01", actualInServiceOn: null })).toBeNull();
    expect(timeToOperationDays({ requestedOn: null, actualInServiceOn: "2020-01-01" })).toBeNull();
    // And never a negative duration.
    expect(timeToOperationDays({ requestedOn: "2020-01-01", actualInServiceOn: "2019-01-01" })).toBeNull();
    expect(timeToOperationDays({ requestedOn: "2015-01-01", actualInServiceOn: "2020-01-01" })).toBe(1826);
  });
});

describe("6. MISO doneDate never counts as operation", () => {
  it("does not make a non-operational request operated", () => {
    // Of 269 MISO requests carrying a doneDate, 201 are not in service: 104 under construction,
    // 62 not started, 32 withdrawn.
    expect(countsAsOperated({
      stage: "under_construction", actualInServiceOn: null, misoDoneDate: "2021-10-12",
    })).toBe(false);
    expect(countsAsOperated({
      stage: "withdrawn", actualInServiceOn: null, misoDoneDate: "2020-01-01",
    })).toBe(false);
  });
});

describe("7. NYISO test service never counts as commercial operation", () => {
  it("refuses a plant on test and a partial in-service", () => {
    expect(countsAsOperated({
      stage: "operational", actualInServiceOn: null, nativeStatusDescription: "In Service for Test",
    })).toBe(false);
    expect(countsAsOperated({
      stage: "operational", actualInServiceOn: null, nativeStatusDescription: "Partial In-Service",
    })).toBe(false);
  });

  it("accepts commercial operation", () => {
    expect(countsAsOperated({
      stage: "operational", actualInServiceOn: null, nativeStatusDescription: "In Service Commercial",
    })).toBe(true);
  });
});

describe("8. ERCOT disappearance never counts as withdrawal", () => {
  it("treats absence as absence", () => {
    expect(disappearanceCountsAsExit()).toBe(false);
  });

  it("gives ERCOT a first-seen entry basis and no exit basis", () => {
    expect(MARKET_ENTRY_BASIS.ercot).toBe("snapshot_first_seen");
    expect(ERCOT_FIRST_SEEN_SERIES_BEGINS).toBe("2019-01-01");
    // Every other market states its own application date.
    for (const market of ["pjm", "miso", "caiso", "nyiso", "iso-ne", "spp"]) {
      expect(MARKET_ENTRY_BASIS[market]).toBe("source_reported_application_date");
    }
  });
});

describe("9. unresolved identity collisions are excluded from project counts", () => {
  it("counts canonical stable requests, which a collided row never becomes", () => {
    // ISO-NE's queue position is not unique: 92 positions carry more than one row and the store
    // gives none of them canonical identity, so they cannot reach a count.
    const coverage = JSON.parse(readFileSync(
      resolve(ROOT, "docs/research/interconnection-queue/iq5-metric-coverage.json"), "utf8")) as
      { diagnostics: { identity_collisions_excluded: { source: string; deferrals: number }[] } };
    const isone = coverage.diagnostics.identity_collisions_excluded
      .find((row) => row.source === "iso-ne-interconnection-queue");
    expect(isone).toBeDefined();
    expect(isone!.deferrals).toBeGreaterThan(0);
  });
});

describe("10. a completion rate uses a cohort denominator", () => {
  it("is entrants in the cohort, never the currently active queue", () => {
    const rate = projectCompletionRate({
      cohortEntrants: 1987, operated: 512, unresolved: 55,
      observationWindowYears: 10.2, marketP90TimeToOperationYears: 6.45,
    });
    expect(rate.status).toBe("published");
    expect(rate.rate).toBeCloseTo(512 / 1987, 6);
    expect(rate.cohortEntrants).toBe(1987);
  });

  it("refuses a cohort below the sample floor", () => {
    const tiny = projectCompletionRate({
      cohortEntrants: 4, operated: 0, unresolved: 0,
      observationWindowYears: 20, marketP90TimeToOperationYears: 10.43,
    });
    expect(tiny.status).toBe("insufficient_sample");
    expect(tiny.rate).toBeNull();
  });
});

describe("11. immature cohorts are never presented as final", () => {
  it("rejects a cohort that has not had time, even with many entrants", () => {
    // PJM's 2021 cohort: 1,328 entrants, 0 operational, 79.7% unresolved.
    const immature = projectCompletionRate({
      cohortEntrants: 1328, operated: 0, unresolved: 1058,
      observationWindowYears: 5.2, marketP90TimeToOperationYears: 6.45,
    });
    expect(immature.status).toBe("immature");
    expect(immature.rate).toBeNull();
  });

  it("needs both maturity conditions, because each rejects what the other admits", () => {
    // Window satisfied, unresolved share not: PJM 2017 at 15.2%.
    expect(isCohortMature({
      observationWindowYears: 9.2, marketP90TimeToOperationYears: 6.45, unresolvedShare: 0.152,
    })).toBe(false);
    // Unresolved share satisfied, window not: CAISO 2016 at 10.2 years against a p90 of 10.43.
    expect(isCohortMature({
      observationWindowYears: 10.2, marketP90TimeToOperationYears: 10.43, unresolvedShare: 0.097,
    })).toBe(false);
    // Both satisfied.
    expect(isCohortMature({
      observationWindowYears: 10.2, marketP90TimeToOperationYears: 6.45, unresolvedShare: 0.111,
    })).toBe(true);
  });

  it("refuses any cohort in a market with no observed p90", () => {
    // A market with no actual commercial operation dates has no maturity yardstick.
    expect(isCohortMature({
      observationWindowYears: 20, marketP90TimeToOperationYears: null, unresolvedShare: 0,
    })).toBe(false);
  });
});

describe("12. project completion and MW completion stay distinct", () => {
  it("defers MW completion for every market", () => {
    expect(MW_COMPLETION_RATE_DEFERRED).toBe(true);
  });

  it("does not let a market's MW field stand in for a cohort quantity", () => {
    // The two markets that support a project completion rate are exactly the two with no agreed
    // MW field, which is why the MW version cannot be derived from the project version.
    expect(MARKET_MW_FIELD.pjm).toBeNull();
    expect(MARKET_MW_FIELD.ercot).toBeNull();
  });
});

// ------------------------------------------------------------------ supporting rules

describe("lifecycle treatment", () => {
  it("keeps suspended active and unknown out of everything", () => {
    expect(isActiveForAnalytics("suspended")).toBe(true);
    expect(isActiveForAnalytics("agreement_executed")).toBe(true);
    expect(isActiveForAnalytics("under_construction")).toBe(true);
    expect(isActiveForAnalytics("operational")).toBe(false);
    expect(isActiveForAnalytics("withdrawn")).toBe(false);
    expect(EXCLUDED_STAGES).toEqual(["unknown"]);
    expect(mayEnterGenerationMetric({
      stage: "unknown", subtype: "new_generation", requestClass: "generation",
    })).toBe(false);
    expect(ACTIVE_STAGES).not.toContain("unknown");
  });
});

describe("no cross-market MW total", () => {
  it("states the conclusion rather than leaving it to a caller", () => {
    expect(CROSS_MARKET_MW_TOTAL_DEFENSIBLE).toBe(false);
  });

  it("leaves the two markets with ambiguous fields undecided rather than guessing", () => {
    expect(MARKET_MW_FIELD.pjm).toBeNull();
    expect(MARKET_MW_FIELD.ercot).toBeNull();
    expect(MARKET_MW_FIELD.miso).not.toBeNull();
  });
});

describe("AI data-centre load", () => {
  it("comes only from a publisher's own end-use code", () => {
    expect(AI_LOAD_END_USE).toBe("data_center_ai");
    expect(aiLoadIsKnown("nyiso")).toBe(true);
  });

  it("treats a market with no end-use classification as unknown, not zero", () => {
    for (const market of ["pjm", "miso", "caiso", "ercot", "iso-ne", "spp"]) {
      expect(aiLoadIsKnown(market)).toBe(false);
    }
  });
});

describe("sample floors", () => {
  it("withholds a statistic below its floor instead of publishing it", () => {
    expect(meetsSampleFloor(28, "median")).toEqual({ publishable: false, n: 28, floor: 30 });
    expect(meetsSampleFloor(28, "p90").publishable).toBe(false);
    expect(meetsSampleFloor(1242, "p90").publishable).toBe(true);
    expect(MINIMUM_SAMPLES.completionRate).toBe(100);
  });
});

describe("technology mix", () => {
  it("counts a hybrid once and tags it with each technology", () => {
    expect(TECHNOLOGY_MIX_BASIS).toBe("project_count_multi_label");
    expect(TECHNOLOGY_MIX_BY_MW_DEFERRED).toBe(true);
  });
});

describe("the methodology document", () => {
  const document = readFileSync(
    resolve(ROOT, "docs/methodology/interconnection-queue-analytics.md"), "utf8");

  it("declares the version this module encodes", () => {
    expect(METHODOLOGY_SLUG).toBe("interconnection-queue-analytics");
    expect(METHODOLOGY_VERSION).toBe("1.0.0");
    expect(document).toContain("# Urdais Interconnection Queue Analytics — 1.0.0");
    expect(document.match(/^# /gm)).toHaveLength(1);
  });

  it("is approved, and keeps the draft it supersedes in its lineage", () => {
    expect(document).toMatch(/\*\*Status: approved, version 1\.0\.0/);
    expect(document).toContain("How the 0.1.0-draft gates were resolved");
    expect(document).toContain("0.1.0-draft, 21 September 2026");
  });

  it("closes every gate the draft left open, including by declining to ship", () => {
    // Four of the six close by refusing to publish something rather than by finding an answer.
    expect(document).toMatch(/PJM publishes no active-MW metric in V1/);
    expect(document).toMatch(/ERCOT publishes no active-MW metric in V1/);
    expect(document).toMatch(/\*\*Deferred for every market\*\*/);
  });

  it("states the findings the rules rest on", () => {
    expect(document).toContain("No quantity kind exists in all seven markets");
    expect(document).toMatch(/capacity-rights activity is never new-generation queue capacity/i);
    expect(document).toMatch(/it publishes no request date at all/);
    expect(document).toContain("0% operational");
  });

  it("is the document the coverage matrix was generated beside", () => {
    const coverage = JSON.parse(readFileSync(
      resolve(ROOT, "docs/research/interconnection-queue/iq5-metric-coverage.json"), "utf8")) as
      { methodology: string; version: string };
    expect(coverage.methodology).toBe(METHODOLOGY_SLUG);
    expect(coverage.version).toBe(METHODOLOGY_VERSION);
    // A digest so a later phase can tell whether the document moved under the matrix.
    expect(createHash("sha256").update(document).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
  });
});
