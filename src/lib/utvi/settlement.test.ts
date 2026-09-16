import { describe, expect, it } from "vitest";

import { calculateUtvi, canCalculate, changesForPeriods, percentageChange, periodStartDate, UtviCoverageError } from "@/lib/utvi/calculate";
import {
  SETTLEMENT_LAG_DAYS,
  daysBetween,
  isSettled,
  lastCompletedUtcDate,
  settlementStateFor,
  settlementTargetDate,
  utcDateOf,
} from "@/lib/utvi/settlement";
import { clampToServableRange, planBackfill, splitIntoWindows, verifyCoverage } from "@/lib/utvi/windows";
import type { DailySnapshot, ModelObservation } from "@/lib/utvi/types";

/** 2026-09-16T01:07Z, the instant Phase 1A measured settlement at. */
const NOW = new Date("2026-09-16T01:07:05.334Z");

describe("UTC day boundaries", () => {
  it("names the current and last completed UTC day", () => {
    expect(utcDateOf(NOW)).toBe("2026-09-16");
    expect(lastCompletedUtcDate(NOW)).toBe("2026-09-15");
  });

  it("treats one second past midnight as a new day, since the source's clamp does", () => {
    expect(lastCompletedUtcDate(new Date("2026-09-16T00:00:01Z"))).toBe("2026-09-15");
    expect(lastCompletedUtcDate(new Date("2026-09-15T23:59:59Z"))).toBe("2026-09-14");
  });

  it("counts whole days across a month boundary", () => {
    expect(daysBetween("2026-08-31", "2026-09-02")).toBe(2);
    expect(daysBetween("2026-09-15", "2026-09-13")).toBe(-2);
  });
});

describe("settlement", () => {
  it("leaves the just-closed day provisional, which is the day Phase 1A watched accrue", () => {
    expect(settlementStateFor("2026-09-15", NOW)).toBe("provisional");
    expect(isSettled("2026-09-15", NOW)).toBe(false);
  });

  it("settles the days that measured exactly zero drift", () => {
    // 2026-09-14 and 2026-09-13 were byte-identical across four window shapes.
    expect(settlementStateFor("2026-09-14", NOW)).toBe("final");
    expect(settlementStateFor("2026-09-13", NOW)).toBe("final");
  });

  it("uses a lag of one calculation day, stated rather than implied", () => {
    expect(SETTLEMENT_LAG_DAYS).toBe(1);
  });

  it("names the date a daily run should re-read to confirm settlement", () => {
    expect(settlementTargetDate(NOW)).toBe("2026-09-14");
  });

  it("does not settle a future date", () => {
    expect(isSettled("2026-09-20", NOW)).toBe(false);
  });
});

describe("backfill windows", () => {
  it("clamps a request below the floor forward and above the last completed day back", () => {
    expect(clampToServableRange("2024-01-01", "2026-09-16", NOW)).toEqual({
      startDate: "2025-01-01",
      endDate: "2026-09-15",
    });
  });

  it("returns null when nothing is servable", () => {
    expect(clampToServableRange("2024-01-01", "2024-06-01", NOW)).toBeNull();
    expect(clampToServableRange("2026-09-20", "2026-09-30", NOW)).toBeNull();
  });

  it("splits the full history into two requests, because the cap is 366 days", () => {
    // Measured: "Date range cannot exceed 366 days (requested 623)."
    const plan = planBackfill("2025-01-01", "2026-09-15", NOW);
    expect(plan).not.toBeNull();
    expect(plan!.windows).toHaveLength(2);
    expect(plan!.windows[0]).toMatchObject({ startDate: "2025-01-01", dayCount: 366 });
    expect(plan!.windows[1]!.endDate).toBe("2026-09-15");
    expect(plan!.expectedDates).toHaveLength(623);
  });

  it("never exceeds the cap and never overlaps or leaves a gap between windows", () => {
    const windows = splitIntoWindows("2025-01-01", "2026-09-15");
    for (const window of windows) expect(window.dayCount).toBeLessThanOrEqual(366);
    for (let i = 1; i < windows.length; i += 1) {
      const previousEnd = Date.parse(`${windows[i - 1]!.endDate}T00:00:00Z`);
      const thisStart = Date.parse(`${windows[i]!.startDate}T00:00:00Z`);
      expect(thisStart - previousEnd).toBe(86_400_000);
    }
    const total = windows.reduce((sum, w) => sum + w.dayCount, 0);
    expect(total).toBe(623);
  });

  it("uses one window when the range fits", () => {
    expect(splitIntoWindows("2026-09-13", "2026-09-15")).toEqual([
      { startDate: "2026-09-13", endDate: "2026-09-15", dayCount: 3 },
    ]);
  });
});

describe("coverage verification", () => {
  it("passes on exact coverage", () => {
    expect(verifyCoverage(["2026-09-14", "2026-09-15"], ["2026-09-14", "2026-09-15"]).complete).toBe(true);
  });

  it("reports a gap, a duplicate and an unexpected date separately", () => {
    const result = verifyCoverage(
      ["2026-09-13", "2026-09-14", "2026-09-15"],
      ["2026-09-13", "2026-09-15", "2026-09-15", "2026-09-20"],
    );
    expect(result).toMatchObject({
      complete: false,
      missing: ["2026-09-14"],
      duplicated: ["2026-09-15"],
      unexpected: ["2026-09-20"],
    });
  });
});

/* ---------- calculation ---------- */

const observation = (
  permaslug: string,
  tokens: bigint,
  state: ModelObservation["labAttributionState"] = "evidenced",
  isResidual = false,
): ModelObservation => ({
  permaslug,
  namespace: permaslug.includes("/") ? permaslug.split("/")[0]! : null,
  variant: null,
  baseSlug: permaslug,
  tokens,
  isResidual,
  labSlug: state === "evidenced" ? "deepseek" : null,
  labAttributionState: state,
  qualityFlags: [],
});

function snapshot(overrides: Partial<DailySnapshot> = {}): DailySnapshot {
  const observations = overrides.observations ?? [
    observation("deepseek/v4", 900n),
    observation("stealth/ox-alpha", 100n, "undisclosed"),
    observation("other", 50n, "not_applicable", true),
  ];
  const named = observations.filter((o) => !o.isResidual);
  const residual = observations.filter((o) => o.isResidual);
  const attributed = named.reduce((s, o) => s + o.tokens, 0n);
  const residualTokens = residual.reduce((s, o) => s + o.tokens, 0n);
  return {
    observationDate: "2026-09-15",
    coverageState: "covered_observed",
    totalTokens: attributed + residualTokens,
    attributedTokens: attributed,
    residualTokens,
    namedRowCount: named.length,
    residualRowPresent: residual.length > 0,
    dateContentHash: "a".repeat(64),
    settlementState: "provisional",
    observations,
    ...overrides,
  };
}

describe("the UTVI calculation", () => {
  it("sums the named rows and the tail into the day total", () => {
    const result = calculateUtvi(snapshot());
    expect(result.totalObservedTokens).toBe(1050n);
    expect(result.attributedTokens).toBe(1000n);
    expect(result.modelResidualTokens).toBe(50n);
  });

  it("reports the lab residual as a subset of the attributed volume, not an addition to it", () => {
    const result = calculateUtvi(snapshot());
    expect(result.labResidualTokens).toBe(100n);
    expect(result.labResidualTokens).toBeLessThanOrEqual(result.attributedTokens);
    // The two residuals are different holes and must not be added together.
    expect(result.labResidualTokens).not.toBe(result.modelResidualTokens);
  });

  it("counts the platform's own model into the volume but never into a lab", () => {
    const result = calculateUtvi(
      snapshot({
        observations: [
          observation("deepseek/v4", 900n),
          observation("openrouter/owl-alpha", 100n, "unmapped"),
        ],
      }),
    );
    expect(result.totalObservedTokens).toBe(1000n);
    expect(result.labResidualTokens).toBe(100n);
  });

  it("includes an embedding model, because 0.1.1-draft excludes nothing the source returns", () => {
    const result = calculateUtvi(
      snapshot({ observations: [observation("openai/text-embedding-3-large", 500n)] }),
    );
    expect(result.totalObservedTokens).toBe(500n);
    expect(result.excludedRowCount).toBe(0);
    expect(result.exclusions).toEqual([]);
  });

  it("refuses to calculate a date with no rows: the empty sum never becomes a value", () => {
    const uncovered = snapshot({
      coverageState: "covered_no_rows",
      totalTokens: null,
      attributedTokens: null,
      residualTokens: null,
      namedRowCount: 0,
      observations: [],
    });
    expect(canCalculate(uncovered)).toBe(false);
    expect(() => calculateUtvi(uncovered)).toThrow(UtviCoverageError);
  });

  it("refuses a malformed date", () => {
    expect(canCalculate(snapshot({ coverageState: "malformed" }))).toBe(false);
  });

  it("carries the snapshot's settlement state and content hash onto the value", () => {
    const result = calculateUtvi(snapshot({ settlementState: "final" }));
    expect(result.settlementState).toBe("final");
    expect(result.sourceContentHash).toBe("a".repeat(64));
  });
});

describe("percentage change", () => {
  it("computes a percentage from two multi-trillion values without losing the low digits", () => {
    expect(percentageChange(18_120_484_812_487n, 16_730_791_173_422n)).toBeCloseTo(8.3062, 3);
  });

  it("is null rather than zero when there is no comparison", () => {
    expect(percentageChange(100n, null)).toBeNull();
    expect(percentageChange(100n, undefined)).toBeNull();
  });

  it("is null rather than an infinity on a zero base", () => {
    expect(percentageChange(100n, 0n)).toBeNull();
  });

  it("is zero only when the value genuinely did not move", () => {
    expect(percentageChange(100n, 100n)).toBe(0);
  });

  it("anchors each period on the calendar, not on a count of available points", () => {
    expect(periodStartDate("2026-09-15", "1D")).toBe("2026-09-14");
    expect(periodStartDate("2026-09-15", "1W")).toBe("2026-09-08");
    expect(periodStartDate("2026-09-15", "1M")).toBe("2026-08-15");
    expect(periodStartDate("2026-09-15", "3M")).toBe("2026-06-15");
    expect(periodStartDate("2026-09-15", "6M")).toBe("2026-03-15");
    expect(periodStartDate("2026-09-15", "1Y")).toBe("2025-09-15");
  });

  it("returns null for every period a first point cannot reach, and never zero", () => {
    const changes = changesForPeriods("2025-01-01", 1_000n, new Map());
    expect(Object.values(changes).every((value) => value === null)).toBe(true);
  });

  it("computes only the periods history actually reaches", () => {
    const history = new Map([
      ["2026-09-14", 16_730_791_173_422n],
      ["2026-08-15", 10_000_000_000_000n],
    ]);
    const changes = changesForPeriods("2026-09-15", 17_750_400_225_262n, history);
    expect(changes["1D"]).not.toBeNull();
    expect(changes["1M"]).not.toBeNull();
    expect(changes["1W"]).toBeNull();
    expect(changes["1Y"]).toBeNull();
  });
});
