import { describe, expect, it } from "vitest";

import type { SourceRightsState } from "@/lib/rights/publication";
import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { normalizeOperatingDay } from "@/lib/uepi/normalize";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import { evaluateRelease } from "@/lib/uepi/release";
import { DERIVED_VALUE_PURPOSE, mayPublishUepiValue } from "@/lib/uepi/rights";
import { misoAdapter } from "@/lib/uepi/source/adapters/miso";
import { sppAdapter } from "@/lib/uepi/source/adapters/spp";
import { IMPLEMENTED_SERIES_IDS, adapterFor } from "@/lib/uepi/source/registry";
import { fixtureArtifacts } from "@/lib/uepi/source/fixtures/load";

/**
 * Ingestion and publication are two decisions, and this phase makes only the first.
 *
 * The case that matters is MISO and SPP: both are read, normalized, calculated and stored, and
 * neither may ever be shown. A test is the only durable way to keep those two facts from drifting
 * into each other.
 */
function permissiveRights(): SourceRightsState {
  return {
    sourceInterfaceSlug: "any", sourceName: "any", purpose: DERIVED_VALUE_PURPOSE,
    rightsClassification: "clearly_reusable", disposition: "permitted",
    attributionRequired: false, attributionText: null, conditions: null, unresolvedIssue: null,
    termsDocumentUrl: null, reviewedBy: "test", reviewedOn: "2026-09-25",
  };
}

describe("1. a market Urdais may not publish is still ingested", () => {
  const cases = [
    { seriesId: "uepi-miso", date: "2026-09-23", adapter: misoAdapter, file: "miso-2026-09-23.csv", label: "day" },
    { seriesId: "uepi-spp", date: "2026-04-12", adapter: sppAdapter, file: "spp-2026-04-12.csv", label: "day" },
  ] as const;

  it("releases internally and refuses publicly, for the same day and the same data", () => {
    for (const entry of cases) {
      const benchmark = benchmarkFor(entry.seriesId);
      const window = operatingDayWindow(benchmark, entry.date);
      const parsed = entry.adapter.parse(entry.date, fixtureArtifacts(entry.file, entry.label));
      const { hours, crossChecks } = normalizeOperatingDay(benchmark, window, parsed);
      const shared = {
        benchmark, window, hours, crossChecks,
        specificationApproved: true, now: new Date("2026-09-25T00:00:00Z"),
      } as const;

      const internal = evaluateRelease({ ...shared, intent: "internal_release" });
      expect(internal.released, entry.seriesId).toBe(true);

      const published = evaluateRelease({
        ...shared,
        intent: "public_release",
        // Deliberately over-permissive terms: the posture must refuse anyway.
        publicationSubject: {
          rights: permissiveRights(), publicationState: "published", purpose: DERIVED_VALUE_PURPOSE,
        },
      });
      expect(published.released, entry.seriesId).toBe(false);
      if (!published.released) expect(published.reason).toBe("rights_blocked");
    }
  });

  it("marks those retrievals as research rather than production", () => {
    expect(adapterFor("uepi-miso").retrievalPurpose).toBe("research");
    expect(adapterFor("uepi-spp").retrievalPurpose).toBe("research");
  });
});

describe("2. the publishable markets keep the posture the specification gave them", () => {
  it("allows CAISO and NYISO under their recorded determination", () => {
    for (const seriesId of ["uepi-caiso", "uepi-nyiso"] as const) {
      const decision = mayPublishUepiValue({
        benchmark: benchmarkFor(seriesId),
        rights: {
          ...permissiveRights(),
          rightsClassification: "ambiguous_requires_legal_review",
          disposition: "not_established",
          attributionRequired: true,
          attributionText: "Source: the market operator.",
          unresolvedIssue: "The terms neither grant nor forbid reuse of the numeric prices.",
        },
        publicationState: "published",
        purpose: DERIVED_VALUE_PURPOSE,
      });
      expect(decision.allowed, seriesId).toBe(true);
      expect(decision.reasonCode, seriesId).toBe("allowed_under_founder_accepted_legal_risk");
      expect(decision.unresolvedIssue, seriesId).toBeTruthy();
    }
  });

  it("does not let ingestion change any market's rights posture", () => {
    // Nothing in this phase writes to the rights tables, and nothing may infer a right from the
    // fact that a file downloaded successfully.
    const expected: Record<string, string> = {
      "uepi-caiso": "publishable", "uepi-nyiso": "publishable",
      "uepi-miso": "internal_only", "uepi-spp": "internal_only",
    };
    for (const seriesId of IMPLEMENTED_SERIES_IDS) {
      expect(benchmarkFor(seriesId).publicationPosture, seriesId).toBe(expected[seriesId]);
    }
  });
});
