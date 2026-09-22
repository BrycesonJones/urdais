/**
 * Margin derivation invariants.
 *
 * Every case here is drawn from a real observation in the TH-1/TH-1A artifacts, because the traps
 * in this source are not hypothetical: a threshold sentinel rule would have erased 4,074 real
 * limits, and an absolute value taken one step too early would measure a westbound flow against an
 * eastbound limit.
 */

import { describe, expect, it } from "vitest";

import {
  classifyLimit, deriveDirectionalMargin, deriveOrientedMargin, isEligibleLimit, parseNumeric,
  type DirectionalLimit,
} from "@/lib/transmission-headroom/derive";
import { IMPLAUSIBLE_LIMIT_MW, NYISO_SENTINEL_MW } from "@/lib/transmission-headroom/types";

const limit = (mw: number, field = "Positive Limit (MWH)", sentinel = true): DirectionalLimit => ({
  limitMw: mw, nativeField: field, state: classifyLimit(mw, { sentinel }),
});

describe("classifyLimit", () => {
  it("treats exactly +/-9999 as a sentinel and nothing else", () => {
    expect(classifyLimit(NYISO_SENTINEL_MW, { sentinel: true })).toBe("sentinel");
    expect(classifyLimit(-NYISO_SENTINEL_MW, { sentinel: true })).toBe("sentinel");
  });

  it("keeps -9899, the largest genuine limit in the NYISO archive", () => {
    // 4,074 observations on SCH - HQ_IMPORT_EXPORT sit 100 MW below the sentinel. A rule of
    // abs(limit) >= 9000 would have discarded every one of them.
    expect(classifyLimit(-9899, { sentinel: true })).toBe("real");
    expect(classifyLimit(9899, { sentinel: true })).toBe("real");
    expect(classifyLimit(-9998.9, { sentinel: true })).toBe("real");
  });

  it("treats a real zero limit as real, not as absent", () => {
    // SCH - HQ_CEDARS publishes a negative limit of 0: no reverse flow permitted.
    expect(classifyLimit(0, { sentinel: true })).toBe("zero");
    expect(isEligibleLimit("zero")).toBe(true);
  });

  it("classifies ERCOT's disabled limits as implausible", () => {
    expect(classifyLimit(85_999.1)).toBe("implausible");
    expect(classifyLimit(84_999.1)).toBe("implausible");
    // The largest genuine ERCOT limit observed was far below the bound.
    expect(classifyLimit(3_263.4)).toBe("real");
    expect(IMPLAUSIBLE_LIMIT_MW).toBeGreaterThan(3_263.4);
  });

  it("does not apply the NYISO sentinel to a market that does not use it", () => {
    // 9999 MW would be an absurd ERCOT limit, but it is not ERCOT's sentinel and must not be
    // silently reclassified as one.
    expect(classifyLimit(9999, { sentinel: false })).toBe("real");
  });

  it("only real and zero limits are eligible to produce a margin", () => {
    expect(isEligibleLimit("real")).toBe(true);
    expect(isEligibleLimit("sentinel")).toBe(false);
    expect(isEligibleLimit("implausible")).toBe(false);
  });
});

describe("deriveDirectionalMargin", () => {
  it("measures a positive flow against the positive limit", () => {
    // CENTRAL EAST - VC, an ordinary eastbound interval.
    const outcome = deriveDirectionalMargin(1273.04, limit(2690), limit(-9999, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("ok");
    expect(outcome.selectedDirection).toBe("positive");
    expect(outcome.headroomMw).toBeCloseTo(1416.96, 4);
    expect(outcome.selectedLimit?.nativeField).toBe("Positive Limit (MWH)");
  });

  it("measures a negative flow against the negative limit", () => {
    // SCH - HQ - NY runs entirely negative; its positive limit of 1500 is never the applicable one.
    const outcome = deriveDirectionalMargin(
      -985, limit(1500), limit(-985, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("ok");
    expect(outcome.selectedDirection).toBe("negative");
    expect(outcome.headroomMw).toBe(0);
    expect(outcome.selectedLimit?.nativeField).toBe("Negative Limit (MWH)");
  });

  it("never measures a negative flow against the positive limit", () => {
    // The trap: abs(flow) first, compared to the positive limit, reports 1367 MW of comfortable
    // margin on an interface that is actually hard against its reverse limit.
    const outcome = deriveDirectionalMargin(
      -133, limit(1500), limit(-140, "Negative Limit (MWH)"));
    expect(outcome.headroomMw).toBeCloseTo(7, 4);
    expect(outcome.headroomMw).not.toBeCloseTo(1367, 4);
  });

  it("reports an unmonitored direction rather than a number when the limit is a sentinel", () => {
    // flow - (-9999) would fabricate 11,272 MW of reverse capability on CENTRAL EAST.
    const outcome = deriveDirectionalMargin(
      -1273.04, limit(2690), limit(-9999, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("unmonitored_direction");
    expect(outcome.headroomMw).toBeNull();
    expect(outcome.utilizationPct).toBeNull();
  });

  it("reports an unmonitored direction for the positive sentinel too", () => {
    // WEST CENTRAL carries 9999 as its positive limit.
    const outcome = deriveDirectionalMargin(
      802.8, limit(9999), limit(-9999, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("unmonitored_direction");
    expect(outcome.headroomMw).toBeNull();
  });

  it("determines no direction at all when flow is exactly zero", () => {
    // SCH - HQ_CEDARS: limits 49 / 0 and flow 0.0 for every interval of the day. Choosing the
    // positive limit because it is listed first would invent a direction.
    const outcome = deriveDirectionalMargin(
      0, limit(49), limit(0, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("zero_flow_direction_undetermined");
    expect(outcome.selectedDirection).toBe("undetermined");
    expect(outcome.selectedLimit).toBeNull();
    expect(outcome.headroomMw).toBeNull();
  });

  it("keeps an exact zero margin as a measurement, not as an absence", () => {
    // SCH - PJM_NEPTUNE sat at exactly 660.0 against a 660 limit for all 289 observations.
    const outcome = deriveDirectionalMargin(
      660, limit(660), limit(-660, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("ok");
    expect(outcome.headroomMw).toBe(0);
    expect(outcome.utilizationPct).toBe(1);
  });

  it("preserves a negative margin rather than clamping it", () => {
    const outcome = deriveDirectionalMargin(
      2750, limit(2690), limit(-9999, "Negative Limit (MWH)"));
    expect(outcome.headroomMw).toBeCloseTo(-60, 4);
    expect(outcome.headroomMw).toBeLessThan(0);
  });

  it("reports no utilization against a zero limit rather than dividing by it", () => {
    const outcome = deriveDirectionalMargin(
      -5, limit(49), limit(0, "Negative Limit (MWH)"));
    expect(outcome.state).toBe("ok");
    expect(outcome.headroomMw).toBeCloseTo(-5, 4);
    expect(outcome.utilizationPct).toBeNull();
  });
});

describe("deriveOrientedMargin", () => {
  const ercotLimit = (mw: number): DirectionalLimit => ({
    limitMw: mw, nativeField: "Limit", state: classifyLimit(mw),
  });

  it("computes Limit - Value with no direction selection", () => {
    // CONCHO_HARI1_A under XBAL89: Limit 29.4, Value 29.3.
    const outcome = deriveOrientedMargin(29.3, ercotLimit(29.4));
    expect(outcome.state).toBe("ok");
    expect(outcome.selectedDirection).toBe("undirected");
    expect(outcome.headroomMw).toBeCloseTo(0.1, 4);
  });

  it("keeps a zero margin on a binding constraint", () => {
    // NELRIO on BASE CASE: Limit 867, Value 867, shadow price 49.92.
    expect(deriveOrientedMargin(867, ercotLimit(867)).headroomMw).toBe(0);
  });

  it("preserves a negative margin when the flow exceeds the limit", () => {
    const outcome = deriveOrientedMargin(35.0, ercotLimit(33.3));
    expect(outcome.headroomMw).toBeCloseTo(-1.7, 4);
  });

  it("refuses to derive a margin from a disabled limit", () => {
    // EASTEX at 85,999.1 against a flow of 2,553.1 would otherwise report 83,446 MW of headroom.
    const outcome = deriveOrientedMargin(2553.1, ercotLimit(85_999.1));
    expect(outcome.state).toBe("implausible_limit");
    expect(outcome.headroomMw).toBeNull();
  });
});

describe("parseNumeric", () => {
  it("distinguishes a blank from an unparseable value", () => {
    expect(parseNumeric("")).toEqual({ ok: false, reason: "missing_required_field", raw: "" });
    expect(parseNumeric("   ")).toEqual({ ok: false, reason: "missing_required_field", raw: "" });
    expect(parseNumeric("n/a")).toEqual({ ok: false, reason: "malformed_numeric", raw: "n/a" });
    expect(parseNumeric(null)).toEqual({ ok: false, reason: "missing_required_field", raw: "" });
  });

  it("never turns an unreadable value into zero", () => {
    const parsed = parseNumeric("--");
    expect(parsed.ok).toBe(false);
    expect(parsed).not.toHaveProperty("value");
  });

  it("parses a signed decimal", () => {
    expect(parseNumeric("-1397.3")).toEqual({ ok: true, value: -1397.3 });
    expect(parseNumeric("0")).toEqual({ ok: true, value: 0 });
  });
});
