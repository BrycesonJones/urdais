/**
 * The import plan: what stops a batch, and what merely gets flagged.
 *
 * The line between the two is the subject of most of this file. An importer of
 * this dataset that acted on a similarity — merged two records because they
 * share an address, or because their names look alike — would produce one
 * plausible row where two real entities stand. So similarity is always a
 * remark, never a merge, and the fixtures below assert that both records
 * survive every resemblance the dataset actually contains.
 */

import { describe, expect, it } from "vitest";

import { parseFacilityImportDocument, type FacilityImportDocument } from "@/lib/facilities/contract";
import { buildImportPlan, nameSimilarity } from "@/lib/facilities/import/plan";

function evidence(url = "https://example.invalid/campus", claims: Array<[string, string]> = [["location", "Fixture Street 1"]]) {
  return {
    publisher: "Fixture Publisher",
    title: "Fixture page",
    url,
    documentType: "company_facility_page",
    publishedOn: null,
    claims: claims.map(([field, statement]) => ({ field, statement })),
  };
}

function facility(overrides: Record<string, unknown> = {}) {
  return {
    researchKey: "fixture-campus",
    canonicalName: "Fixture Campus",
    category: "data_center",
    ownerName: "Fixture Owner",
    aliases: [],
    location: {
      streetAddress: "Fixture Street 1",
      locality: "Fixtureton",
      countryName: "Finland",
      countryCode: "FI",
      latitude: 64.23,
      longitude: 27.69,
      coordinatePrecision: "building",
      coordinateMethod: "documented_address_geocode",
    },
    lifecycle: { status: "operational" },
    facts: [],
    evidence: [evidence()],
    quality: { confidence: "high", lastVerifiedDate: "2026-09-17", reviewNotes: [] },
    requestedPublicationState: "published",
    ...overrides,
  };
}

/** Parses through the real contract, so no test can plan a document the contract would refuse. */
function parsed(facilities: Array<Record<string, unknown>>, relationships: Array<Record<string, unknown>> = []): FacilityImportDocument {
  const { document, issues } = parseFacilityImportDocument({
    contractVersion: "urdais.map.facility-import/1",
    datasetName: "Fixture dataset",
    researchDocument: "FIXTURE.md",
    generatedAt: "2026-09-17",
    facilities,
    relationships,
  });
  if (!document) throw new Error(`fixture failed the contract: ${JSON.stringify(issues)}`);
  return document;
}

const TODAY = new Date("2026-09-17T00:00:00Z");
const plan = (facilities: Array<Record<string, unknown>>, relationships: Array<Record<string, unknown>> = [], existing: string[] = []) =>
  buildImportPlan(parsed(facilities, relationships), { existingResearchKeys: existing, today: TODAY });

const codes = (entries: readonly { code: string }[]) => entries.map((entry) => entry.code);

describe("buildImportPlan", () => {
  it("plans a clean batch with no errors", () => {
    const result = plan([facility()]);
    expect(result.errors).toEqual([]);
    expect(result.counts.facilities).toBe(1);
    expect(result.counts.published).toBe(1);
    expect(result.counts.mapEligible).toBe(1);
  });

  it("rejects the same research key twice in one batch", () => {
    const result = plan([facility(), facility({ canonicalName: "Fixture Campus, again" })]);
    expect(codes(result.errors)).toContain("duplicate_research_key");
  });

  describe("publication", () => {
    it("refuses a facility that asks to publish with no coordinates, rather than quietly demoting it", () => {
      const result = plan([facility({ location: { locality: "Fixtureton", countryCode: "FI" } })]);
      expect(codes(result.errors)).toEqual(["publication_needs_position"]);
      expect(result.errors[0]?.message).toContain("never a placed dot");
    });

    it("refuses a city centroid", () => {
      const result = plan([
        facility({
          location: { locality: "Fixtureton", countryCode: "FI", latitude: 64.2, longitude: 27.7, coordinatePrecision: "city", coordinateMethod: "city_centroid" },
        }),
      ]);
      expect(codes(result.errors)).toEqual(["publication_needs_position"]);
      expect(result.errors[0]?.message).toContain("a location, not a position");
    });

    it("refuses low confidence, a missing verification date, and a cancelled or retired project", () => {
      expect(codes(plan([facility({ quality: { confidence: "low", lastVerifiedDate: "2026-09-17" } })]).errors)).toContain("publication_needs_confidence");
      expect(codes(plan([facility({ quality: { confidence: "high" } })]).errors)).toContain("publication_needs_verification_date");
      expect(codes(plan([facility({ lifecycle: { status: "cancelled" } })]).errors)).toContain("publication_needs_live_lifecycle");
      expect(codes(plan([facility({ lifecycle: { status: "retired" } })]).errors)).toContain("publication_needs_live_lifecycle");
    });

    it("refuses to publish a facility no document placed", () => {
      const result = plan([facility({ evidence: [evidence("https://example.invalid/capacity", [["capacity", "400 MW"]])] })]);
      expect(codes(result.errors)).toEqual(["publication_needs_positioning_evidence"]);
    });

    it("keeps an unplaceable facility as a research record without complaint", () => {
      const result = plan([
        facility({
          researchKey: "fixture-unplaced",
          location: { locality: "Fixtureton", countryCode: "FI" },
          requestedPublicationState: "research",
        }),
      ]);
      expect(result.errors).toEqual([]);
      expect(result.facilities[0]?.publicationState).toBe("research");
      expect(result.facilities[0]?.mapEligible).toBe(false);
      expect(codes(result.reviewCandidates)).toContain("not_map_eligible");
    });
  });

  describe("the power rule", () => {
    const plant = (overrides: Record<string, unknown> = {}) =>
      facility({
        researchKey: "fixture-plant",
        canonicalName: "Fixture Power Station",
        category: "power_infrastructure",
        latitude: 41.09,
        evidence: [evidence("https://example.invalid/plant", [["location", "Salem Township"], ["compute_relationship", "campus powered by this station"]])],
        ...overrides,
      });
    const load = facility({ researchKey: "fixture-load", canonicalName: "Fixture Campus Load", requestedPublicationState: "research" });

    it("refuses to publish a power station with nothing tying it to compute", () => {
      const result = plan([plant()]);
      expect(codes(result.errors)).toEqual(["power_publication_needs_compute_link"]);
      expect(result.errors[0]?.message).toContain("because of what it powers");
    });

    it("refuses one whose supply edge carries no document", () => {
      const result = plan([plant(), load], [{ fromResearchKey: "fixture-plant", toResearchKey: "fixture-load", type: "supplies_power_to" }]);
      expect(codes(result.errors)).toContain("power_publication_needs_compute_link");
      expect(codes(result.reviewCandidates)).toContain("relationship_without_evidence");
    });

    it("refuses one that only supplies another power asset", () => {
      const other = facility({ researchKey: "fixture-other-plant", category: "power_infrastructure", requestedPublicationState: "research" });
      const result = plan(
        [plant(), other],
        [{ fromResearchKey: "fixture-plant", toResearchKey: "fixture-other-plant", type: "supplies_power_to", evidenceUrl: "https://example.invalid/plant" }],
      );
      expect(codes(result.errors)).toContain("power_publication_needs_compute_link");
    });

    it("accepts one with an evidenced supply edge into a data center, even an unpublished one", () => {
      const result = plan(
        [plant(), load],
        [{ fromResearchKey: "fixture-plant", toResearchKey: "fixture-load", type: "supplies_power_to", evidenceUrl: "https://example.invalid/plant" }],
      );
      expect(result.errors).toEqual([]);
    });

    it("does not apply the rule to a power record that is not asking to publish", () => {
      expect(plan([plant({ requestedPublicationState: "research", quality: { confidence: "high" } })]).errors).toEqual([]);
    });
  });

  describe("relationships", () => {
    const other = facility({ researchKey: "fixture-other", canonicalName: "Fixture Other" });

    it("rejects an edge whose target is neither in the batch nor in the database", () => {
      const result = plan([facility()], [{ fromResearchKey: "fixture-campus", toResearchKey: "nowhere", type: "hosted_by" }]);
      expect(codes(result.errors)).toEqual(["relationship_target_missing"]);
    });

    it("accepts an edge into a facility the database already holds", () => {
      const result = plan([facility()], [{ fromResearchKey: "fixture-campus", toResearchKey: "earlier-batch", type: "hosted_by" }], ["earlier-batch"]);
      expect(result.errors).toEqual([]);
      expect(result.relationships[0]?.targetIsExisting).toBe(true);
    });

    it("rejects an edge citing a document that is not evidence on its source facility", () => {
      const result = plan(
        [facility(), other],
        [{ fromResearchKey: "fixture-campus", toResearchKey: "fixture-other", type: "hosted_by", evidenceUrl: "https://example.invalid/elsewhere" }],
      );
      expect(codes(result.errors)).toEqual(["relationship_evidence_missing"]);
    });

    it("rejects the same edge stated twice, and a symmetric one stated in both directions", () => {
      const twice = plan(
        [facility(), other],
        [
          { fromResearchKey: "fixture-campus", toResearchKey: "fixture-other", type: "hosted_by" },
          { fromResearchKey: "fixture-campus", toResearchKey: "fixture-other", type: "hosted_by" },
        ],
      );
      expect(codes(twice.errors)).toEqual(["duplicate_relationship"]);

      const both = plan(
        [facility(), other],
        [
          { fromResearchKey: "fixture-campus", toResearchKey: "fixture-other", type: "same_program" },
          { fromResearchKey: "fixture-other", toResearchKey: "fixture-campus", type: "same_program" },
        ],
      );
      expect(codes(both.errors)).toEqual(["duplicate_relationship"]);
    });

    it("keeps both directions of an asymmetric type, which describe different things", () => {
      const result = plan(
        [facility(), other],
        [
          { fromResearchKey: "fixture-campus", toResearchKey: "fixture-other", type: "hosted_by" },
          { fromResearchKey: "fixture-other", toResearchKey: "fixture-campus", type: "hosted_by" },
        ],
      );
      expect(result.errors).toEqual([]);
      expect(result.counts.relationships).toBe(2);
    });
  });

  describe("review candidates, which never change what is written", () => {
    it("remarks on two facilities at one position and keeps both", () => {
      const host = facility({ researchKey: "fixture-host", canonicalName: "Fixture Host Campus" });
      const cluster = facility({ researchKey: "fixture-cluster", canonicalName: "Fixture Cluster", category: "gpu_compute_cluster" });
      const result = plan([host, cluster]);
      expect(result.errors).toEqual([]);
      expect(result.counts.facilities).toBe(2);
      const shared = result.reviewCandidates.filter((entry) => entry.code === "shared_coordinates");
      expect(shared).toHaveLength(1);
      expect(shared[0]?.message).toContain("are not merged");
    });

    it("remarks on similar names and on an alias that names another facility, and keeps both", () => {
      const a = facility({ researchKey: "fixture-alpha", canonicalName: "Aurora Ridge Data Center", aliases: [{ alias: "Project Aurora" }] });
      const b = facility({
        researchKey: "fixture-beta",
        canonicalName: "Aurora Ridge Data Centre",
        aliases: [{ alias: "Project Aurora" }],
        location: { ...facility().location, latitude: 10, longitude: 10 },
      });
      const result = plan([a, b]);
      expect(result.errors).toEqual([]);
      expect(result.counts.facilities).toBe(2);
      expect(codes(result.reviewCandidates)).toContain("similar_name");
      expect(codes(result.reviewCandidates)).toContain("alias_collision");
    });

    it("carries every unresolved research note through", () => {
      const result = plan([facility({ quality: { confidence: "high", lastVerifiedDate: "2026-09-17", reviewNotes: ["Street vs building.", "MW unknown."] } })]);
      expect(result.reviewCandidates.filter((entry) => entry.code === "unresolved_research_note").map((entry) => entry.message)).toEqual([
        "Street vs building.",
        "MW unknown.",
      ]);
    });

    it("flags a city-precision record, missing capacity facts, unverified evidence and a stale verification", () => {
      const city = plan([
        facility({
          requestedPublicationState: "research",
          location: { countryCode: "FI", latitude: 64.2, longitude: 27.7, coordinatePrecision: "city", coordinateMethod: "city_centroid" },
        }),
      ]);
      expect(codes(city.reviewCandidates)).toContain("city_level_coordinates");
      expect(codes(plan([facility()]).reviewCandidates)).toContain("no_capacity_facts");
      expect(codes(plan([facility()]).reviewCandidates)).toContain("no_human_verified_evidence");

      const stale = plan([facility({ quality: { confidence: "high", lastVerifiedDate: "2024-01-01" } })]);
      const flagged = stale.reviewCandidates.find((entry) => entry.code === "verification_stale");
      expect(flagged?.message).toContain("the public map will not show it");
    });
  });

  describe("the batch digest", () => {
    it("is stable across key order and identical re-reads", () => {
      const a = plan([facility()]).digest;
      const { researchKey, canonicalName, ...rest } = facility();
      // The same record with its keys written in another order.
      const reordered = plan([{ ...rest, canonicalName, researchKey }]).digest;
      expect(reordered).toBe(a);
      expect(plan([facility()]).digest).toBe(a);
    });

    it("changes when any written value changes", () => {
      const a = plan([facility()]).digest;
      expect(plan([facility({ canonicalName: "Fixture Campus 2" })]).digest).not.toBe(a);
      expect(plan([facility({ requestedPublicationState: "research" })]).digest).not.toBe(a);
    });
  });
});

describe("nameSimilarity", () => {
  it("scores identity-bearing tokens and ignores generic ones", () => {
    expect(nameSimilarity("Aurora Ridge Data Center", "Aurora Ridge Data Centre")).toBe(1);
    expect(nameSimilarity("CSC Kajaani Data Center", "Fixture Campus")).toBe(0);
  });

  it("keeps the dataset's real landlord/tenant and campus/cluster pairs well below the review threshold", () => {
    // These are the pairs a fuzzy matcher would be tempted by. Scoring them low
    // is not an accident of the metric; it is the behaviour being asserted.
    expect(nameSimilarity("Applied Digital Polaris Forge 1", "CoreWeave Polaris Forge 1 GPU Deployment")).toBeLessThan(0.7);
    expect(nameSimilarity("IREN Childress Campus", "IREN Horizon 1")).toBeLessThan(0.7);
    expect(nameSimilarity("Meta New Albany Data Center", "Meta Prometheus")).toBeLessThan(0.7);
  });
});
