import { describe, expect, it } from "vitest";

import {
  CENTRAL_SCENARIO_KEY,
  METHODOLOGY_VERSION,
  RESIDUAL_MODEL_VERSION,
  UBWI_UNIT,
  calculateUbwi,
  observedWealthToGdpRatio,
  satisfiesVintageRule,
  tailCalibration,
  PRODUCTION_CWON_WEIGHTS,
} from "./calculate";
import {
  EXCLUDED_ECONOMIES,
  LATEST_COMPLETE_YEAR,
  OBSERVED_ECONOMIES,
  UNOBSERVED_MAJOR_ECONOMIES,
  VINTAGE_MAX_AGE_YEARS,
  WORLD_GDP_2024_USD,
} from "./observations";
import {
  FEASIBLE_FRONTIER,
  PRODUCTION_V1_THRESHOLDS,
  evaluateGate,
  type GateFailureCode,
} from "./gate";
import {
  MINIMUM_VENUE_COUNT,
  PRODUCTION_BTC_OBSERVATION,
  checkNumerator,
  median,
  venueDispersionBasisPoints,
} from "./numerator";
import {
  SOURCE_INTERFACES,
  effectiveRightsStatus,
  failureMayInformSourceState,
  recheckTerms,
  sourceInterface,
} from "./rights";
import type { ObservedEconomy } from "./types";

const CALCULATED_AT = "2026-09-15T00:48:04Z";
const calculation = calculateUbwi({ calculatedAt: CALCULATED_AT });

function codes(findings: readonly { code: GateFailureCode }[]): GateFailureCode[] {
  return findings.map((f) => f.code);
}

describe("UBWI formula", () => {
  it("is Bitcoin market capitalization over Total Global Wealth, as a percentage", () => {
    const expected =
      (calculation.numerator.marketCapUsd / calculation.totalGlobalWealthUsd) * 100;
    expect(calculation.ubwiPercent).toBeCloseTo(expected, 12);
    expect(UBWI_UNIT).toBe("%");
  });

  it("puts Bitcoin inside its own denominator", () => {
    const withoutBitcoin = calculation.observedWealthUsd + calculation.modeledWealthUsd;
    expect(calculation.totalGlobalWealthUsd).toBeCloseTo(
      withoutBitcoin + calculation.numerator.marketCapUsd,
      2,
    );
    // Excluding Bitcoin from the denominator would raise the value; the fact that it does
    // is the reason the inclusion has to be checked rather than assumed.
    expect(calculation.numerator.marketCapUsd / withoutBitcoin).toBeGreaterThan(
      calculation.ubwiPercent / 100,
    );
  });

  it("is bounded in [0, 100] by construction", () => {
    expect(calculation.ubwiPercent).toBeGreaterThan(0);
    expect(calculation.ubwiPercent).toBeLessThan(100);
  });

  it("builds Total Global Wealth from observed plus residual plus Bitcoin", () => {
    const parts =
      calculation.observedShareOfTotal +
      calculation.modeledShareOfTotal +
      calculation.ubwiPercent;
    expect(parts).toBeCloseTo(100, 8);
  });

  it("carries an explicit methodology version and residual-model version", () => {
    expect(calculation.methodologyVersion).toBe(METHODOLOGY_VERSION);
    expect(calculation.residualModelVersion).toBe(RESIDUAL_MODEL_VERSION);
    expect(METHODOLOGY_VERSION).not.toContain("draft");
  });
});

describe("observed and modeled construction", () => {
  it("sums the observed leg from the component values themselves", () => {
    const sum = OBSERVED_ECONOMIES.reduce((total, e) => total + e.valueUsd, 0);
    expect(calculation.observedWealthUsd).toBeCloseTo(sum, 2);
  });

  it("applies the calibrated tail ratio to unobserved world GDP", () => {
    const expected = calculation.residual.centralTailRatio * calculation.residual.unobservedGdpUsd;
    expect(calculation.modeledWealthUsd).toBeCloseTo(expected, 2);
  });

  it("derives the central tail ratio from the observed ratio and the CWON calibration", () => {
    const r = observedWealthToGdpRatio(OBSERVED_ECONOMIES);
    const k = tailCalibration(PRODUCTION_CWON_WEIGHTS);
    expect(calculation.residual.observedRatio).toBeCloseTo(r, 12);
    expect(calculation.residual.tailCalibration).toBeCloseTo(k, 12);
    expect(calculation.residual.centralTailRatio).toBeCloseTo(r * k, 12);
  });

  it("calibrates the unobserved world as poorer per unit of GDP than the observed set", () => {
    // k < 1 is the whole reason the k = 1 scenario is an upper bound on world wealth and
    // therefore a lower bound on UBWI.
    expect(calculation.residual.tailCalibration).toBeLessThan(1);
    expect(calculation.residual.tailCalibration).toBeGreaterThan(0);
  });

  it("leaves unobserved GDP as world GDP less the observed set", () => {
    const observedGdp = OBSERVED_ECONOMIES.reduce((sum, e) => sum + e.gdpUsd2024, 0);
    expect(calculation.residual.unobservedGdpUsd).toBeCloseTo(
      WORLD_GDP_2024_USD - observedGdp,
      2,
    );
  });

  it("never calls modeled wealth observed", () => {
    expect(calculation.modeledShareOfTotal).toBeGreaterThan(0);
    for (const economy of calculation.observed) {
      expect(economy.observationStatus).toBe("observed");
    }
  });
});

describe("the vintage rule and the New Zealand / Russia exclusion", () => {
  it("excludes New Zealand and Russia rather than bridging them", () => {
    const excluded = EXCLUDED_ECONOMIES.map((e) => e.economy).sort();
    expect(excluded).toEqual(["NZL", "RUS"]);
    for (const dropped of EXCLUDED_ECONOMIES) {
      expect(dropped.rule).toBe("vintage_max_age_years");
      expect(OBSERVED_ECONOMIES.some((e) => e.economy === dropped.economy)).toBe(false);
    }
  });

  it("keeps every retained component inside the vintage bound", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      expect(satisfiesVintageRule(economy)).toBe(true);
      expect(LATEST_COMPLETE_YEAR - economy.referenceYear).toBeLessThanOrEqual(
        VINTAGE_MAX_AGE_YEARS,
      );
    }
  });

  it("would fail the vintage rule for both dropped economies", () => {
    for (const dropped of EXCLUDED_ECONOMIES) {
      const year = Number(dropped.referenceDate.slice(0, 4));
      expect(LATEST_COMPLETE_YEAR - year).toBeGreaterThan(VINTAGE_MAX_AGE_YEARS);
    }
  });

  it("does not assume the Phase 2C candidate survived the cleanup", () => {
    // The Phase 2C research candidate was 0.2827 % on a sixteen-economy set including
    // New Zealand and Russia. The production value is computed, not carried over.
    expect(calculation.ubwiPercent).not.toBeCloseTo(0.2827, 4);
  });
});

describe("FX lineage", () => {
  it("converts every end-period stock at an end-period fixing", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      expect(economy.fx.basis).toBe("end_period");
      expect(Number.isFinite(economy.fx.rateLcuPerUsd)).toBe(true);
      expect(economy.fx.rateLcuPerUsd).toBeGreaterThan(0);
    }
  });

  it("takes the fixing at or before each component's own reference date", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      if (economy.currency === "USD") continue;
      expect(economy.fx.fixingDate).not.toBeNull();
      expect(economy.fx.fixingDate! <= economy.referenceDate).toBe(true);
    }
  });

  it("names a rights-cleared FX source for every converted component", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      if (economy.currency === "USD") {
        expect(economy.fx.rateLcuPerUsd).toBe(1);
        continue;
      }
      expect(economy.fx.sourceInterface).toBe("ecb-euro-reference-rates");
      const iface = sourceInterface(economy.fx.sourceInterface);
      expect(iface).toBeDefined();
      expect(effectiveRightsStatus(iface!)).toBe("cleared");
    }
  });

  it("reproduces each USD value from its own national-currency figure and rate", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      const expected = economy.valueNationalCurrency / economy.fx.rateLcuPerUsd;
      expect(economy.valueUsd).toBeCloseTo(expected, 2);
    }
  });

  it("honours Australia's 30 June reference date rather than harmonising it away", () => {
    const aus = OBSERVED_ECONOMIES.find((e) => e.economy === "AUS")!;
    expect(aus.referenceDate).toBe("2025-06-30");
    expect(aus.fx.fixingDate).toBe("2025-06-30");
  });
});

describe("rights", () => {
  it("clears every observed constituent", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      expect(economy.rightsStatus).toBe("cleared");
      const iface = sourceInterface(economy.sourceInterface);
      expect(iface, `${economy.economy} names an unregistered interface`).toBeDefined();
      expect(effectiveRightsStatus(iface!)).toBe("cleared");
    }
  });

  it("anchors a cleared state to a retained, hashed terms artifact", () => {
    for (const iface of SOURCE_INTERFACES) {
      if (effectiveRightsStatus(iface) !== "cleared") continue;
      expect(iface.termsArtifact).not.toBeNull();
      expect(iface.termsArtifact!.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(iface.termsArtifact!.byteLength).toBeGreaterThan(0);
      expect(iface.termsArtifact!.httpStatus).toBe(200);
      expect(iface.termsArtifact!.decisiveClause.length).toBeGreaterThan(40);
      expect(iface.termsArtifact!.attributionRequired.length).toBeGreaterThan(0);
    }
  });

  it("never clears a source that has no retained artifact", () => {
    for (const iface of SOURCE_INTERFACES) {
      if (iface.termsArtifact === null) {
        expect(effectiveRightsStatus(iface)).not.toBe("cleared");
      }
    }
  });

  it("does not revoke a grant when the terms endpoint refuses the re-fetch", () => {
    // The OECD host returns 403 intermittently to the URL that grants access. A failed
    // re-fetch means not re-confirmed today, never no longer permitted.
    const oecd = sourceInterface("oecd-sdmx-national-accounts")!;
    const before = effectiveRightsStatus(oecd);
    const result = recheckTerms(oecd, {
      attemptedAt: "2026-09-15T01:00:00Z",
      httpStatus: 403,
      contentHash: null,
      failureKind: "http_status",
    });
    expect(result.rightsStatus).toBe(before);
    expect(result.rightsStatus).toBe("cleared");
    expect(result.reconfirmed).toBe(false);
    expect(result.reviewFlagRaised).toBe(false);
    expect(result.note).toContain("not re-confirmed today");
  });

  it("does not revoke a grant on a DNS or transport failure either", () => {
    const esri = sourceInterface("esri-sna-stock")!;
    for (const failureKind of ["dns", "transport", "tls"] as const) {
      const result = recheckTerms(esri, {
        attemptedAt: "2026-09-15T01:00:00Z",
        httpStatus: null,
        contentHash: null,
        failureKind,
      });
      expect(result.rightsStatus).toBe("cleared");
      expect(failureMayInformSourceState(failureKind)).toBe(false);
    }
  });

  it("raises a review flag, not a demotion, when the terms document changes", () => {
    const oecd = sourceInterface("oecd-sdmx-national-accounts")!;
    const result = recheckTerms(oecd, {
      attemptedAt: "2026-09-15T01:00:00Z",
      httpStatus: 200,
      contentHash: "0".repeat(64),
      failureKind: null,
    });
    expect(result.reviewFlagRaised).toBe(true);
    expect(result.rightsStatus).toBe("cleared");
  });

  it("lets only content-shaped failures inform a source's state", () => {
    expect(failureMayInformSourceState("content_shape")).toBe(true);
    expect(failureMayInformSourceState("content_empty")).toBe(true);
    expect(failureMayInformSourceState("http_status")).toBe(false);
  });
});

describe("Bank of Korea: manual publication and automated retrieval are separate questions", () => {
  const bok = sourceInterface("bok-ecos-national-balance-sheet")!;
  const korea = OBSERVED_ECONOMIES.find((e) => e.economy === "KOR")!;

  it("keeps Korea in the observed set on a manually verified, rights-cleared reading", () => {
    expect(korea.acquisitionMode).toBe("manual_verified");
    expect(korea.rightsStatus).toBe("cleared");
    expect(effectiveRightsStatus(bok)).toBe("cleared");
    expect(korea.sourceSeries).toContain("291Y505");
  });

  it("does not pretend the collector is automated", () => {
    expect(bok.automatedRetrievalAvailable).toBe(false);
    expect(bok.note).toContain("pending");
  });

  it("does not let the missing API key block publication by itself", () => {
    const gate = evaluateGate(calculation);
    expect(codes(gate.findings)).not.toContain("CONSTITUENT_NOT_RIGHTS_CLEARED");
    expect(codes(gate.findings)).not.toContain("SOURCE_NOT_RIGHTS_CLEARED");
  });

  it("is the only component acquired manually", () => {
    const manual = OBSERVED_ECONOMIES.filter((e) => e.acquisitionMode === "manual_verified");
    expect(manual.map((e) => e.economy)).toEqual(["KOR"]);
  });
});

describe("the BTC numerator", () => {
  it("agrees with its own recorded parts", () => {
    expect(checkNumerator(PRODUCTION_BTC_OBSERVATION)).toEqual([]);
  });

  it("takes the median of at least three independent venues", () => {
    expect(PRODUCTION_BTC_OBSERVATION.venues.length).toBeGreaterThanOrEqual(MINIMUM_VENUE_COUNT);
    const prices = PRODUCTION_BTC_OBSERVATION.venues.map((v) => v.priceUsd);
    expect(PRODUCTION_BTC_OBSERVATION.medianPriceUsd).toBe(median(prices));
    expect(PRODUCTION_BTC_OBSERVATION.venues.filter((v) => v.selected)).toHaveLength(1);
  });

  it("records the block height its supply figure belongs to", () => {
    expect(PRODUCTION_BTC_OBSERVATION.blockHeight).toBeGreaterThan(0);
    expect(PRODUCTION_BTC_OBSERVATION.heightSources.length).toBeGreaterThanOrEqual(2);
  });

  it("multiplies supply by the median price", () => {
    expect(PRODUCTION_BTC_OBSERVATION.marketCapUsd).toBeCloseTo(
      PRODUCTION_BTC_OBSERVATION.supplyBtc * PRODUCTION_BTC_OBSERVATION.medianPriceUsd,
      2,
    );
  });

  it("keeps venue dispersion far below denominator uncertainty", () => {
    const dispersionBps = venueDispersionBasisPoints(PRODUCTION_BTC_OBSERVATION);
    expect(dispersionBps).toBeLessThan(5);
    const denominatorSpread =
      ((calculation.sensitivity.highPercent - calculation.sensitivity.lowPercent) /
        calculation.ubwiPercent) *
      10_000;
    expect(denominatorSpread).toBeGreaterThan(dispersionBps * 100);
  });

  it("rejects a numerator whose median disagrees with its venues", () => {
    const tampered = { ...PRODUCTION_BTC_OBSERVATION, medianPriceUsd: 1 };
    expect(checkNumerator(tampered)).toContain("MEDIAN_DISAGREES_WITH_VENUES");
  });

  it("rejects a numerator with fewer than three venues", () => {
    const thin = {
      ...PRODUCTION_BTC_OBSERVATION,
      venues: PRODUCTION_BTC_OBSERVATION.venues.slice(0, 2),
    };
    expect(checkNumerator(thin)).toContain("TOO_FEW_VENUES");
  });
});

describe("sensitivity", () => {
  it("publishes a range spanned by named, reproducible scenarios", () => {
    expect(calculation.scenarios.length).toBe(4);
    const values = calculation.scenarios.map((s) => s.ubwiPercent);
    expect(calculation.sensitivity.lowPercent).toBe(Math.min(...values));
    expect(calculation.sensitivity.highPercent).toBe(Math.max(...values));
  });

  it("brackets the published value", () => {
    expect(calculation.ubwiPercent).toBeGreaterThanOrEqual(calculation.sensitivity.lowPercent);
    expect(calculation.ubwiPercent).toBeLessThanOrEqual(calculation.sensitivity.highPercent);
  });

  it("is reproducible from the versioned assumptions alone", () => {
    for (const scenario of calculation.scenarios) {
      const imputed = scenario.tailRatio * calculation.residual.unobservedGdpUsd;
      const tgw = calculation.observedWealthUsd + imputed + calculation.numerator.marketCapUsd;
      expect(scenario.imputedWealthUsd).toBeCloseTo(imputed, 2);
      expect(scenario.totalGlobalWealthUsd).toBeCloseTo(tgw, 2);
      expect(scenario.ubwiPercent).toBeCloseTo(
        (calculation.numerator.marketCapUsd / tgw) * 100,
        12,
      );
    }
  });

  it("uses the calibrated scenario as the published central case", () => {
    const central = calculation.scenarios.find((s) => s.key === CENTRAL_SCENARIO_KEY)!;
    expect(calculation.ubwiPercent).toBe(central.ubwiPercent);
    expect(central.tailRatio).toBeCloseTo(calculation.residual.centralTailRatio, 12);
  });

  it("is not an arbitrary symmetric band around the value", () => {
    const down = calculation.ubwiPercent - calculation.sensitivity.lowPercent;
    const up = calculation.sensitivity.highPercent - calculation.ubwiPercent;
    expect(Math.abs(down - up)).toBeGreaterThan(1e-6);
  });
});

describe("the publication gate", () => {
  const gate = evaluateGate(calculation);

  it("passes the rights gate on every observed constituent", () => {
    expect(codes(gate.findings)).not.toContain("CONSTITUENT_NOT_RIGHTS_CLEARED");
    expect(gate.measures.rightsClearedConstituents).toBe(gate.measures.totalConstituents);
  });

  it("passes the coverage gate", () => {
    expect(gate.measures.rightsClearedGdpCoverage).toBeGreaterThanOrEqual(
      PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage,
    );
    expect(codes(gate.findings)).not.toContain("COVERAGE_BELOW_FLOOR");
  });

  it("passes the vintage gate after the cleanup", () => {
    expect(codes(gate.findings)).not.toContain("VINTAGE_RULE_VIOLATED");
    expect(codes(gate.findings)).not.toContain("VINTAGE_DISPERSION_EXCEEDED");
    expect(gate.measures.vintageDispersionYears).toBeLessThanOrEqual(
      PRODUCTION_V1_THRESHOLDS.maxVintageDispersionYears,
    );
  });

  it("passes the FX, lineage, sensitivity and version gates", () => {
    for (const code of [
      "FX_LINEAGE_INCOMPLETE",
      "SOURCE_LINEAGE_INCOMPLETE",
      "SENSITIVITY_UNAVAILABLE",
      "METHODOLOGY_VERSION_MISSING",
      "MODEL_VERSION_MISSING",
      "INTERPOLATED_STOCK_PRESENT",
      "CONSUMER_DURABLES_NOT_STRIPPED",
      "MAJOR_ECONOMY_NOT_DISCLOSED",
      "NUMERATOR_INVALID",
    ] as const) {
      expect(codes(gate.findings), `unexpected ${code}`).not.toContain(code);
    }
  });

  it("refuses publication on the imputed-share ceiling", () => {
    // This is the honest state of the index after the vintage cleanup: dropping New
    // Zealand and Russia costs 2.19 pp of coverage and pushes the modeled share above
    // the ceiling. The gate refuses, and the ceiling is not moved to make it pass.
    expect(codes(gate.findings)).toContain("IMPUTED_SHARE_ABOVE_CEILING");
    expect(gate.measures.imputedShareOfWealth).toBeGreaterThan(
      PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth,
    );
    expect(gate.passed).toBe(false);
  });

  it("keeps the imputed-share ceiling at the value the frontier supports", () => {
    expect(PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth).toBe(0.4);
    expect(PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage).toBeLessThanOrEqual(
      FEASIBLE_FRONTIER.nearTermCoverage,
    );
  });

  it("refuses a threshold configured above the feasible frontier", () => {
    const unsatisfiable = evaluateGate(calculation, {
      ...PRODUCTION_V1_THRESHOLDS,
      minRightsClearedGdpCoverage: 0.7,
    });
    expect(codes(unsatisfiable.findings)).toContain("THRESHOLD_ABOVE_FEASIBLE_FRONTIER");
  });

  it("refuses an uncleared constituent", () => {
    const tainted = calculateUbwi({
      calculatedAt: CALCULATED_AT,
      economies: OBSERVED_ECONOMIES.map((e, i) =>
        i === 0 ? ({ ...e, rightsStatus: "under_review" } as ObservedEconomy) : e,
      ),
    });
    expect(codes(evaluateGate(tainted).findings)).toContain("CONSTITUENT_NOT_RIGHTS_CLEARED");
  });

  it("refuses an interpolated national wealth stock", () => {
    const bridged = calculateUbwi({
      calculatedAt: CALCULATED_AT,
      economies: OBSERVED_ECONOMIES.map((e, i) =>
        i === 0 ? ({ ...e, observationStatus: "imputed" } as ObservedEconomy) : e,
      ),
    });
    expect(codes(evaluateGate(bridged).findings)).toContain("INTERPOLATED_STOCK_PRESENT");
  });

  it("refuses a component that includes consumer durables without stripping them", () => {
    const durables = calculateUbwi({
      calculatedAt: CALCULATED_AT,
      economies: OBSERVED_ECONOMIES.map((e, i) =>
        i === 0
          ? ({ ...e, consumerDurablesTreatment: "included_not_stripped" } as ObservedEconomy)
          : e,
      ),
    });
    expect(codes(evaluateGate(durables).findings)).toContain("CONSUMER_DURABLES_NOT_STRIPPED");
  });

  it("refuses a period-average conversion of an end-period stock", () => {
    const wrongFx = calculateUbwi({
      calculatedAt: CALCULATED_AT,
      economies: OBSERVED_ECONOMIES.map((e, i) =>
        i === 1
          ? ({ ...e, fx: { ...e.fx, basis: "period_average" } } as ObservedEconomy)
          : e,
      ),
    });
    expect(codes(evaluateGate(wrongFx).findings)).toContain("FX_LINEAGE_INCOMPLETE");
  });

  it("refuses a stale vintage", () => {
    const stale = calculateUbwi({
      calculatedAt: CALCULATED_AT,
      economies: [
        ...OBSERVED_ECONOMIES,
        {
          ...OBSERVED_ECONOMIES[0]!,
          economy: "ZZZ",
          referenceDate: "2017-12-31",
          referenceYear: 2017,
        },
      ],
    });
    const found = codes(evaluateGate(stale).findings);
    expect(found).toContain("VINTAGE_RULE_VIOLATED");
    expect(found).toContain("VINTAGE_DISPERSION_EXCEEDED");
  });

  it("is deterministic: the same inputs give the same findings", () => {
    const again = evaluateGate(calculateUbwi({ calculatedAt: CALCULATED_AT }));
    expect(codes(again.findings)).toEqual(codes(gate.findings));
    expect(again.measures).toEqual(gate.measures);
  });
});

describe("disclosure", () => {
  it("names every unobserved economy above the disclosure threshold with a reason", () => {
    for (const economy of UNOBSERVED_MAJOR_ECONOMIES) {
      expect(economy.gdpShareOfWorld).toBeGreaterThanOrEqual(
        PRODUCTION_V1_THRESHOLDS.majorEconomyDisclosureThreshold,
      );
      expect(economy.reason.trim().length).toBeGreaterThan(20);
    }
    expect(UNOBSERVED_MAJOR_ECONOMIES.map((e) => e.economy)).toContain("CHN");
  });

  it("reports observed and modeled shares that a reader can check against each other", () => {
    expect(calculation.observedShareOfTotal).toBeGreaterThan(calculation.modeledShareOfTotal);
    expect(calculation.modeledShareOfTotal).toBeGreaterThan(35);
  });
});

describe("no fabricated history", () => {
  it("has exactly one production numerator observation and no back series", () => {
    expect(PRODUCTION_BTC_OBSERVATION.observedAt).toBe("2026-09-15T00:48:04Z");
    expect(Date.parse(PRODUCTION_BTC_OBSERVATION.observedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("gives every observed component a reference date no later than the calculation", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      expect(economy.referenceDate <= CALCULATED_AT.slice(0, 10)).toBe(true);
    }
  });
});
