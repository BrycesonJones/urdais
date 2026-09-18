/**
 * Reading and projecting the research package.
 *
 * The parser's job is to return the research's own strings; the projector's is
 * to turn them into the contract under rules that are written down. The
 * fixtures below check both against the real package, because the failure mode
 * that matters here is not a crash — it is a projection that quietly says more
 * than the research does, and that renders as a perfectly ordinary dataset.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseResearchPackage, type ResearchFacility } from "./research-parser";
import { classifyClaim, normalizeDate } from "./project-research";

const markdown = readFileSync("URDAIS_MAP_RESEARCH_PHASE_1.md", "utf8");
const pkg = parseResearchPackage(markdown);
const byKey = new Map(pkg.facilities.map((facility) => [facility.researchKey, facility]));

describe("parseResearchPackage", () => {
  it("reads every facility the package says it contains, in its own proportions", () => {
    // The package's own header: 78 facilities, 35 / 18 / 20 / 5.
    expect(pkg.facilities).toHaveLength(78);
    const byCategory = pkg.facilities.reduce<Record<string, number>>((counts, facility) => {
      counts[facility.category] = (counts[facility.category] ?? 0) + 1;
      return counts;
    }, {});
    expect(byCategory).toEqual({ data_center: 35, gpu_compute_cluster: 18, semiconductor_fab: 20, power_infrastructure: 5 });
  });

  it("reads the relationship table, the hold list and the rejection list", () => {
    expect(pkg.relationships.length).toBeGreaterThan(0);
    expect(pkg.notMapIngestable.size).toBe(45);
    // The package's own header: 38 rejected candidates.
    expect(pkg.rejected).toHaveLength(38);
    for (const candidate of pkg.rejected) {
      expect(candidate.candidate).not.toBe("");
      expect(candidate.reason).not.toBe("");
    }
  });

  it("keeps every source's claims attached to that source and to no other", () => {
    const total = pkg.facilities.reduce((n, facility) => n + facility.sources.length, 0);
    expect(total).toBe(142);
    for (const facility of pkg.facilities) {
      expect(facility.sources.length, facility.researchKey).toBeGreaterThan(0);
      for (const source of facility.sources) {
        expect(source.url, facility.researchKey).toMatch(/^https?:\/\//);
        expect(source.sourceType, facility.researchKey).not.toBe("");
      }
    }
  });

  it("returns null for an unknown value rather than a placeholder", () => {
    const google = byKey.get("google-hamina")!;
    expect(google.latitude).toBeNull();
    expect(google.coordinatePrecision).toBeNull();
    const crane = byKey.get("crane-clean-energy-center")!;
    expect(crane.relatedFacilityIds).toEqual([]);
    expect(crane.relationshipNotes).toBeNull();
  });

  it("reads a record's fields exactly as the package writes them", () => {
    const iren = byKey.get("iren-horizon-1")!;
    expect(iren.canonicalName).toBe("IREN Horizon 1");
    expect(iren.category).toBe("gpu_compute_cluster");
    expect(iren.owner).toBe("IREN");
    expect(iren.latitude).toBeCloseTo(34.3807907, 6);
    expect(iren.coordinatePrecision).toBe("street");
    expect(iren.coordinateMethod).toBe("documented_address_geocode");
    expect(iren.lifecycleStatus).toBe("operational");
    expect(iren.operationalDate).toBe("2026-08-13");
    expect(iren.computeFacts.vendor).toBe("NVIDIA");
    expect(iren.confidence).toBe("high");
    expect(iren.researchIngestReady).toBe(true);
    expect(iren.sources.map((source) => source.sourceType)).toEqual(["sec_filing", "sec_filing"]);
  });
});

describe("classifyClaim", () => {
  const facility = (overrides: Partial<ResearchFacility>): ResearchFacility =>
    ({ location: "620 FM 1033, Childress, TX, United States", coordinateNotes: null, ...overrides }) as ResearchFacility;

  it("reads a claim naming the record's own place as positional", () => {
    const childress = facility({});
    expect(classifyClaim("Childress TX", childress)).toBe("location");
    expect(classifyClaim("620 FM 1033", childress)).toBe("coordinates");
  });

  it("does not read a capacity or hardware claim as positional", () => {
    const childress = facility({});
    // The failure this guards: a capacity claim read as a location claim would
    // let a facility publish on evidence that never placed it.
    expect(classifyClaim("750 MW", childress)).toBe("capacity");
    expect(classifyClaim("GB300 NVL72", childress)).toBe("compute_hardware");
    expect(classifyClaim("$9.7B agreement with Microsoft", childress)).toBe("compute_relationship");
  });

  it("falls to identity rather than guessing", () => {
    expect(classifyClaim("Fab 18A and Fab 18B", facility({ location: "Tainan, Taiwan" }))).toBe("identity");
  });

  it("classifies the real package without ever leaving a claim unassigned", () => {
    for (const research of pkg.facilities) {
      for (const source of research.sources) {
        for (const claim of source.claims) {
          expect(typeof classifyClaim(claim, research), `${research.researchKey}: ${claim}`).toBe("string");
        }
      }
    }
  });
});

describe("normalizeDate", () => {
  it("keeps a full date and widens a year or a month to the first of the period, saying so", () => {
    expect(normalizeDate("2026-08-13")).toEqual({ date: "2026-08-13", widened: false });
    expect(normalizeDate("2026-01")).toEqual({ date: "2026-01-01", widened: true });
    expect(normalizeDate("2017")).toEqual({ date: "2017-01-01", widened: true });
  });

  it("returns nothing for a date it cannot read, rather than inventing one", () => {
    expect(normalizeDate("summer 2025")).toEqual({ date: null, widened: false });
    expect(normalizeDate(null)).toEqual({ date: null, widened: false });
  });
});
