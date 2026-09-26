/**
 * The public read model, against specification 1.0.0 §D and the payload contract.
 *
 * The truth table is exercised in full in `market-change.test.ts` against the shared rule. What
 * this file asserts is that the *published* change object obeys the same rule and, crucially,
 * that the dollar amount is exact -- because the read model is the one place where a UEPI value
 * stops being a decimal string and becomes a number a reader sees.
 */

import { describe, expect, it } from "vitest";

import { SPECIFICATION_DIGEST, SPECIFICATION_VERSION } from "@/lib/uepi/methodology";
import {
  buildUepiReadModel,
  changeBetweenDays,
  changeReasons,
  displaySymbolFor,
  unavailableChange,
  unconfiguredUepiReadModel,
  validatePublicUepi,
  type UepiSeriesView,
} from "@/lib/uepi/read/read-model";
import { limitationsFor } from "@/lib/uepi/read/limitations";

function day(operatingDate: string, valueUsdPerMwh: string) {
  return { operatingDate, valueUsdPerMwh };
}

describe("the §D change between two released days", () => {
  /*
   * §D.4, row by row. `pct` is what the API returns for the percentage field; the dollar amount
   * is defined in every row that has two endpoints, and direction always follows its sign.
   */
  const TRUTH_TABLE = [
    { row: 1, base: "30", latest: "33", basis: "percent", pct: 10, amount: 3, direction: "up", reason: null },
    { row: 2, base: "30", latest: "27", basis: "percent", pct: -10, amount: -3, direction: "down", reason: null },
    { row: 3, base: "30", latest: "0", basis: "absolute", pct: null, amount: -30, direction: "down", reason: "new_not_positive" },
    { row: 4, base: "30", latest: "-5", basis: "absolute", pct: null, amount: -35, direction: "down", reason: "new_not_positive" },
    { row: 5, base: "0", latest: "12", basis: "absolute", pct: null, amount: 12, direction: "up", reason: "base_zero" },
    { row: 6, base: "0", latest: "0", basis: "absolute", pct: null, amount: 0, direction: "flat", reason: "base_zero" },
    { row: 7, base: "0", latest: "-4", basis: "absolute", pct: null, amount: -4, direction: "down", reason: "base_zero" },
    { row: 8, base: "-10", latest: "-5", basis: "absolute", pct: null, amount: 5, direction: "up", reason: "base_negative" },
    { row: 9, base: "-5", latest: "-10", basis: "absolute", pct: null, amount: -5, direction: "down", reason: "base_negative" },
    { row: 10, base: "-8", latest: "0", basis: "absolute", pct: null, amount: 8, direction: "up", reason: "base_negative" },
    { row: 11, base: "-8", latest: "4", basis: "absolute", pct: null, amount: 12, direction: "up", reason: "base_negative" },
    { row: 12, base: "30", latest: "30", basis: "percent", pct: 0, amount: 0, direction: "flat", reason: null },
  ] as const;

  it.each(TRUTH_TABLE)("row $row: $base -> $latest", ({ base, latest, basis, pct, amount, direction, reason }) => {
    const change = changeBetweenDays(day("2026-09-22", base), day("2026-09-23", latest));
    expect(change.basis).toBe(basis);
    expect(change.percentChange === null ? null : Number(change.percentChange.toFixed(6))).toBe(pct);
    expect(change.absoluteChangeUsdPerMwh).toBe(amount);
    expect(change.direction).toBe(direction);
    expect(change.reason).toBe(reason);
    expect(changeReasons("test", change)).toEqual([]);
  });

  it("keeps direction on rows 8 and 9, where the percentage is the only thing suppressed", () => {
    // The whole reason direction is taken from the sign of the dollar amount: an ordinary
    // percentage on a negative base reports these two backwards.
    expect(changeBetweenDays(day("2026-04-11", "-10"), day("2026-04-12", "-5")).direction).toBe("up");
    expect(changeBetweenDays(day("2026-04-11", "-5"), day("2026-04-12", "-10")).direction).toBe("down");
  });

  it("computes the dollar amount exactly, not in floating point", () => {
    // The production defect, on the display path. 35.67 - 35.65 is 0.020000000000003126 in
    // `number`, which is what withheld valid NYISO days before PR #202.
    expect(35.67 - 35.65).not.toBe(0.02);
    expect(changeBetweenDays(day("2026-09-22", "35.65"), day("2026-09-23", "35.67")).absoluteChangeUsdPerMwh).toBe(0.02);
    // Six decimal places, which is what a released value carries.
    expect(
      changeBetweenDays(day("2026-11-30", "69.505833"), day("2026-12-01", "69.605833")).absoluteChangeUsdPerMwh,
    ).toBe(0.1);
  });

  it("states the two dates it measured between, so a range label cannot outrun the data (§E.3)", () => {
    const change = changeBetweenDays(day("2026-08-24", "30"), day("2026-09-23", "33"));
    expect(change.baseOperatingDate).toBe("2026-08-24");
    expect(change.latestOperatingDate).toBe("2026-09-23");
  });

  it("carries neither an amount nor a direction when there is no comparison at all", () => {
    const change = unavailableChange("no_base_observation");
    expect(change).toMatchObject({ basis: "unavailable", absoluteChangeUsdPerMwh: null, direction: null });
    expect(changeReasons("test", change)).toEqual([]);
  });
});

function seriesView(overrides: Partial<UepiSeriesView> = {}): UepiSeriesView {
  return {
    seriesId: "uepi-ercot",
    market: "ERCOT",
    displaySymbol: "UEPI-ERCOT",
    name: "Urdais Energy & Power Index · ERCOT wholesale power benchmark",
    unit: "$/MWh",
    priceConstruct: "delivered_price",
    benchmarkDefinition: "Day-ahead settlement point price for the ERCOT Hub Average 345 kV Hub.",
    excludes: [],
    geographicScope: "Four-hub 345 kV average.",
    sourceName: "ERCOT EMIL NP4-190-CD",
    sourceUrl: "https://www.ercot.com/mp/data-products",
    sourceGranularity: "hourly",
    operatingTimezone: "America/Chicago",
    hourConvention: "hour_ending",
    dailyAggregation: "arithmetic_mean_of_valid_hours",
    updateFrequency: "daily_one_value_per_operating_day",
    methodologyVersion: SPECIFICATION_VERSION,
    methodologyDigest: SPECIFICATION_DIGEST,
    methodologyHref: "/docs/methodology/uepi",
    notice: { attribution: "Source: ERCOT.", conditions: null, unresolvedIssue: null, rightsClassification: "reusable_with_attribution_or_conditions" },
    knownLimitations: limitationsFor("uepi-ercot"),
    provenance: "production",
    latest: { operatingDate: "2026-09-23", valueUsdPerMwh: 36.4, observationCount: 24, expectedObservationCount: 24 },
    latestReleasedAt: "2026-09-24T05:00:00.000Z",
    change1d: changeBetweenDays(day("2026-09-22", "38.00"), day("2026-09-23", "36.40")),
    points: [],
    unavailableReason: null,
    ...overrides,
  };
}

describe("the public payload contract", () => {
  it("passes for a well-formed model", () => {
    expect(validatePublicUepi(buildUepiReadModel([seriesView()]))).toEqual([]);
  });

  it("declares no composite, because §C.14 forbids one", () => {
    expect(buildUepiReadModel([seriesView()]).family.hasCompositeLevel).toBe(false);
    expect(validatePublicUepi({ ...buildUepiReadModel([seriesView()]), family: { code: "UEPI", hasCompositeLevel: true } }))
      .toContain("the family claims a composite level");
  });

  it("refuses a payload naming a series Urdais does not publish", () => {
    // Not a hypothetical: MISO and SPP hold 793 released daily values between them in
    // production, and the gate that keeps them off this surface is the only thing between
    // those values and a reader.
    for (const blocked of ["uepi-miso", "uepi-spp", "uepi-iso-ne", "uepi-pjm"] as const) {
      const model = buildUepiReadModel([seriesView({ seriesId: blocked })]);
      expect(validatePublicUepi(model)).toContain(`response exposes non-public series ${blocked}`);
    }
  });

  it("refuses a retired demo instrument id", () => {
    const model = buildUepiReadModel([seriesView({ name: "the power-ercot walk" })]);
    expect(validatePublicUepi(model)).toContain("response carries a demo instrument id");
  });

  it("refuses a database identifier anywhere in the payload", () => {
    const model = buildUepiReadModel([seriesView({ name: "a1b2c3d4-1111-2222-3333-444455556666" })]);
    expect(validatePublicUepi(model)).toContain("response contains a database identifier");
  });

  it("refuses a specification version or digest that is not the frozen one", () => {
    expect(validatePublicUepi(buildUepiReadModel([seriesView({ methodologyVersion: "1.1.0" })])))
      .toContain("uepi-ercot carries methodology version 1.1.0");
    expect(validatePublicUepi(buildUepiReadModel([seriesView({ methodologyDigest: "0".repeat(64) })])))
      .toContain("uepi-ercot carries a specification digest that is not the frozen one");
  });

  it("refuses a partial day, because §G.2 says there is no such thing", () => {
    const model = buildUepiReadModel([
      seriesView({ latest: { operatingDate: "2026-09-23", valueUsdPerMwh: 36.4, observationCount: 23, expectedObservationCount: 24 } }),
    ]);
    expect(validatePublicUepi(model)).toContain("uepi-ercot 2026-09-23 is a partial day");
  });

  it("accepts a 23-hour and a 25-hour day, which are complete days and not holes", () => {
    for (const hours of [23, 25]) {
      const model = buildUepiReadModel([
        seriesView({
          latest: { operatingDate: "2026-03-08", valueUsdPerMwh: 31.1, observationCount: hours, expectedObservationCount: hours },
        }),
      ]);
      expect(validatePublicUepi(model), `${hours} hours`).toEqual([]);
    }
  });

  it("refuses an energy-component series that does not say what it excludes", () => {
    const model = buildUepiReadModel([seriesView({ priceConstruct: "system_energy_component", excludes: [] })]);
    expect(validatePublicUepi(model)).toContain("uepi-ercot is an energy component and states no exclusions");
  });

  it("refuses a percentage beside an endpoint that may not carry one", () => {
    const smuggled = { ...changeBetweenDays(day("2026-09-22", "-10"), day("2026-09-23", "-5")), percentChange: -50 };
    expect(validatePublicUepi(buildUepiReadModel([seriesView({ change1d: smuggled })])))
      .toContain("uepi-ercot change1d carries a percentage it may not publish");
  });

  it("names the reason when it has no series at all, rather than looking healthy and empty", () => {
    expect(unconfiguredUepiReadModel().unavailableReason).toMatch(/no database/);
    expect(buildUepiReadModel([]).unavailableReason).toBe("no UEPI series has a released value");
  });
});

describe("identifiers", () => {
  it("derives the display symbol from the series id, so the two cannot drift (§I.1)", () => {
    expect(displaySymbolFor("uepi-ercot")).toBe("UEPI-ERCOT");
    expect(displaySymbolFor("uepi-iso-ne")).toBe("UEPI-ISO-NE");
  });
});
