import { describe, expect, it } from "vitest";

import type { SourceRightsState } from "@/lib/rights/publication";
import { UEPI_BENCHMARKS, UEPI_BENCHMARK_LIST } from "@/lib/uepi/benchmarks";
import {
  DERIVED_VALUE_PURPOSE, isPublicUepiUsePurpose, mayPublishUepiValue, uepiPublicationNotice,
} from "@/lib/uepi/rights";

function rights(over: Partial<SourceRightsState> = {}): SourceRightsState {
  return {
    sourceInterfaceSlug: "source",
    sourceName: "Source",
    purpose: DERIVED_VALUE_PURPOSE,
    rightsClassification: "ambiguous_requires_legal_review",
    disposition: "not_established",
    attributionRequired: true,
    attributionText: "Source: a market operator.",
    conditions: null,
    unresolvedIssue: "The terms neither grant nor forbid reuse of the numeric prices.",
    termsDocumentUrl: "https://example.invalid/terms",
    reviewedBy: "Urdais founder review",
    reviewedOn: "2026-09-24",
    ...over,
  };
}

describe("1. the platform policy is reused, not restated", () => {
  it("publishes an attribution-required source, carrying its credit line", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-ercot"],
      rights: rights({
        rightsClassification: "reusable_with_attribution_or_conditions",
        disposition: "permitted",
        attributionText: "Source: ERCOT. Urdais calculation.",
        unresolvedIssue: null,
      }),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("allowed_with_attribution_or_conditions");
    expect(uepiPublicationNotice(decision).attribution).toBe("Source: ERCOT. Urdais calculation.");
  });

  it("publishes an ambiguous source under founder-accepted risk, with the open question attached", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-caiso"],
      rights: rights(),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("allowed_under_founder_accepted_legal_risk");
    expect(decision.rightsClassification).toBe("ambiguous_requires_legal_review");
    expect(uepiPublicationNotice(decision).unresolvedIssue).toMatch(/neither grant nor forbid/);
  });

  it("refuses to publish where attribution is required and no credit line exists", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-nyiso"],
      rights: rights({ attributionText: null }),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_attribution_unavailable");
  });

  it("treats silence as refusal: no determination is not permission", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-nyiso"],
      rights: null,
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_no_rights_record");
  });
});

describe("2. posture is checked before the terms, and cannot be argued around", () => {
  it("blocks an internal-only series even if its determination said permitted", () => {
    for (const seriesId of ["uepi-pjm", "uepi-miso", "uepi-spp"] as const) {
      const decision = mayPublishUepiValue({
        benchmark: UEPI_BENCHMARKS[seriesId],
        // A deliberately over-permissive record: the posture must still refuse.
        rights: rights({ rightsClassification: "clearly_reusable", disposition: "permitted",
          attributionRequired: false, attributionText: null, unresolvedIssue: null }),
        publicationState: "published",
        purpose: DERIVED_VALUE_PURPOSE,
      });
      expect(decision.allowed, seriesId).toBe(false);
      expect(decision.reasonCode, seriesId).toBe("blocked_series_internal_only");
    }
  });

  it("blocks ISO-NE as not built, although its classification would otherwise publish", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-iso-ne"],
      rights: rights(),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_series_not_built");
  });

  it("blocks an unsuitable classification on a publishable series too", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-ercot"],
      rights: rights({ rightsClassification: "unsuitable_without_permission", disposition: "not_established" }),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_unsuitable_without_permission");
  });

  it("never publishes a series Urdais has marked internal-only in its own editorial state", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-ercot"],
      rights: rights({ rightsClassification: "clearly_reusable", disposition: "permitted",
        attributionRequired: false, attributionText: null, unresolvedIssue: null }),
      publicationState: "internal_only",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasonCode).toBe("blocked_internal_only");
  });
});

describe("3. publication never rewrites the finding", () => {
  it("returns the reviewer's classification unchanged when it publishes", () => {
    const determination = rights();
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-nyiso"],
      rights: determination,
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.rightsClassification).toBe(determination.rightsClassification);
    expect(decision.unresolvedIssue).toBe(determination.unresolvedIssue);
  });

  it("refuses to be asked a publication question about an internal purpose", () => {
    expect(isPublicUepiUsePurpose("uepi_retention")).toBe(false);
    expect(() => mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-ercot"],
      rights: rights({ purpose: "uepi_retention" }),
      publicationState: "published",
      purpose: "uepi_retention",
    })).toThrow(/internal purpose/);
  });

  it("has no notice for a blocked value", () => {
    const decision = mayPublishUepiValue({
      benchmark: UEPI_BENCHMARKS["uepi-spp"],
      rights: rights(),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    expect(() => uepiPublicationNotice(decision)).toThrow(/blocked value/);
  });
});

describe("4. the shipped release, stated as a test", () => {
  it("allows exactly ERCOT, CAISO and NYISO to reach a public surface", () => {
    const allowed = UEPI_BENCHMARK_LIST.filter((benchmark) => mayPublishUepiValue({
      benchmark,
      rights: rights(),
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    }).allowed).map((benchmark) => benchmark.seriesId);
    expect(allowed).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
  });
});
