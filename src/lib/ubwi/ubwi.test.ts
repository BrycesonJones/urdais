import { describe, expect, it } from "vitest";

import {
  CENTRAL_SCENARIO_KEY,
  METHODOLOGY_VERSION,
  PRIOR_METHODOLOGY_VERSION,
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
  REFERENCE_BTC_OBSERVATION,
  RETIRED_VENUE_MEDIAN_OBSERVATION,
  checkBlockHeight,
  checkNumerator,
  checkSupplyDerivation,
  median,
  numeratorSourceInterfaces,
  venueDispersionBasisPoints,
} from "./numerator";
import { CHAINLINK_BTC_USD_FEED, CHAINLINK_SOURCE_INTERFACE } from "./chainlink";
import { cumulativeScheduledSubsidySats, satsToBtc } from "./supply";
import {
  SOURCE_INTERFACES,
  effectiveRightsStatus,
  failureMayInformSourceState,
  recheckTerms,
  sourceInterface,
} from "./rights";
import {
  checkTermsArtifactShape,
  clauseWords,
  extractDocumentText,
  isWordSubsequence,
  verifyAgainstRetainedBytes,
} from "./terms-integrity";
import type { ObservedEconomy } from "./types";

const CALCULATED_AT = "2026-09-15T00:48:04Z";
// After every terms retrieval in the record, so the structural checks are deterministic
// rather than reading the wall clock.
const RIGHTS_CHECKED_AT = new Date("2026-09-15T12:00:00Z");
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
      expect(OBSERVED_ECONOMIES.some((e) => e.economy === dropped.economy)).toBe(false);
      expect(dropped.reason.trim().length).toBeGreaterThan(40);
    }
  });

  it("excludes New Zealand on rights, not on vintage, since Phase 2D read Stats NZ", () => {
    // Production V1 dropped New Zealand on the OECD's 2017 mirror. Stats NZ publishes a
    // current land-inclusive balance sheet, so the vintage reason is no longer true --
    // and the exclusion stands on a reason that is.
    const nz = EXCLUDED_ECONOMIES.find((e) => e.economy === "NZL")!;
    expect(nz.rule).toBe("source_rights_not_established");
    expect(nz.referenceDate).toBe("2024-03-31");
    expect(LATEST_COMPLETE_YEAR - Number(nz.referenceDate.slice(0, 4))).toBeLessThanOrEqual(
      VINTAGE_MAX_AGE_YEARS,
    );
    expect(nz.reason).toContain("Rights not established");
  });

  it("keeps every retained component inside the vintage bound", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      expect(satisfiesVintageRule(economy)).toBe(true);
      expect(LATEST_COMPLETE_YEAR - economy.referenceYear).toBeLessThanOrEqual(
        VINTAGE_MAX_AGE_YEARS,
      );
    }
  });

  it("would fail the vintage rule for every economy dropped by it", () => {
    for (const dropped of EXCLUDED_ECONOMIES) {
      if (dropped.rule !== "vintage_max_age_years") continue;
      const year = Number(dropped.referenceDate.slice(0, 4));
      expect(LATEST_COMPLETE_YEAR - year).toBeGreaterThan(VINTAGE_MAX_AGE_YEARS);
    }
    expect(EXCLUDED_ECONOMIES.filter((e) => e.rule === "vintage_max_age_years")).toHaveLength(1);
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
      // The ECB's reference rates cover every European and OECD-mirrored component.
      // Taiwan is the one economy no ECB fixing exists for -- the ECB has published no
      // TWD reference rate -- so its conversion uses the Central Bank of the Republic of
      // China's own interbank closing rate, under the same OGDL-Taiwan 1.0 licence as the
      // stock itself. A second FX source is a thing to notice, which is why it is named
      // here rather than allowed in by a blanket relaxation.
      expect(["ecb-euro-reference-rates", "cbc-exchange-rates"]).toContain(
        economy.fx.sourceInterface,
      );
      if (economy.economy === "TWN") {
        expect(economy.fx.sourceInterface).toBe("cbc-exchange-rates");
      } else {
        expect(economy.fx.sourceInterface).toBe("ecb-euro-reference-rates");
      }
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
    expect(checkNumerator(REFERENCE_BTC_OBSERVATION)).toEqual([]);
  });

  it("prices from the Chainlink reference feed under methodology 1.1.0", () => {
    expect(REFERENCE_BTC_OBSERVATION.priceRule).toBe("chainlink_reference_feed");
    expect(REFERENCE_BTC_OBSERVATION.chainlink).toBeDefined();
    expect(REFERENCE_BTC_OBSERVATION.venues).toBeUndefined();
    expect(REFERENCE_BTC_OBSERVATION.priceUsd).toBe(
      REFERENCE_BTC_OBSERVATION.chainlink!.normalizedUsd,
    );
  });

  it("records the block height its supply figure belongs to", () => {
    expect(REFERENCE_BTC_OBSERVATION.blockHeight).toBeGreaterThan(0);
    expect(REFERENCE_BTC_OBSERVATION.heightSources.length).toBeGreaterThanOrEqual(2);
  });

  it("multiplies supply by the reference price", () => {
    expect(REFERENCE_BTC_OBSERVATION.marketCapUsd).toBeCloseTo(
      REFERENCE_BTC_OBSERVATION.supplyBtc * REFERENCE_BTC_OBSERVATION.priceUsd,
      2,
    );
  });

  it("preserves the retired three-venue observation rather than deleting it", () => {
    // Methodology history is not a changelog entry. The 1.0.0 observation stays in the
    // codebase, stays checkable, and stays labelled with the rule that produced it.
    expect(RETIRED_VENUE_MEDIAN_OBSERVATION.priceRule).toBe("median_of_venues");
    expect(RETIRED_VENUE_MEDIAN_OBSERVATION.venues!.map((v) => v.venue)).toEqual([
      "coinbase",
      "bitstamp",
      "kraken",
    ]);
    expect(checkNumerator(RETIRED_VENUE_MEDIAN_OBSERVATION)).toEqual([]);
    expect(RETIRED_VENUE_MEDIAN_OBSERVATION.venues!.length).toBeGreaterThanOrEqual(
      MINIMUM_VENUE_COUNT,
    );
    const prices = RETIRED_VENUE_MEDIAN_OBSERVATION.venues!.map((v) => v.priceUsd);
    expect(RETIRED_VENUE_MEDIAN_OBSERVATION.priceUsd).toBe(median(prices));
  });

  it("keeps numerator price uncertainty far below denominator uncertainty", () => {
    // The retired rule measured this directly as venue dispersion. The reference feed has
    // no dispersion to measure, so the comparable quantity is its deviation threshold:
    // the feed may sit up to 0.5 % from the reported market before it re-reports.
    const numeratorBps = CHAINLINK_BTC_USD_FEED.deviationThresholdPercent * 100;
    const denominatorSpread =
      ((calculation.sensitivity.highPercent - calculation.sensitivity.lowPercent) /
        calculation.ubwiPercent) *
      10_000;
    expect(denominatorSpread).toBeGreaterThan(numeratorBps * 10);
    expect(venueDispersionBasisPoints(RETIRED_VENUE_MEDIAN_OBSERVATION)).toBeLessThan(5);
  });

  it("rejects a numerator whose price disagrees with the feed it cites", () => {
    const tampered = { ...REFERENCE_BTC_OBSERVATION, priceUsd: 1, marketCapUsd: 1 };
    expect(checkNumerator(tampered)).toContain("PRICE_DISAGREES_WITH_FEED");
  });

  it("rejects a numerator that claims one price rule and carries the other's lineage", () => {
    const mixed = {
      ...REFERENCE_BTC_OBSERVATION,
      venues: RETIRED_VENUE_MEDIAN_OBSERVATION.venues,
    };
    expect(checkNumerator(mixed)).toContain("PRICE_RULE_LINEAGE_MISMATCH");
  });

  it("rejects a Chainlink observation with no frozen round", () => {
    const bare = { ...REFERENCE_BTC_OBSERVATION, chainlink: undefined };
    expect(checkNumerator(bare)).toContain("PRICE_LINEAGE_MISSING");
  });

  it("rejects a retired-rule observation with fewer than three venues", () => {
    const thin = {
      ...RETIRED_VENUE_MEDIAN_OBSERVATION,
      venues: RETIRED_VENUE_MEDIAN_OBSERVATION.venues!.slice(0, 2),
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

describe("the protocol-derived supply leg, through the gate", () => {
  // Methodology 1.2.0 replaces one rights requirement with two correctness requirements.
  // These tests fix each refusal separately, because Part 10 of the amendment is explicit
  // that they must not collapse into a generic numerator failure: the operator response to
  // "the two height sources disagree" has nothing in common with "the supply exceeds the
  // protocol cap".
  const n = REFERENCE_BTC_OBSERVATION;
  const gateFor = (numerator: typeof n) =>
    evaluateGate(calculateUbwi({ calculatedAt: CALCULATED_AT, numerator }));

  it("publishes a supply that reproduces from its own recorded height", () => {
    expect(checkSupplyDerivation(n)).toEqual([]);
    expect(checkBlockHeight(n)).toEqual([]);
    expect(n.supplyConstruction).toBe("protocol_scheduled");
    expect(n.supplyDerivation!.rightsBasis).toBe("derived_from_protocol");
    // The quantity itself, recomputed here from the height rather than restated.
    expect(BigInt(n.supplyDerivation!.scheduledSupplySats)).toBe(
      cumulativeScheduledSubsidySats(n.blockHeight),
    );
    expect(n.supplyBtc).toBe(satsToBtc(cumulativeScheduledSubsidySats(n.blockHeight)));
  });

  it("records that fees and lost coins are excluded, rather than leaving it implied", () => {
    expect(n.supplyDerivation!.excludesTransactionFees).toBe(true);
    expect(n.supplyDerivation!.excludesLostCoinAdjustment).toBe(true);
  });

  it("refuses a height its two sources disagree on, and never averages them", () => {
    const disagreeing = {
      ...n,
      heightObservations: [
        n.heightObservations![0]!,
        { ...n.heightObservations![1]!, rawValue: "967076", blockHeight: 967_076 },
      ],
    };
    expect(checkBlockHeight(disagreeing)).toContain("HEIGHT_SOURCES_DISAGREE");
    const found = codes(gateFor(disagreeing).findings);
    expect(found).toContain("BLOCK_HEIGHT_NOT_CROSS_VERIFIED");
    // Not collapsed into the generic numerator finding.
    expect(found).not.toContain("NUMERATOR_INVALID");
  });

  it("refuses a height supported by only one source", () => {
    const single = { ...n, heightObservations: [n.heightObservations![0]!] };
    expect(checkBlockHeight(single)).toContain("HEIGHT_SOURCES_TOO_FEW");
    expect(codes(gateFor(single).findings)).toContain("BLOCK_HEIGHT_NOT_CROSS_VERIFIED");
  });

  it("refuses a height whose raw bytes do not parse to the value recorded beside them", () => {
    const edited = {
      ...n,
      heightObservations: [
        { ...n.heightObservations![0]!, rawValue: "967099" },
        n.heightObservations![1]!,
      ],
    };
    expect(checkBlockHeight(edited)).toContain("HEIGHT_RAW_VALUE_MISPARSED");
  });

  it("refuses a height that is not a usable block height at all", () => {
    for (const bad of [0, -1, 1.5]) {
      const broken = { ...n, blockHeight: bad };
      expect(codes(gateFor(broken).findings)).toContain("BLOCK_HEIGHT_INVALID");
    }
  });

  it("refuses a supply that does not reproduce from its height", () => {
    const tampered = {
      ...n,
      supplyDerivation: { ...n.supplyDerivation!, scheduledSupplySats: "2008461250000001" },
    };
    expect(checkSupplyDerivation(tampered)).toContain("SUPPLY_DISAGREES_WITH_SCHEDULE");
    const found = codes(gateFor(tampered).findings);
    expect(found).toContain("SUPPLY_DERIVATION_INVALID");
    expect(found).not.toContain("SUPPLY_IMPOSSIBLE");
  });

  it("refuses a supply above the protocol cap under its own distinct code", () => {
    const impossible = {
      ...n,
      supplyDerivation: { ...n.supplyDerivation!, scheduledSupplySats: "2100000000000001" },
    };
    expect(checkSupplyDerivation(impossible)).toContain("SUPPLY_ABOVE_PROTOCOL_CAP");
    expect(codes(gateFor(impossible).findings)).toContain("SUPPLY_IMPOSSIBLE");
  });

  it("refuses a derived supply that names a supply source interface", () => {
    const withIface = { ...n, supplySourceInterface: "blockchain-info-supply" };
    expect(checkSupplyDerivation(withIface)).toContain("SUPPLY_INTERFACE_UNEXPECTED");
  });

  it("refuses a protocol-scheduled observation carrying no derivation lineage", () => {
    const bare = { ...n, supplyDerivation: undefined };
    expect(checkSupplyDerivation(bare)).toContain("SUPPLY_LINEAGE_MISSING");
    expect(codes(gateFor(bare).findings)).toContain("SUPPLY_DERIVATION_INVALID");
  });

  it("holds the retired retrieved-supply observation to the rule it was made under", () => {
    // The 1.0.0 observation still carries an interface and no derivation, and must not be
    // retroactively judged against a rule that did not exist when it was taken.
    expect(checkSupplyDerivation(RETIRED_VENUE_MEDIAN_OBSERVATION)).toEqual([]);
    expect(RETIRED_VENUE_MEDIAN_OBSERVATION.supplyConstruction).toBe("claimed_issuance");
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

  it("clears the imputed-share ceiling and the coverage floor once Taiwan is admitted", () => {
    // Production V1 refused here: dropping New Zealand and Russia on vintage and rights
    // cost 2.19 pp of coverage and pushed the modelled share above the ceiling. Taiwan
    // is what closes that gap, and it closes it by 0.24 pp -- narrowly, which is worth
    // stating, because a bound cleared by a quarter of a point is a bound that a single
    // revision can un-clear. Neither threshold moved.
    expect(codes(gate.findings)).not.toContain("IMPUTED_SHARE_ABOVE_CEILING");
    expect(codes(gate.findings)).not.toContain("COVERAGE_BELOW_FLOOR");
    expect(gate.measures.imputedShareOfWealth).toBeLessThanOrEqual(
      PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth,
    );
    expect(gate.measures.rightsClearedGdpCoverage).toBeGreaterThanOrEqual(
      PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage,
    );
    expect(PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth).toBe(0.4);
    expect(PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage).toBe(0.52);
  });

  it("passes, with no finding at all, once the supply leg stops depending on a dataset", () => {
    // Phase 2E left exactly one finding standing: NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED, on
    // the BTC supply source's own terms. Methodology 1.2.0 does not clear those terms and
    // does not waive them -- it removes the dependency, by deriving the supply from the
    // issuance schedule instead of retrieving it. The finding is gone because the source
    // is gone.
    //
    // Asserted as the empty list rather than as `passed`, so that a future change which
    // trades one finding for another cannot slip through as "still passing".
    expect(codes(gate.findings)).toEqual([]);
    expect(gate.passed).toBe(true);
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
    expect(REFERENCE_BTC_OBSERVATION.observedAt).toBe("2026-09-15T04:13:40Z");
    expect(Date.parse(REFERENCE_BTC_OBSERVATION.observedAt)).toBeLessThanOrEqual(Date.now());
  });

  it("gives every observed component a reference date no later than the calculation", () => {
    for (const economy of OBSERVED_ECONOMIES) {
      expect(economy.referenceDate <= CALCULATED_AT.slice(0, 10)).toBe(true);
    }
  });
});

describe("numerator rights: the venues' own terms", () => {
  // Phase 1 concluded that reading venue tickers directly removes the licensing
  // dependency of a vendor aggregate. Phase 2D retrieved the venues' own terms and found
  // the conclusion was about vendors: reproducing the construction does not reproduce the
  // permission. These tests fix that finding so it cannot be quietly undone.
  const numeratorSlugs = [
    RETIRED_VENUE_MEDIAN_OBSERVATION.supplySourceInterface!,
    ...RETIRED_VENUE_MEDIAN_OBSERVATION.venues!.map((v) => v.sourceInterface),
  ];

  it("names a registered source interface for every venue and for the supply", () => {
    expect(numeratorSlugs).toHaveLength(4);
    for (const slug of numeratorSlugs) {
      expect(sourceInterface(slug), `${slug} is not registered`).toBeDefined();
    }
  });

  it("rests every numerator rights state on a retained, hashed artifact", () => {
    for (const slug of numeratorSlugs) {
      const artifact = sourceInterface(slug)!.termsArtifact;
      expect(artifact, `${slug} has no retained terms artifact`).not.toBeNull();
      expect(artifact!.contentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(artifact!.httpStatus).toBe(200);
      expect(artifact!.byteLength).toBeGreaterThan(0);
    }
  });

  it("clears none of the four for the use a published numerator makes", () => {
    for (const slug of numeratorSlugs) {
      expect(effectiveRightsStatus(sourceInterface(slug)!), slug).not.toBe("cleared");
    }
  });

  it("records Coinbase as blocked on both axes, retrieval included", () => {
    const coinbase = sourceInterface("coinbase-spot")!;
    expect(coinbase.termsReviewState).toBe("not_permitted");
    expect(coinbase.dataUseTermsState).toBe("not_permitted");
    expect(effectiveRightsStatus(coinbase)).toBe("blocked");
    expect(coinbase.usageTerms!.cachingAndRetention).toBe("not_permitted");
    expect(coinbase.termsArtifact!.decisiveClause).toContain("Collect, cache, aggregate, or store data");
  });

  it("records Kraken as permitted to read and not permitted to publish from", () => {
    const kraken = sourceInterface("kraken-ticker")!;
    expect(kraken.termsReviewState).toBe("permitted");
    expect(kraken.dataUseTermsState).toBe("not_permitted");
    expect(effectiveRightsStatus(kraken)).toBe("blocked");
    expect(kraken.usageTerms!.automatedRetrieval).toBe("permitted");
    expect(kraken.usageTerms!.commercialDerivedIndex).toBe("not_permitted");
    expect(kraken.termsArtifact!.decisiveClause).toContain("only for your own benefit");
  });

  it("records Bitstamp's grant as conditional on an agreement Urdais does not hold", () => {
    // The distinction the two-valued model could not carry: Bitstamp permits exactly the
    // use Urdais makes, to a signatory. An unsigned conditional grant is not a grant.
    const bitstamp = sourceInterface("bitstamp-ticker")!;
    expect(bitstamp.usageTerms!.commercialDerivedIndex).toBe("conditional");
    expect(bitstamp.usageTerms!.automatedRetrieval).toBe("permitted");
    expect(bitstamp.usageTerms!.rateLimit).toContain("400 requests per second");
    expect(bitstamp.dataUseTermsState).toBe("under_review");
    expect(effectiveRightsStatus(bitstamp)).toBe("under_review");
    expect(bitstamp.termsArtifact!.decisiveClause).toContain("Data License Agreement");
  });

  it("does not read Blockchain.com's silence on redistribution as permission", () => {
    const chain = sourceInterface("blockchain-info-supply")!;
    expect(chain.termsReviewState).toBe("permitted");
    expect(chain.dataUseTermsState).toBe("under_review");
    expect(chain.usageTerms!.commercialDerivedIndex).toBe("not_reviewed");
    expect(chain.termsArtifact!.decisiveClause).toContain("solely for informational purposes");
  });

  it("would still refuse the retired three-venue numerator", () => {
    // The venues did not become publishable by being retired. Feeding the 1.0.0
    // observation back through today's gate must still name all three, or the finding
    // Phase 2D fixed has been lost rather than superseded.
    const retired = calculateUbwi({
      calculatedAt: calculation.calculatedAt,
      numerator: RETIRED_VENUE_MEDIAN_OBSERVATION,
    });
    const finding = evaluateGate(retired).findings.find(
      (f) => f.code === "NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED",
    );
    expect(finding).toBeDefined();
    for (const slug of numeratorSlugs) {
      expect(finding!.detail).toContain(slug);
    }
  });

  it("no longer reads any supply source, so there is none left to refuse", () => {
    // Phase 2E's crux, inverted by Phase 2F and kept as the test that proves the
    // dependency was removed rather than the standard lowered.
    //
    // Blockchain.com's terms are unchanged and still `under_review` for the derived-index
    // use. The reason the gate no longer refuses is not that the state improved: it is
    // that the published numerator no longer names a supply interface at all.
    const iface = sourceInterface("blockchain-info-supply")!;
    expect(effectiveRightsStatus(iface)).not.toBe("cleared");
    expect(iface.termsArtifact).not.toBeNull();

    expect(REFERENCE_BTC_OBSERVATION.supplySourceInterface).toBeUndefined();
    expect(numeratorSourceInterfaces(REFERENCE_BTC_OBSERVATION)).toEqual([
      CHAINLINK_SOURCE_INTERFACE,
    ]);
    expect(numeratorSourceInterfaces(REFERENCE_BTC_OBSERVATION)).not.toContain(
      "blockchain-info-supply",
    );

    const gate = evaluateGate(calculation);
    expect(gate.findings.find((f) => f.code === "NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED")).toBeUndefined();
  });

  it("retires the venue set by methodology amendment, not by silent substitution", () => {
    // The venues were not swapped to make the rights easier: the price rule itself
    // changed, under a version bump, with the retired observation and every retained
    // venue artifact left in place. A substitution that leaves the methodology version
    // untouched is the thing this test exists to catch.
    expect(METHODOLOGY_VERSION).toBe("1.2.0");
    expect(PRIOR_METHODOLOGY_VERSION).toBe("1.1.0");
    expect(REFERENCE_BTC_OBSERVATION.priceRule).toBe("chainlink_reference_feed");
    for (const slug of ["coinbase-spot", "bitstamp-ticker", "kraken-ticker"]) {
      const iface = sourceInterface(slug);
      expect(iface, `${slug} evidence must survive the retirement`).toBeDefined();
      expect(iface!.termsArtifact).not.toBeNull();
    }
  });
});

describe("terms-artifact integrity", () => {
  const withArtifact = (patch: Record<string, unknown>) => {
    const iface = sourceInterface("federal-reserve-z1")!;
    return { ...iface, termsArtifact: { ...iface.termsArtifact!, ...patch } };
  };
  const problems = (iface: (typeof SOURCE_INTERFACES)[number]) =>
    checkTermsArtifactShape([iface], RIGHTS_CHECKED_AT).map((f) => f.problem);

  it("passes the structural checks on the whole rights record", () => {
    expect(checkTermsArtifactShape(SOURCE_INTERFACES, RIGHTS_CHECKED_AT)).toEqual([]);
  });

  it("refuses a hash that is not a hash", () => {
    expect(problems(withArtifact({ contentHash: "not-a-hash" }))).toContain("HASH_MALFORMED");
    expect(problems(withArtifact({ contentHash: "0".repeat(63) }))).toContain("HASH_MALFORMED");
  });

  it("refuses a 404 body cited as terms", () => {
    expect(problems(withArtifact({ httpStatus: 404 }))).toContain("HTTP_STATUS_NOT_OK");
  });

  it("refuses a retrieval timestamped after the check", () => {
    expect(problems(withArtifact({ retrievedAt: "2099-01-01T00:00:00Z" }))).toContain(
      "RETRIEVED_AT_IN_FUTURE",
    );
  });

  it("refuses a byte length of zero and a clause too short to identify a licence", () => {
    expect(problems(withArtifact({ byteLength: 0 }))).toContain("BYTE_LENGTH_NOT_POSITIVE");
    expect(problems(withArtifact({ decisiveClause: "public domain" }))).toContain(
      "DECISIVE_CLAUSE_TOO_SHORT",
    );
  });

  it("refuses one hash cited for two different documents", () => {
    const fed = sourceInterface("federal-reserve-z1")!;
    const abs = sourceInterface("abs-asna-5204")!;
    const collided = {
      ...abs,
      termsArtifact: { ...abs.termsArtifact!, contentHash: fed.termsArtifact!.contentHash },
    };
    const found = checkTermsArtifactShape([fed, collided], RIGHTS_CHECKED_AT);
    expect(found.map((f) => f.problem)).toContain("HASH_REUSED_FOR_A_DIFFERENT_DOCUMENT");
  });

  it("refuses a permitted state with no artifact behind it", () => {
    const bare = { ...sourceInterface("federal-reserve-z1")!, termsArtifact: null };
    expect(problems(bare)).toContain("CLEARED_WITHOUT_ARTIFACT");
  });

  it("catches a clause remembered rather than read", () => {
    // The Production V1 failure mode, reproduced: the hash and the length are right and
    // the quote is a paraphrase. Byte checks alone pass it; the clause check does not.
    const iface = sourceInterface("federal-reserve-z1")!;
    const remembered = {
      ...iface,
      termsArtifact: {
        ...iface.termsArtifact!,
        decisiveClause: "All Federal Reserve data may be freely redistributed for any purpose whatsoever.",
      },
    };
    const result = verifyAgainstRetainedBytes(remembered, {
      contentHash: iface.termsArtifact!.contentHash,
      byteLength: iface.termsArtifact!.byteLength,
      text: "Information on the Board's website is in the public domain.",
    });
    expect(result.hashMatches).toBe(true);
    expect(result.byteLengthMatches).toBe(true);
    expect(result.clauseIsPresent).toBe(false);
    expect(result.verified).toBe(false);
  });

  it("verifies a clause that is genuinely in the document, through list markup", () => {
    // The OGL v3.0 presents its grant as a bulleted list, so the committed quote joins
    // items with punctuation the source does not contain. Word order survives that;
    // substring containment would not, which is why the check is a subsequence.
    const iface = sourceInterface("ons-national-balance-sheet")!;
    const html =
      "<h2>You are free to:</h2><ul><li>copy, publish, distribute and transmit the Information</li>" +
      "<li>adapt the Information</li><li>exploit the Information commercially and non-commercially " +
      "for example, by combining it with other Information, or by including it in your own product " +
      "or application</li></ul>";
    const result = verifyAgainstRetainedBytes(iface, {
      contentHash: iface.termsArtifact!.contentHash,
      byteLength: iface.termsArtifact!.byteLength,
      text: extractDocumentText(html),
    });
    expect(result.clauseIsPresent).toBe(true);
    expect(result.verified).toBe(true);
  });

  it("reports a hash mismatch as a mismatch rather than as a missing clause", () => {
    const iface = sourceInterface("federal-reserve-z1")!;
    const result = verifyAgainstRetainedBytes(iface, {
      contentHash: "f".repeat(64),
      byteLength: iface.termsArtifact!.byteLength,
      text: iface.termsArtifact!.decisiveClause,
    });
    expect(result.hashMatches).toBe(false);
    expect(result.clauseIsPresent).toBe(true);
    expect(result.detail).toContain("hash mismatch");
  });

  it("strips script bodies out of an artifact rather than quoting from them", () => {
    expect(extractDocumentText("<p>granted</p><script>var x = 'granted twice';</script>")).toBe(
      "granted",
    );
  });

  it("compares non-ASCII licence text character by character", () => {
    // Japan's and Korea's decisive clauses are not word-delimited. The tokenizer makes
    // every non-ASCII character its own token so they compare at all.
    expect(isWordSubsequence(clauseWords("内閣府"), clauseWords("著作権は内閣府に帰属し"))).toBe(true);
    expect(isWordSubsequence(clauseWords("内閣府"), clauseWords("著作権は財務省に帰属し"))).toBe(false);
  });
});
