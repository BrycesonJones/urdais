/**
 * The complete projected dataset, checked as a dataset.
 *
 * Phase 2 proved the architecture on eighteen curated records. This file checks
 * the expanded canonical dataset: that the projection carried the research faithfully, that
 * every record asking to publish actually qualifies, and — the part worth the
 * most — that the records held back are held back for a reason a person can
 * read, rather than having quietly fallen through.
 *
 * The rejection and rights registers are checked here too, because both exist
 * to make a decision survive: a candidate rejected once must not reappear
 * unnoticed, and a source whose use raises a question must keep raising it.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { COMPUTE_CATEGORIES, FACILITY_CATEGORIES, MAP_ELIGIBLE_PRECISIONS, citationClassOf, isMapEligible } from "@/lib/facilities/domain";
import { buildImportPlan } from "@/lib/facilities/import/plan";

const read = (path: string) => JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));

const raw = read("data/map/facilities.v1.json");
const curated = read("data/map/facilities-sample.v1.json");
const rejected = read("data/map/rejected-candidates.v1.json");
const rights = read("data/map/source-rights-register.v1.json");

const { document, issues } = parseFacilityImportDocument(raw);
const plan = buildImportPlan(document!, {
  today: new Date("2026-09-17T00:00:00Z"),
  rejectedCandidates: rejected.candidates,
  rightsRegister: rights.sources,
});
const byKey = new Map(document!.facilities.map((facility) => [facility.researchKey, facility]));

describe("the complete projected dataset", () => {
  it("is a valid document of the contract version this build reads", () => {
    expect(issues).toEqual([]);
    expect(document).not.toBeNull();
    expect(document!.researchDocument).toBe("docs/operations/map-phase-4b-ready-facilities.md");
  });

  it("carries the Phase 4B set plus the QA-approved Digital Realty facilities", () => {
    expect(plan.counts.facilities).toBe(322);
    expect(plan.counts.byCategory).toEqual({
      data_center: 279,
      gpu_compute_cluster: 18,
      semiconductor_fab: 20,
      power_infrastructure: 5,
    });
  });

  it("keeps every Phase 2 identity and non-location fact while allowing sourced location enrichment", () => {
    const { document: curatedDocument } = parseFacilityImportDocument(curated);
    expect(curatedDocument).not.toBeNull();
    expect(curatedDocument!.facilities).toHaveLength(18);
    for (const original of curatedDocument!.facilities) {
      const current = byKey.get(original.researchKey)!;
      expect(current, original.researchKey).toBeDefined();
      expect({
        canonicalName: current.canonicalName,
        category: current.category,
        ownerName: current.ownerName,
        operatorName: current.operatorName,
        aliases: current.aliases,
        lifecycle: current.lifecycle,
        facts: current.facts,
        confidence: current.quality.confidence,
        requestedPublicationState: current.requestedPublicationState,
      }).toEqual({
        canonicalName: original.canonicalName,
        category: original.category,
        ownerName: original.ownerName,
        operatorName: original.operatorName,
        aliases: original.aliases,
        lifecycle: original.lifecycle,
        facts: original.facts,
        confidence: original.quality.confidence,
        requestedPublicationState: original.requestedPublicationState,
      });
      expect(current.quality.reviewNotes ?? []).toEqual(expect.arrayContaining([...(original.quality.reviewNotes ?? [])]));
      expect(current.evidence.map((evidence) => evidence.url)).toEqual(expect.arrayContaining(original.evidence.map((evidence) => evidence.url)));
    }
    for (const relationship of curatedDocument!.relationships) {
      expect(document!.relationships).toContainEqual(relationship);
    }
  });

  it("plans with no errors", () => {
    expect(plan.errors).toEqual([]);
  });

  it("imports none of the rejected candidates", () => {
    expect(rejected.candidates.length).toBe(38);
    // A rejected candidate that reappeared would be remarked on, never silently
    // admitted. Nothing in this dataset trips that remark.
    expect(plan.reviewCandidates.filter((entry) => entry.code === "previously_rejected")).toEqual([]);
    for (const candidate of rejected.candidates) {
      expect(candidate.reason, candidate.candidate).not.toBe("");
    }
  });

  describe("every record that asks to publish qualifies", () => {
    const published = document!.facilities.filter((facility) => facility.requestedPublicationState === "published");

    it("has a position better than a city centroid", () => {
      for (const facility of published) {
        expect(
          isMapEligible({
            latitude: facility.location.latitude ?? null,
            longitude: facility.location.longitude ?? null,
            coordinatePrecision: facility.location.coordinatePrecision ?? null,
          }),
          facility.researchKey,
        ).toBe(true);
        expect(MAP_ELIGIBLE_PRECISIONS).toContain(facility.location.coordinatePrecision);
      }
    });

    it("cites a document that placed it", () => {
      for (const facility of published) {
        const placed = facility.evidence.some((evidence) =>
          evidence.claims.some((claim) => claim.field === "location" || claim.field === "coordinates"),
        );
        expect(placed, facility.researchKey).toBe(true);
      }
    });

    it("carries a verification date and a confidence that permits publication", () => {
      for (const facility of published) {
        expect(facility.quality.lastVerifiedDate, facility.researchKey).toBe("2026-09-17");
        expect(["high", "medium"], facility.researchKey).toContain(facility.quality.confidence);
      }
    });

    it("is not a cancelled or retired project", () => {
      for (const facility of published) {
        expect(["cancelled", "retired"], facility.researchKey).not.toContain(facility.lifecycle?.status);
      }
    });

    it("is, where it is power infrastructure, backed by an evidenced supply edge into compute", () => {
      const power = published.filter((facility) => facility.category === "power_infrastructure");
      expect(power.length).toBeGreaterThan(0);
      for (const facility of power) {
        const qualifying = document!.relationships.filter(
          (edge) =>
            edge.fromResearchKey === facility.researchKey &&
            edge.type === "supplies_power_to" &&
            edge.evidenceUrl &&
            COMPUTE_CATEGORIES.includes(byKey.get(edge.toResearchKey)!.category),
        );
        expect(qualifying.length, facility.researchKey).toBeGreaterThan(0);
      }
    });
  });

  describe("every record held back is held back for a stated reason", () => {
    it("holds the records the research itself would not map", () => {
      const held = document!.facilities.filter((facility) => facility.requestedPublicationState === "review_required");
      expect(held).toHaveLength(20);
      expect(held.map((facility) => facility.researchKey)).toEqual(expect.arrayContaining([
        "crane-clean-energy-center",
        "kairos-hermes-2-oak-ridge",
        "lambda-dfw-04",
        "micron-hiroshima",
        "openai-stargate-abilene",
        "riken-fugaku",
        "tsmc-jasm-kumamoto",
        "vantage-santa-clara-i",
      ]));
      for (const facility of held) {
        expect(facility.quality.reviewNotes?.length, facility.researchKey).toBeGreaterThan(0);
      }
    });

    it("holds Fugaku rather than admitting a CPU machine to the GPU category", () => {
      const fugaku = byKey.get("riken-fugaku")!;
      expect(fugaku.requestedPublicationState).toBe("review_required");
      expect((fugaku.quality.reviewNotes ?? []).join(" ")).toMatch(/taxonomy|architecture|A64FX/i);
    });

    it("holds the two power records whose offtaker this dataset does not hold", () => {
      // Crane's PPA matches Microsoft's load across PJM, and Hermes 2's matches
      // Google's across two states. Neither names a facility here, so neither
      // may publish — and neither gets a fabricated target to point at.
      for (const key of ["crane-clean-energy-center", "kairos-hermes-2-oak-ridge"]) {
        const facility = byKey.get(key)!;
        expect(facility.requestedPublicationState).toBe("review_required");
        expect(document!.relationships.some((edge) => edge.fromResearchKey === key)).toBe(false);
      }
    });

    it("keeps research records public only when they have a safe position", () => {
      const research = document!.facilities.filter((facility) => facility.requestedPublicationState === "research");
      expect(research.length).toBe(273);
      let placeable = 0;
      for (const facility of research) {
        expect(facility.evidence.length, facility.researchKey).toBeGreaterThan(0);
        const eligible = isMapEligible({
          latitude: facility.location.latitude ?? null,
          longitude: facility.location.longitude ?? null,
          coordinatePrecision: facility.location.coordinatePrecision ?? null,
        });
        if (eligible) placeable += 1;
      }
      expect(placeable).toBe(242);
    });
  });

  describe("provenance", () => {
    it("cites every source the research cites, and classifies each one", () => {
      expect(plan.counts.evidence).toBe(551);
      expect(plan.counts.claims).toBe(1416);
      expect(plan.counts.sourceUrls).toBe(369);
      const classified = Object.values(plan.counts.byCitationClass).reduce((a, b) => a + b, 0);
      expect(classified).toBe(plan.counts.evidence);
      for (const facility of document!.facilities) {
        for (const evidence of facility.evidence) {
          expect(citationClassOf(evidence.documentType), evidence.url).not.toBe(undefined);
        }
      }
    });

    it("attaches no fact to a source that does not carry it", () => {
      for (const facility of document!.facilities) {
        for (const fact of facility.facts ?? []) {
          expect(
            facility.evidence.some((evidence) => evidence.url === fact.evidenceUrl),
            `${facility.researchKey}/${fact.key}`,
          ).toBe(true);
        }
      }
    });

    it("keeps the sources whose use raises a question flagged", () => {
      expect(rights.sources.length).toBeGreaterThan(0);
      const flagged = plan.reviewCandidates.filter((entry) => entry.code === "source_rights_review");
      expect(flagged.length).toBe(plan.counts.rightsReviewFlagged);
      expect(flagged.length).toBeGreaterThan(0);
      // The policy is that ordinary primary and government citation is clear;
      // the register must not have quietly swept those in.
      for (const source of rights.sources) {
        expect(["verify_access", "prefer_primary", "review_required"]).toContain(source.state);
      }
      expect(rights.sources.every((source: { note: string }) => source.note.length > 0)).toBe(true);
    });
  });

  describe("entity resolution", () => {
    it("never merges two records, however alike", () => {
      const keys = document!.facilities.map((facility) => facility.researchKey);
      expect(new Set(keys).size).toBe(keys.length);
      // Co-located infrastructure remains one row per physical entity. The
      // Digital Realty tranche adds intentionally shared campus/street points.
      const shared = plan.reviewCandidates.filter((entry) => entry.code === "shared_coordinates");
      expect(shared.length).toBe(79);
      for (const entry of shared) expect(entry.message).toContain("not merged");
    });

    it("reports near-but-not-identical positions as a review candidate, not a merge", () => {
      const near = plan.reviewCandidates.filter((entry) => entry.code === "near_coordinates");
      // Dense IBX and numbered-campus markets legitimately produce nearby
      // records. They are surfaced for review and never merged automatically.
      for (const entry of near) expect(entry.message).toContain("not merged on that");
      expect(near.length).toBe(307);
    });

    it("carries the research's own duplicate questions into the review queue", () => {
      const notes = plan.reviewCandidates.filter((entry) => entry.code === "unresolved_research_note");
      expect(notes.length).toBeGreaterThan(100);
      const louisiana = notes.filter((entry) => entry.researchKey === "meta-richland-parish" || entry.researchKey === "meta-hyperion");
      expect(louisiana.length).toBeGreaterThan(0);
    });
  });

  it("records the methodology document the approved version was hashed from", () => {
    // An approved methodology version is never edited in place, so its content
    // hash is the thing that catches an edit that should have been a new
    // version. A drifting hash means the rules changed under a version that
    // says they did not.
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260918090000_map_public_research.sql"), "utf8");
    const declared = /'([0-9a-f]{64})'/.exec(migration)?.[1];
    const actual = createHash("sha256").update(readFileSync(resolve(process.cwd(), "docs/methodology/map-facilities.md"))).digest("hex");
    expect(declared, "the 2.1.0 migration declares no content hash").toBeDefined();
    expect(actual).toBe(declared);
  });

  it("leaves 1.0.0's own hash alone, so the rules the first dots were approved under stay identifiable", () => {
    const original = readFileSync(resolve(process.cwd(), "supabase/migrations/20260917270000_map_facility_methodology.sql"), "utf8");
    const declared = /'([0-9a-f]{64})'/.exec(original)?.[1];
    expect(declared).toBe("a3d2bacaf54a7089941828f959c3fa8866257483cf598ad9fde3a06f1ff6f4b4");
    // And 2.0.0 hashes something else, which is what makes it a different version.
    const current = createHash("sha256").update(readFileSync(resolve(process.cwd(), "docs/methodology/map-facilities.md"))).digest("hex");
    expect(current).not.toBe(declared);
  });

  it("holds every category to the four public ones", () => {
    for (const facility of document!.facilities) {
      expect(FACILITY_CATEGORIES, facility.researchKey).toContain(facility.category);
    }
    expect(JSON.stringify(document).includes('"compute_cluster"')).toBe(false);
  });
});
