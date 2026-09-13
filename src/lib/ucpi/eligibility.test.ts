import { describe, expect, it } from "vitest";

import type { NormalizedObservation } from "@/lib/ucpi/domain";
import { assessEligibility, type EligibilityContext } from "@/lib/ucpi/eligibility";
import { eligibleObservation, permitted } from "@/lib/ucpi/fixtures";

const D = "2026-09-13";
const ctx: EligibilityContext = { calculationDate: D, registry: new Map([["synthetic-interface", permitted("synthetic-interface")]]) };

describe("H100 child eligibility", () => {
  it("passes a fully qualifying observation through P0, P1 and P2 as a valid input", () => {
    const a = assessEligibility(eligibleObservation(), ctx);
    expect(a).toMatchObject({ p0: true, p1: true, p2: true, inputStatus: "valid", exclusions: [] });
    expect(a.diagnostics).toEqual(expect.arrayContaining(["OPERATOR_UNDETERMINED", "AVAILABILITY_GRADE_3", "SOURCE_EFFECTIVE_TIME_ABSENT"]));
  });

  const cases: [string, Partial<NormalizedObservation>, string, "p0" | "p1" | "p2"][] = [
    ["a different model", { gpuModel: "H200" }, "WRONG_HARDWARE", "p0"],
    ["PCIe form factor", { formFactor: "PCIe" }, "WRONG_HARDWARE", "p0"],
    ["NVL 94 GB", { formFactor: "NVL", gpuMemoryGb: 94 }, "WRONG_HARDWARE", "p0"],
    ["form factor unresolved", { formFactor: null, hardwareIdentityGrade: "insufficient" }, "HARDWARE_VARIANT_UNRESOLVED", "p0"],
    ["a partition", { fullDevice: false }, "FRACTIONAL_OR_SHARED_DEVICE", "p0"],
    ["serverless", { serviceProduct: "serverless" }, "WRONG_SERVICE_PRODUCT", "p1"],
    ["reserved", { procurementMode: "reserved" }, "WRONG_PROCUREMENT_MODE", "p1"],
    ["preemptible", { preemptible: true }, "PREEMPTIBLE", "p1"],
    ["promotional", { promotional: true }, "PROMOTIONAL_PRICE", "p1"],
    ["minimum topology unknown", { minimumGpuCount: null, minimumTopologySourceField: null }, "MINIMUM_TOPOLOGY_UNKNOWN", "p1"],
    ["whole node only", { topologyClass: "whole_node", wholeNodeRequired: true, minimumGpuCount: 8 }, "WHOLE_NODE_REQUIRED", "p1"],
    ["ambiguous tenancy", { tenancyGrade: "ambiguous" }, "TENANCY_UNRESOLVED", "p1"],
    ["unknown tenancy", { tenancyGrade: "unknown" }, "TENANCY_UNRESOLVED", "p1"],
    ["region unresolved", { canonicalRegionCode: null }, "REGION_UNRESOLVED", "p2"],
    ["availability unknown", { availabilityState: "unknown" }, "AVAILABILITY_UNKNOWN", "p2"],
    ["sold out", { availabilityState: "sold_out" }, "UNAVAILABLE", "p2"],
    ["waitlisted", { availabilityState: "waitlisted" }, "WAITLISTED", "p2"],
    ["quote required", { availabilityState: "quote_required" }, "QUOTE_REQUIRED", "p2"],
    ["Grade 4 availability", { availabilityEvidenceGrade: 4 }, "AVAILABILITY_EVIDENCE_INSUFFICIENT", "p2"],
    ["price observed yesterday", { observedAt: "2026-09-12T23:00:00Z" }, "PRICE_STALE", "p2"],
    ["availability observed yesterday", { availabilityObservedAt: "2026-09-12T23:00:00Z" }, "AVAILABILITY_STALE", "p2"],
    ["no price", { normalizedPrice: null }, "SOURCE_INSUFFICIENT", "p2"],
    ["foreign currency without a rate", { normalizedCurrency: "EUR" }, "CURRENCY_RATE_UNAVAILABLE", "p2"],
    ["host memory below the floor", { hostMemoryGbPerAccelerator: 64 }, "BUNDLE_OUT_OF_ENVELOPE", "p2"],
    ["host memory undisclosed", { hostMemoryGbPerAccelerator: null }, "SOURCE_INSUFFICIENT", "p2"],
    ["tax-inclusive price", { taxBasis: "inclusive" }, "TAX_BASIS_INCLUSIVE", "p2"],
    ["an advertised non-accessible price", { observationType: "advertised_non_accessible_price" }, "SOURCE_INSUFFICIENT", "p2"],
  ];

  for (const [label, override, code, stage] of cases) {
    it(`excludes ${label} with ${code} at ${stage.toUpperCase()}`, () => {
      const a = assessEligibility(eligibleObservation(override), ctx);
      expect(a.exclusions).toContain(code);
      expect(a[stage]).toBe(false);
      expect(a.p2).toBe(false);
      expect(a.inputStatus).not.toBe("valid");
    });
  }

  it("excludes a source the registry has not permitted, whatever the observation looks like", () => {
    const a = assessEligibility(eligibleObservation(), { calculationDate: D, registry: new Map() });
    expect(a.exclusions).toEqual(["COLLECTION_NOT_PERMITTED"]);
    expect(a.p2).toBe(false);
  });

  it("Limited availability is admitted at Grade 3", () => {
    const a = assessEligibility(eligibleObservation({ availabilityState: "limited" }), ctx);
    expect(a.p2).toBe(true);
  });

  it("an unresolved tax basis is a diagnostic, not an exclusion", () => {
    const a = assessEligibility(eligibleObservation({ taxBasis: "unresolved" }), ctx);
    expect(a.p2).toBe(true);
    expect(a.diagnostics).toContain("TAX_BASIS_UNRESOLVED");
  });

  it("reports stale as the input status when only freshness failed", () => {
    const a = assessEligibility(eligibleObservation({ observedAt: "2026-09-12T23:00:00Z", availabilityObservedAt: "2026-09-12T23:00:00Z" }), ctx);
    expect(a.inputStatus).toBe("stale");
  });

  it("names every failure, not just the first", () => {
    const a = assessEligibility(eligibleObservation({ tenancyGrade: "ambiguous", canonicalRegionCode: null, hostMemoryGbPerAccelerator: 32 }), ctx);
    expect(a.exclusions).toEqual(expect.arrayContaining(["TENANCY_UNRESOLVED", "REGION_UNRESOLVED", "BUNDLE_OUT_OF_ENVELOPE"]));
  });
});
