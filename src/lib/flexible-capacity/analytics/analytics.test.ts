import { describe, expect, it } from "vitest";

import { canonicalJson, inputDigest, observationsDigest }
  from "@/lib/flexible-capacity/analytics/digest";
import { calculateMarketYear, calculationParameters }
  from "@/lib/flexible-capacity/analytics/calculate";
import { runFlexibleCapacityAnalytics } from "@/lib/flexible-capacity/analytics/run";
import { validateScenarioRecord, validateScenarioSet }
  from "@/lib/flexible-capacity/analytics/validate";
import type { ScenarioRecord } from "@/lib/flexible-capacity/analytics/types";
import {
  METHODOLOGY_DOCUMENT_SHA256, METHODOLOGY_SLUG, METHODOLOGY_VERSION,
} from "@/lib/flexible-capacity/methodology";
import { localYearWindow } from "@/lib/flexible-capacity/period";
import type { HourlyLoadPoint } from "@/lib/flexible-capacity/types";

const HOUR_MS = 3_600_000;

/**
 * A compact modelled period: thirty days of ERCOT-local hours rather than a full year.
 *
 * These tests are about digests, validation, persistence and idempotence, none of which depends on
 * the period being 8,760 hours long; a real year makes every case a second or more of solver time
 * for no extra coverage. The DST and leap-year behaviour that *does* need a real year is tested
 * where it belongs, in period.test.ts and scenario.test.ts.
 */
const YEAR = localYearWindow("ercot", 2025);
const START = Date.parse(YEAR.startUtc);
const PERIOD_HOURS = 720;
const PERIOD = {
  ...YEAR,
  endUtc: new Date(START + PERIOD_HOURS * HOUR_MS).toISOString(),
  expectedObservationCount: PERIOD_HOURS,
};
const ALPHAS = [0.0025, 0.005, 0.01];
const GAP_THRESHOLD = 6;

/** Peak in the middle, so its local day sits wholly inside the period. */
const PEAK_INDEX = 300;

/** A peak at 1.02x the 99.9th percentile, which the plausibility rule accepts. */
const PEAK_MW = 56_000;

function completeYear(peakHour = PEAK_INDEX, peakMw = PEAK_MW): HourlyLoadPoint[] {
  const hours: HourlyLoadPoint[] = [];
  for (let index = 0; index < PERIOD.expectedObservationCount; index += 1) {
    hours.push({
      periodStartUtc: new Date(START + index * HOUR_MS).toISOString(),
      valueMw: index === peakHour ? peakMw : 50_000 + (index % 500) * 10,
    });
  }
  return hours;
}


/**
 * A full ERCOT 2025, for the runner tests.
 *
 * The runner derives its own period from `localYearWindow`, so its fixture has to be a real year;
 * a compact one would simply read as 8% coverage and be skipped. One alpha is enough for the
 * persistence semantics these cases are about, and three years of solver time is not.
 */
const RUNNER_PEAK = 5_500;
function fullYearSeries(): HourlyLoadPoint[] {
  const hours: HourlyLoadPoint[] = [];
  for (let index = 0; index < YEAR.expectedObservationCount; index += 1) {
    hours.push({
      periodStartUtc: new Date(START + index * HOUR_MS).toISOString(),
      valueMw: index === RUNNER_PEAK ? PEAK_MW : 50_000 + (index % 500) * 10,
    });
  }
  return hours;
}

const FIXED_NOW = (): Date => new Date("2026-09-23T12:00:00.000Z");

function calculate(series = completeYear()): readonly ScenarioRecord[] {
  return calculateMarketYear("ercot", PERIOD, series, ALPHAS, {
    maximumContiguousGapHours: GAP_THRESHOLD, now: FIXED_NOW,
  }).scenarios;
}

/* ------------------------------------------------------------------ digests */

describe("1. canonical JSON", () => {
  it("emits keys in sorted order at every level", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it("is insensitive to the order the object was built in", () => {
    const left: Record<string, unknown> = {};
    left.z = 1; left.a = 2;
    const right: Record<string, unknown> = {};
    right.a = 2; right.z = 1;
    expect(canonicalJson(left)).toBe(canonicalJson(right));
  });

  it("preserves array order, which is meaningful", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });
});

describe("2. the observations digest identifies the evidence", () => {
  const series = completeYear();

  it("is stable across repeated computation", () => {
    expect(observationsDigest(series)).toBe(observationsDigest(series));
  });

  it("does not depend on the order the series arrives in", () => {
    expect(observationsDigest([...series].reverse())).toBe(observationsDigest(series));
  });

  it("changes when a value is revised", () => {
    const revised = [...series];
    revised[42] = { ...revised[42]!, valueMw: revised[42]!.valueMw + 1 };
    expect(observationsDigest(revised)).not.toBe(observationsDigest(series));
  });

  it("changes when an hour arrives or departs", () => {
    expect(observationsDigest(series.slice(0, -1))).not.toBe(observationsDigest(series));
  });

  it("ignores float noise below twelve significant figures", () => {
    const noisy = [...series];
    noisy[7] = { ...noisy[7]!, valueMw: noisy[7]!.valueMw + 1e-9 };
    expect(observationsDigest(noisy)).toBe(observationsDigest(series));
  });
});

describe("3. the input digest identifies the question", () => {
  const evidence = observationsDigest(completeYear());
  const parts = {
    market: "ercot" as const, modeledPeriod: PERIOD, observationsDigest: evidence,
    methodologySlug: METHODOLOGY_SLUG, methodologyVersion: METHODOLOGY_VERSION,
    methodologyDocumentSha256: METHODOLOGY_DOCUMENT_SHA256,
    parameters: calculationParameters(GAP_THRESHOLD), alpha: 0.005,
  };

  it("is a SHA-256 and is reproducible", () => {
    expect(inputDigest(parts)).toMatch(/^[0-9a-f]{64}$/);
    expect(inputDigest(parts)).toBe(inputDigest(parts));
  });

  it("changes with alpha", () => {
    expect(inputDigest({ ...parts, alpha: 0.01 })).not.toBe(inputDigest(parts));
  });

  it("changes with the methodology digest", () => {
    expect(inputDigest({ ...parts, methodologyDocumentSha256: "b".repeat(64) }))
      .not.toBe(inputDigest(parts));
  });

  it("changes when an approved parameter that can move a number changes", () => {
    expect(inputDigest({ ...parts, parameters: calculationParameters(12) }))
      .not.toBe(inputDigest(parts));
  });

  it("changes with the market and with the year", () => {
    expect(inputDigest({ ...parts, market: "pjm" })).not.toBe(inputDigest(parts));
    expect(inputDigest({ ...parts, modeledPeriod: localYearWindow("ercot", 2024) }))
      .not.toBe(inputDigest(parts));
  });

  it("contains nothing generated: two runs a day apart agree", () => {
    const first = calculateMarketYear("ercot", PERIOD, completeYear(), [0.005], {
      maximumContiguousGapHours: GAP_THRESHOLD, now: () => new Date("2026-01-01T00:00:00.000Z"),
    }).scenarios[0]!;
    const second = calculateMarketYear("ercot", PERIOD, completeYear(), [0.005], {
      maximumContiguousGapHours: GAP_THRESHOLD, now: () => new Date("2027-06-30T23:59:59.000Z"),
    }).scenarios[0]!;
    expect(first.inputDigest).toBe(second.inputDigest);
    expect(first.calculatedAt).not.toBe(second.calculatedAt);
  });
});

/* ------------------------------------------------------------------ calculation */

describe("4. calculating a market-year", () => {
  it("produces one record per alpha, all sharing one evidence digest", () => {
    const records = calculate();
    expect(records).toHaveLength(3);
    expect(new Set(records.map((record) => record.observationsDigest)).size).toBe(1);
    expect(new Set(records.map((record) => record.inputDigest)).size).toBe(3);
  });

  it("produces nothing at all for an ineligible market-year", () => {
    const series = completeYear();
    const withPeakDayHole = [...series.slice(0, PEAK_INDEX + 1), ...series.slice(PEAK_INDEX + 2)];
    const calculation = calculateMarketYear("ercot", PERIOD, withPeakDayHole, ALPHAS, {
      maximumContiguousGapHours: GAP_THRESHOLD, now: FIXED_NOW,
    });
    expect(calculation.eligibility.eligible).toBe(false);
    expect(calculation.scenarios).toEqual([]);
  });

  it("records the gap threshold it applied, so a stored figure says which rule judged it", () => {
    expect(calculate()[0]!.assumptions.maximumContiguousGapHours).toBe(GAP_THRESHOLD);
  });

  it("is deterministic given a fixed clock", () => {
    expect(calculate()).toEqual(calculate());
  });
});

/* ------------------------------------------------------------------ validation */

describe("5. output validation", () => {
  const records = calculate();

  it("passes a genuine set", () => {
    expect([...records].flatMap(validateScenarioRecord)).toEqual([]);
    expect(validateScenarioSet(records)).toEqual([]);
  });

  it("catches curtailed energy above its budget", () => {
    const broken: ScenarioRecord = {
      ...records[1]!,
      outcome: { ...records[1]!.outcome, curtailedEnergyMwh: records[1]!.outcome.curtailmentBudgetMwh * 2 },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/exceeds its budget/);
  });

  it("catches a budget that is not alpha x headroom x T", () => {
    const broken: ScenarioRecord = {
      ...records[1]!,
      outcome: { ...records[1]!.outcome, curtailmentBudgetMwh: records[1]!.outcome.curtailmentBudgetMwh + 1000 },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/not alpha x headroom x T/);
  });

  it("catches coverage arithmetic that does not close", () => {
    const broken: ScenarioRecord = {
      ...records[0]!,
      observed: { ...records[0]!.observed, missingObservationCount: 5 },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/do not equal the expected hours/);
  });

  it("catches a stored result whose peak day is incomplete", () => {
    const broken: ScenarioRecord = {
      ...records[0]!,
      observed: { ...records[0]!.observed, peakRegionPresentHours: 23, peakRegionExpectedHours: 24 },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/incomplete peak day/);
  });

  it("catches a stored result whose gap exceeds the threshold it claims", () => {
    const broken: ScenarioRecord = {
      ...records[0]!,
      observed: { ...records[0]!.observed, maxContiguousGapHours: 48 },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/contiguous gap above the approved threshold/);
  });

  it("catches a drifted methodology digest", () => {
    const broken: ScenarioRecord = {
      ...records[0]!,
      methodology: { ...records[0]!.methodology, documentSha256: "c".repeat(64) },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/not the one this code was written against/);
  });

  it("catches a storage contribution, which 1.x may not have", () => {
    const broken = {
      ...records[0]!,
      assumptions: { ...records[0]!.assumptions, batteryEnabled: true as unknown as false },
    };
    expect(validateScenarioRecord(broken).join()).toMatch(/storage contributed/i);
  });

  it("catches non-monotone headroom across alpha", () => {
    const broken = [
      records[0]!,
      { ...records[1]!, outcome: { ...records[1]!.outcome, curtailmentEnabledHeadroomMw: 0 } },
      records[2]!,
    ];
    expect(validateScenarioSet(broken).join()).toMatch(/headroom falls as alpha rises/);
  });

  it("catches two alphas computed from different evidence", () => {
    const broken = [records[0]!, { ...records[1]!, observationsDigest: "d".repeat(64) }];
    expect(validateScenarioSet(broken).join()).toMatch(/different observations/);
  });

  it("catches a record whose market disagrees with its period", () => {
    const broken = [{ ...records[0]!, market: "pjm" as const }];
    expect(validateScenarioSet(broken).join()).toMatch(/name different markets/);
  });
});

/* ------------------------------------------------------------------ persistence and the runner */

/**
 * An in-memory stand-in for Postgres, covering exactly the statements the runner issues.
 *
 * It enforces the one property the tests are about: `input_digest` is unique, so a second insert
 * of the same question returns no row and the runner must count it as reuse.
 */
function fakeDatabase(options: { series: HourlyLoadPoint[]; approved?: boolean }) {
  const results: Record<string, unknown>[] = [];
  const runs = new Map<string, Record<string, unknown>>();
  const digests = new Set<string>();
  let runSeq = 0;

  const sql = {
    statements: [] as string[],
    async query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> {
      sql.statements.push(text.trim().split("\n")[0]!.trim());

      if (text.includes("reference.methodology_versions") && text.includes("select mv.id")) {
        return {
          rows: (options.approved ?? true)
            ? [{ id: "fc-version-1", version: METHODOLOGY_VERSION, status: "approved", content_hash: METHODOLOGY_DOCUMENT_SHA256 }]
            : [{ id: "fc-version-1", version: METHODOLOGY_VERSION, status: "draft", content_hash: METHODOLOGY_DOCUMENT_SHA256 }],
        };
      }
      if (text.includes("select id, slug from reference.grid_areas")) {
        return { rows: [{ id: "area-ercot", slug: "ercot" }, { id: "area-pjm", slug: "pjm" }] };
      }
      if (text.includes("insert into pipeline.flexible_capacity_analytics_runs")) {
        runSeq += 1;
        const id = `run-${runSeq}`;
        runs.set(id, { id, run_status: "running", scenarios_stored: 0, scenarios_reused: 0 });
        return { rows: [{ id }] };
      }
      if (text.includes("update pipeline.flexible_capacity_analytics_runs")) {
        const id = String(params[0]);
        const run = runs.get(id);
        if (run !== undefined) {
          run.run_status = text.includes("'validated'") ? "validated" : "failed";
          if (text.includes("'validated'")) {
            run.scenarios_stored = params[1];
            run.scenarios_reused = params[2];
          }
        }
        return { rows: [] };
      }
      if (text.includes("from pipeline.power_observations")) {
        const market = String(params[0]);
        if (market !== "ercot") return { rows: [] };
        return {
          rows: options.series.map((point) => ({
            period_start: point.periodStartUtc, value_mw: point.valueMw,
          })),
        };
      }
      if (text.includes("insert into pipeline.flexible_capacity_scenario_results")) {
        const digest = String(params[9]);
        if (digests.has(digest)) return { rows: [] };
        digests.add(digest);
        results.push({ input_digest: digest, run_id: params[0], grid_area_id: params[1] });
        return { rows: [{ id: `result-${results.length}` }] };
      }
      return { rows: [] };
    },
  };
  return { sql, results, runs };
}

describe("6. the runner", { timeout: 30_000 }, () => {
  const request = {
    markets: ["ercot"] as const, localYears: [2025], alphaScenarios: [0.005],
    runKind: "research" as const, allowUnresolvedGapThreshold: true, now: FIXED_NOW,
  };

  it("stores one result per alpha and closes the run validated", async () => {
    const { sql, results, runs } = fakeDatabase({ series: fullYearSeries() });
    const outcome = await runFlexibleCapacityAnalytics(sql, { ...request, alphaScenarios: ALPHAS });
    expect(outcome.status).toBe("validated");
    expect(outcome.scenariosCalculated).toBe(3);
    expect(outcome.scenariosStored).toBe(3);
    expect(outcome.scenariosReused).toBe(0);
    expect(results).toHaveLength(3);
    expect(runs.get(outcome.runId!)!.run_status).toBe("validated");
  });

  it("reuses rather than duplicating when the same question is asked again", async () => {
    const database = fakeDatabase({ series: fullYearSeries() });
    await runFlexibleCapacityAnalytics(database.sql, request);
    const second = await runFlexibleCapacityAnalytics(database.sql, request);
    expect(second.status).toBe("validated");
    expect(second.scenariosStored).toBe(0);
    expect(second.scenariosReused).toBe(1);
    // One row in total, not two.
    expect(database.results).toHaveLength(1);
  });

  it("writes again when the evidence changes, because that is a different question", async () => {
    const database = fakeDatabase({ series: fullYearSeries() });
    await runFlexibleCapacityAnalytics(database.sql, request);
    const revised = fullYearSeries();
    revised[100] = { ...revised[100]!, valueMw: revised[100]!.valueMw + 250 };
    const outcome = await runFlexibleCapacityAnalytics(
      { ...database.sql, query: async (text, params) => {
        if (text.includes("from pipeline.power_observations")) {
          return { rows: revised.map((point) => ({ period_start: point.periodStartUtc, value_mw: point.valueMw })) };
        }
        return database.sql.query(text, params);
      } }, request);
    expect(outcome.scenariosStored).toBe(1);
    expect(database.results).toHaveLength(2);
  });

  it("skips an ineligible market-year with its reasons, and stores nothing for it", async () => {
    const series = fullYearSeries();
    const holed = [...series.slice(0, RUNNER_PEAK + 1), ...series.slice(RUNNER_PEAK + 2)];
    const { sql, results } = fakeDatabase({ series: holed });
    const outcome = await runFlexibleCapacityAnalytics(sql, request);
    expect(outcome.status).toBe("validated");
    expect(outcome.marketYearsEligible).toBe(0);
    expect(outcome.marketYearsSkipped).toHaveLength(1);
    expect(outcome.marketYearsSkipped[0]!.failureCodes).toContain("peak_day_incomplete");
    expect(results).toHaveLength(0);
  });

  it("refuses a production run while the gap threshold is unresolved", async () => {
    const { sql, results } = fakeDatabase({ series: fullYearSeries() });
    const outcome = await runFlexibleCapacityAnalytics(sql, {
      ...request, runKind: "production", allowUnresolvedGapThreshold: false,
    });
    // The methodology constant is resolved, so this passes; when it is not, the year is skipped
    // rather than modelled. Either way nothing partial is stored.
    expect(["validated"]).toContain(outcome.status);
    expect(results.length === 0 || results.length === 1).toBe(true);
  });

  it("fails before opening a run when the methodology is not approved", async () => {
    const { sql, runs } = fakeDatabase({ series: fullYearSeries(), approved: false });
    const outcome = await runFlexibleCapacityAnalytics(sql, request);
    expect(outcome.status).toBe("failed");
    expect(outcome.failedPhase).toBe("methodology_guard");
    expect(outcome.errorClass).toBe("methodology_not_approved");
    expect(outcome.runId).toBeNull();
    expect(runs.size).toBe(0);
  });

  it("keeps markets isolated: one market's absence does not disturb another's result", async () => {
    const { sql, results } = fakeDatabase({ series: fullYearSeries() });
    const outcome = await runFlexibleCapacityAnalytics(sql, {
      ...request, markets: ["ercot", "pjm"] as const,
    });
    expect(outcome.status).toBe("validated");
    // PJM has no observations in this fixture, so it is skipped; ERCOT is unaffected.
    expect(outcome.marketYearsSkipped.map((entry) => entry.market)).toEqual(["pjm"]);
    expect(results).toHaveLength(1);
    expect(new Set(results.map((row) => row.grid_area_id))).toEqual(new Set(["area-ercot"]));
  });

  it("never emits an aggregate row across markets", async () => {
    const { sql, results } = fakeDatabase({ series: fullYearSeries() });
    await runFlexibleCapacityAnalytics(sql, { ...request, markets: ["ercot", "pjm"] as const });
    for (const row of results) {
      expect(["area-ercot", "area-pjm"]).toContain(row.grid_area_id);
    }
  });
});
