import { describe, expect, it } from "vitest";

import {
  evaluateLifecycle,
  lifecycleCarriesLevel,
  type LifecycleInput,
  type PublicationCheck,
} from "@/lib/uavi/read/lifecycle";

const PASSED: PublicationCheck = {
  checkName: "parent_snapshot_production",
  result: "passed",
  parameterKey: null,
  basis: "fixture",
};
const FAILED: PublicationCheck = { ...PASSED, checkName: "option_data_source_admitted", result: "failed" };

function input(overrides: Partial<LifecycleInput> = {}): LifecycleInput {
  return {
    hasPublishedObservation: true,
    latestPublishedAt: "2026-09-18T20:00:00.000Z",
    checks: [PASSED],
    latestUnavailableReason: null,
    freshnessApproved: false,
    ...overrides,
  };
}

describe("the UAVI lifecycle", () => {
  it("is not_initialized when nothing has ever been published", () => {
    // The current production state, and the one the whole surface is shaped around.
    const result = evaluateLifecycle(
      input({ hasPublishedObservation: false, latestPublishedAt: null, checks: [FAILED] }),
    );
    expect(result.lifecycle).toBe("not_initialized");
    expect(result.publicReason).not.toBe("");
    expect(lifecycleCarriesLevel(result.lifecycle)).toBe(false);
  });

  it("is blocked when an upstream dependency stopped the calculation", () => {
    const result = evaluateLifecycle(input({ latestUnavailableReason: "parent_weights_missing" }));
    expect(result.lifecycle).toBe("blocked");
    expect(lifecycleCarriesLevel(result.lifecycle)).toBe(false);
  });

  it("is unavailable when the calculation RAN and a gate refused it", () => {
    // The distinction that matters most on this surface. `unavailable` is the state in which UAVI
    // is working correctly and declining to publish; `blocked` is the state in which it never
    // started. A reader told only "no value" cannot tell those apart.
    for (const reason of ["coverage_below_threshold", "issuer_count_below_threshold", "no_covered_constituents"] as const) {
      const result = evaluateLifecycle(input({ latestUnavailableReason: reason }));
      expect(result.lifecycle, reason).toBe("unavailable");
      expect(result.publicReason).toContain("publication thresholds");
    }
  });

  it("distinguishes a parent failure from a gate failure", () => {
    for (const reason of ["parent_not_production", "parent_weights_missing", "parent_weights_invalid"] as const) {
      expect(evaluateLifecycle(input({ latestUnavailableReason: reason })).lifecycle, reason).toBe("blocked");
    }
  });

  it("is blocked when a publication check is not passing", () => {
    const result = evaluateLifecycle(input({ checks: [PASSED, FAILED] }));
    expect(result.lifecycle).toBe("blocked");
    expect(result.unmetChecks).toEqual(["option_data_source_admitted"]);
  });

  it("is live when an observation is published and nothing is outstanding", () => {
    const result = evaluateLifecycle(input());
    expect(result.lifecycle).toBe("live");
    expect(result.publicReason).toBe("");
    expect(lifecycleCarriesLevel(result.lifecycle)).toBe(true);
  });

  it("never reports delayed without an approved publication deadline", () => {
    // Without the parameter there is no threshold to be past, and asserting one here would invent
    // timing policy the methodology has not decided.
    const stale = input({
      latestPublishedAt: "2020-01-01T00:00:00.000Z",
      now: "2026-09-18T20:00:00.000Z",
      freshnessApproved: false,
      freshnessSeconds: 60,
    });
    expect(evaluateLifecycle(stale).lifecycle).toBe("live");
  });

  it("reports delayed once the deadline is approved and exceeded", () => {
    const result = evaluateLifecycle(
      input({
        latestPublishedAt: "2026-09-10T20:00:00.000Z",
        now: "2026-09-18T20:00:00.000Z",
        freshnessApproved: true,
        freshnessSeconds: 86_400,
      }),
    );
    expect(result.lifecycle).toBe("delayed");
    expect(lifecycleCarriesLevel(result.lifecycle)).toBe(true);
  });

  it("has no path to live without a published observation", () => {
    // Structural: there is no combination of inputs that produces a level-bearing state from an
    // absence of published observations.
    for (const checks of [[], [PASSED], [FAILED]]) {
      const result = evaluateLifecycle(
        input({ hasPublishedObservation: false, latestPublishedAt: null, checks }),
      );
      expect(lifecycleCarriesLevel(result.lifecycle)).toBe(false);
    }
  });

  it("gives every non-live state a durable public reason", () => {
    const states: LifecycleInput[] = [
      input({ hasPublishedObservation: false, latestPublishedAt: null }),
      input({ latestUnavailableReason: "parent_weights_missing" }),
      input({ latestUnavailableReason: "coverage_below_threshold" }),
    ];
    for (const state of states) {
      const result = evaluateLifecycle(state);
      expect(result.publicReason.trim()).not.toBe("");
      // Never an internal identifier or a column name.
      expect(result.publicReason).not.toMatch(/_[a-z]+_|snapshot_id|uavi_/);
    }
  });
});
