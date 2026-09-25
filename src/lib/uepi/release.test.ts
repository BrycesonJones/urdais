import { describe, expect, it } from "vitest";

import type { SourceRightsState } from "@/lib/rights/publication";
import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { completeDay } from "@/lib/uepi/fixtures";
import { DERIVED_VALUE_PURPOSE } from "@/lib/uepi/rights";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import { evaluateRelease, type ReleaseInput } from "@/lib/uepi/release";
import type { NormalizedHourlyPrice } from "@/lib/uepi/types";

const NYISO = UEPI_BENCHMARKS["uepi-nyiso"];
const AFTER_THE_DAY = new Date("2026-09-24T10:15:00Z");

function baseInput(over: Partial<ReleaseInput> = {}): ReleaseInput {
  const window = operatingDayWindow(NYISO, "2026-09-23");
  return {
    benchmark: NYISO,
    window,
    hours: completeDay(NYISO, window, () => "29.19"),
    specificationApproved: true,
    now: AFTER_THE_DAY,
    intent: "internal_release",
    ...over,
  };
}

function permissiveRights(): SourceRightsState {
  return {
    sourceInterfaceSlug: "nyiso-mis-p-2a-dam-lbmp-zonal",
    sourceName: "NYISO",
    purpose: DERIVED_VALUE_PURPOSE,
    rightsClassification: "ambiguous_requires_legal_review",
    disposition: "not_established",
    attributionRequired: true,
    attributionText: "Source: NYISO. Urdais calculation.",
    conditions: null,
    unresolvedIssue: "The legal notice confers no licence and does not reach the numeric CSVs.",
    termsDocumentUrl: "https://www.nyiso.com/legal-notice",
    reviewedBy: "Urdais founder review",
    reviewedOn: "2026-09-24",
  };
}

describe("1. a sound day releases, and says what it checked", () => {
  it("releases a complete day and returns the calculation", () => {
    const decision = evaluateRelease(baseInput());
    expect(decision.released).toBe(true);
    if (!decision.released) return;
    expect(decision.calculation.valueUsdPerMwh).toBe("29.190000");
    expect(decision.checks.map((check) => check.check)).toContain("hour_completeness");
    expect(decision.checks.every((check) => check.passed)).toBe(true);
  });

  it("releases a 23-hour spring day for a market whose transition was measured", () => {
    const window = operatingDayWindow(NYISO, "2026-03-08");
    const decision = evaluateRelease(baseInput({
      window,
      hours: completeDay(NYISO, window, () => "40.00"),
      now: new Date("2026-03-09T10:15:00Z"),
    }));
    expect(decision.released).toBe(true);
    if (decision.released) expect(decision.calculation.observationCount).toBe(23);
  });

  it("releases a negative day, because a negative price is a price", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const decision = evaluateRelease(baseInput({
      hours: completeDay(NYISO, window, () => "-8.63"),
    }));
    expect(decision.released).toBe(true);
    if (decision.released) expect(decision.calculation.valueUsdPerMwh).toBe("-8.630000");
  });
});

describe("2. every refusal names itself", () => {
  it("refuses a day missing one hour, with no partial-day path", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "29.19").slice(0, 23);
    const decision = evaluateRelease(baseInput({ hours }));
    expect(decision.released).toBe(false);
    if (decision.released) return;
    expect(decision.reason).toBe("incomplete_intervals");
    expect(decision.detail).toMatch(/does not interpolate/);
  });

  it("refuses two hours claiming the same instant", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "29.19");
    const duplicated: NormalizedHourlyPrice[] = [...hours.slice(0, 23), { ...hours[0]! }];
    const decision = evaluateRelease(baseInput({ hours: duplicated }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("duplicate_interval");
  });

  it("refuses an hour that is not an hour of this operating day", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "29.19");
    const strayed = [...hours.slice(0, 23), {
      ...hours[23]!,
      intervalStartUtc: "2026-09-24T09:30:00.000Z",
      intervalEndUtc: "2026-09-24T10:30:00.000Z",
    }];
    const decision = evaluateRelease(baseInput({ hours: strayed }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("invalid_interval");
  });

  it("refuses an interval that is not one hour long", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "29.19");
    const stretched = [{ ...hours[0]!, intervalEndUtc: "2026-09-23T06:00:00.000Z" }, ...hours.slice(1)];
    const decision = evaluateRelease(baseInput({ hours: stretched }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("invalid_interval");
  });

  it("refuses an hour that does not carry the benchmark's construct", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "29.19");
    const mislabelled = [{ ...hours[0]!, construct: "delivered_price" as const }, ...hours.slice(1)];
    const decision = evaluateRelease(baseInput({ hours: mislabelled }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("missing_provenance");
  });

  it("refuses a suspect hour rather than averaging around it", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, () => "29.19");
    const suspect = [{ ...hours[5]!, qualityStatus: "suspect" as const, qualityNotes: ["column shifted"] },
      ...hours.filter((_, index) => index !== 5)];
    const decision = evaluateRelease(baseInput({ hours: suspect }));
    expect(decision.released).toBe(false);
    if (!decision.released) {
      expect(decision.reason).toBe("suspect_observation");
      expect(decision.detail).toMatch(/column shifted/);
    }
  });

  it("refuses a price beyond the plausibility guard, which is a parse error and not a market", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const hours = completeDay(NYISO, window, (hour) => (hour === 3 ? "3621097" : "29.19"));
    const decision = evaluateRelease(baseInput({ hours }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("suspect_observation");
  });

  it("refuses a failed cross-check and reports the margin it measured", () => {
    const decision = evaluateRelease(baseInput({
      crossChecks: [{
        check: "system_component_uniformity",
        maxAbsoluteSpread: "0.35",
        tolerance: "0.02",
        detail: "lambda at a second internal zone",
      }],
    }));
    expect(decision.released).toBe(false);
    if (!decision.released) {
      expect(decision.reason).toBe("quality_check_failed");
      expect(decision.checks.at(-1)?.measured).toBe(0.35);
    }
  });

  it("refuses a day that has not begun in the market's own timezone", () => {
    const decision = evaluateRelease(baseInput({ now: new Date("2026-09-22T12:00:00Z") }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("operating_day_not_started");
  });

  it("refuses a transition day for a market whose transition behaviour was never observed", () => {
    // PJM is the one market left in that state: no adapter, so no transition file has been parsed.
    const pjm = UEPI_BENCHMARKS["uepi-pjm"];
    const window = operatingDayWindow(pjm, "2026-03-08");
    const decision = evaluateRelease(baseInput({
      benchmark: pjm,
      window,
      hours: completeDay(pjm, window, () => "36.40"),
      now: new Date("2026-03-09T10:15:00Z"),
    }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("unverified_dst_transition");
  });

  it("releases the same transition day for a market whose file was parsed", () => {
    const ercot = UEPI_BENCHMARKS["uepi-ercot"];
    const window = operatingDayWindow(ercot, "2026-03-08");
    const decision = evaluateRelease(baseInput({
      benchmark: ercot,
      window,
      hours: completeDay(ercot, window, () => "36.40"),
      now: new Date("2026-03-09T10:15:00Z"),
    }));
    expect(decision.released).toBe(true);
    if (decision.released) expect(decision.calculation.observationCount).toBe(23);
  });

  it("refuses when the registry does not hold the specification as approved", () => {
    const decision = evaluateRelease(baseInput({ specificationApproved: false }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("specification_not_approved");
  });

  it("refuses any release at all for a series nobody may build", () => {
    // No market is in that state now that ISO-NE's payload has been observed, so the gate is
    // exercised against a benchmark constructed in that state. It is the one refusal that must
    // keep working whether or not a market currently needs it.
    const unbuilt = { ...UEPI_BENCHMARKS["uepi-iso-ne"], publicationPosture: "not_built" as const };
    const window = operatingDayWindow(unbuilt, "2026-09-23");
    const decision = evaluateRelease(baseInput({
      benchmark: unbuilt, window, hours: completeDay(unbuilt, window, () => "52.30"),
    }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("series_not_built");
  });
});

describe("3. internally valid and publicly blocked are different answers", () => {
  it("releases an internal-only market internally and refuses it publicly", () => {
    const spp = UEPI_BENCHMARKS["uepi-spp"];
    const window = operatingDayWindow(spp, "2026-04-12");
    const hours = completeDay(spp, window, () => "2.78");

    const internal = evaluateRelease({
      benchmark: spp, window, hours, specificationApproved: true,
      now: new Date("2026-04-13T10:15:00Z"), intent: "internal_release",
    });
    expect(internal.released).toBe(true);

    const published = evaluateRelease({
      benchmark: spp, window, hours, specificationApproved: true,
      now: new Date("2026-04-13T10:15:00Z"), intent: "public_release",
      publicationSubject: { rights: permissiveRights(), publicationState: "published",
        purpose: DERIVED_VALUE_PURPOSE },
    });
    expect(published.released).toBe(false);
    if (!published.released) {
      expect(published.reason).toBe("rights_blocked");
      expect(published.publication?.reasonCode).toBe("blocked_series_internal_only");
    }
  });

  it("releases a publishable market publicly, and carries the rights decision with it", () => {
    const decision = evaluateRelease(baseInput({
      intent: "public_release",
      publicationSubject: { rights: permissiveRights(), publicationState: "published",
        purpose: DERIVED_VALUE_PURPOSE },
    }));
    expect(decision.released).toBe(true);
    expect(decision.publication?.allowed).toBe(true);
    expect(decision.publication?.rightsClassification).toBe("ambiguous_requires_legal_review");
  });

  it("refuses a public release that arrives without any rights determination", () => {
    const decision = evaluateRelease(baseInput({ intent: "public_release" }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("rights_blocked");
  });

  it("checks the data before the terms, so a broken day is reported as broken", () => {
    const window = operatingDayWindow(NYISO, "2026-09-23");
    const decision = evaluateRelease(baseInput({
      hours: completeDay(NYISO, window, () => "29.19").slice(0, 20),
      intent: "public_release",
      publicationSubject: { rights: permissiveRights(), publicationState: "published",
        purpose: DERIVED_VALUE_PURPOSE },
    }));
    expect(decision.released).toBe(false);
    if (!decision.released) expect(decision.reason).toBe("incomplete_intervals");
  });
});
