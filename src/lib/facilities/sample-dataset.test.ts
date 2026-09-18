/**
 * The shipped sample dataset, checked as a dataset.
 *
 * This is the phase's acceptance gate in test form. The sample is small on
 * purpose — eighteen of the research package's seventy-eight facilities — and
 * its job is to exercise every part of the architecture at least once: all four
 * categories, several sources on one facility, a data center with a GPU cluster
 * inside it, a power station with the compute link that makes it publishable,
 * aliases, three coordinate precisions, several lifecycle states, and records
 * that are legitimately stored and legitimately not shown.
 *
 * It also guards two decisions that must survive: Fugaku is not a GPU compute
 * cluster, and nothing in this file grows toward the full seventy-eight.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FACILITY_IMPORT_CONTRACT_VERSION,
  SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS,
  parseFacilityImportDocument,
} from "@/lib/facilities/contract";
import { FACILITY_CATEGORIES, MAP_ELIGIBLE_PRECISIONS } from "@/lib/facilities/domain";
import { buildImportPlan } from "@/lib/facilities/import/plan";
import { buildMapFeatureCollection } from "@/lib/map-geojson";
import { DEFAULT_MAP_VISIBILITY, filterPointCollection } from "@/components/map/map-point-style";
import { facilityToMapPoint } from "@/lib/facilities/read/projection";
import type { PublicFacility } from "@/lib/facilities/read/read-model";

const SAMPLE_PATH = resolve(process.cwd(), "data/map/facilities-sample.v1.json");
const raw: unknown = JSON.parse(readFileSync(SAMPLE_PATH, "utf8"));

const { document, issues } = parseFacilityImportDocument(raw);
const plan = document ? buildImportPlan(document, { today: new Date("2026-09-17T00:00:00Z") }) : null;

describe("the sample dataset", () => {
  it("is a document of a contract version this build reads, and was not rewritten to the newer one", () => {
    expect(issues).toEqual([]);
    expect(document).not.toBeNull();
    // It still declares /1, and that is the point: a methodology change does not
    // reach back and edit datasets already on file.
    expect(document?.contractVersion).toBe("urdais.map.facility-import/1");
    expect(SUPPORTED_FACILITY_IMPORT_CONTRACT_VERSIONS).toContain(document?.contractVersion);
    expect(FACILITY_IMPORT_CONTRACT_VERSION).toBe("urdais.map.facility-import/2");
    expect(document?.researchDocument).toBe("URDAIS_MAP_RESEARCH_PHASE_1.md");
  });

  it("plans with no errors", () => {
    expect(plan?.errors).toEqual([]);
  });

  it("stays a sample: well short of the research package's seventy-eight facilities", () => {
    expect(plan?.counts.facilities).toBeGreaterThanOrEqual(10);
    expect(plan?.counts.facilities).toBeLessThanOrEqual(20);
  });

  it("covers all four public categories", () => {
    for (const category of FACILITY_CATEGORIES) {
      expect(plan?.counts.byCategory[category], category).toBeGreaterThan(0);
    }
  });

  it("carries several sources on at least one facility, each with its own claims", () => {
    const multiple = document!.facilities.filter((facility) => facility.evidence.length > 1);
    expect(multiple.length).toBeGreaterThan(0);
    for (const facility of document!.facilities) {
      for (const evidence of facility.evidence) expect(evidence.claims.length, `${facility.researchKey} / ${evidence.url}`).toBeGreaterThan(0);
    }
    // Different documents on one facility support different things: that is the
    // reason claims are per source rather than per record.
    const applied = document!.facilities.find((facility) => facility.researchKey === "applied-digital-polaris-forge-1")!;
    const permit = applied.evidence.find((evidence) => evidence.documentType === "permit")!;
    expect(permit.claims.map((claim) => claim.field)).not.toContain("capacity");
  });

  it("includes a data center with a GPU compute cluster hosted inside it, at the same position", () => {
    const hosted = document!.relationships.find((relationship) => relationship.type === "hosted_by")!;
    expect(hosted).toBeDefined();
    const cluster = document!.facilities.find((facility) => facility.researchKey === hosted.fromResearchKey)!;
    const host = document!.facilities.find((facility) => facility.researchKey === hosted.toResearchKey)!;
    expect(cluster.category).toBe("gpu_compute_cluster");
    expect(host.category).toBe("data_center");
    expect(cluster.location.latitude).toBe(host.location.latitude);
    expect(cluster.location.longitude).toBe(host.location.longitude);
    // And both survive: shared coordinates never merge two entities.
    expect(plan?.errors.filter((error) => error.researchKey === cluster.researchKey)).toEqual([]);
    expect(plan?.reviewCandidates.some((entry) => entry.code === "shared_coordinates")).toBe(true);
  });

  it("includes an evidenced power-to-compute relationship, and a power record that has none published", () => {
    const supply = document!.relationships.filter((relationship) => relationship.type === "supplies_power_to");
    expect(supply.length).toBeGreaterThan(0);
    for (const edge of supply) expect(edge.evidenceUrl, `${edge.fromResearchKey} -> ${edge.toResearchKey}`).toBeTruthy();

    const power = document!.facilities.filter((facility) => facility.category === "power_infrastructure");
    const published = power.filter((facility) => facility.requestedPublicationState === "published");
    expect(published.length).toBeGreaterThan(0);
    for (const facility of published) {
      expect(
        supply.some((edge) => edge.fromResearchKey === facility.researchKey),
        `${facility.researchKey} publishes without a supply edge`,
      ).toBe(true);
    }
  });

  it("carries aliases, including a source-native identifier", () => {
    expect(plan!.counts.aliases).toBeGreaterThan(0);
    const identifiers = document!.facilities.flatMap((facility) => (facility.aliases ?? []).filter((alias) => alias.kind === "source_identifier"));
    expect(identifiers.length).toBeGreaterThan(0);
    expect(identifiers[0]?.authority).toBeTruthy();
  });

  it("spans several coordinate precisions and several lifecycle states", () => {
    const precisions = new Set(document!.facilities.map((facility) => facility.location.coordinatePrecision).filter(Boolean));
    expect(precisions.size).toBeGreaterThanOrEqual(3);
    for (const precision of precisions) expect(MAP_ELIGIBLE_PRECISIONS).toContain(precision);

    const statuses = new Set(document!.facilities.map((facility) => facility.lifecycle?.status).filter(Boolean));
    expect(statuses).toContain("operational");
    expect(statuses.has("under_construction") || statuses.has("planned")).toBe(true);
    expect(statuses.size).toBeGreaterThanOrEqual(3);
  });

  it("includes records that persist and are deliberately not published", () => {
    const research = document!.facilities.filter((facility) => facility.requestedPublicationState !== "published");
    expect(research.length).toBeGreaterThan(0);
    for (const facility of research) {
      // Every one of them is unpublished for a stated reason, not by oversight:
      // in this sample, because no source gives it a position.
      expect(facility.location.latitude ?? null, facility.researchKey).toBeNull();
      expect(facility.evidence.length, facility.researchKey).toBeGreaterThan(0);
    }
    expect(plan!.counts.facilities - plan!.counts.published).toBe(research.length);
  });

  it("never attaches a fact to a source that is not on its facility", () => {
    for (const facility of document!.facilities) {
      for (const fact of facility.facts ?? []) {
        expect(facility.evidence.some((evidence) => evidence.url === fact.evidenceUrl), `${facility.researchKey}/${fact.key}`).toBe(true);
      }
    }
  });

  it("excludes Fugaku, which the research itself flags as a CPU machine in the wrong category", () => {
    const keys = document!.facilities.map((facility) => facility.researchKey);
    expect(keys).not.toContain("riken-fugaku");
    expect(JSON.stringify(raw).toLowerCase()).not.toContain("fugaku");
  });

  it("carries no demo identifier from the retired mock data", () => {
    for (const facility of document!.facilities) expect(facility.researchKey).not.toMatch(/^demo-/);
  });
});

describe("the sample dataset on the map", () => {
  /** What the read path would return for the publishable half of the sample. */
  const published: PublicFacility[] = document!.facilities
    .filter((facility) => facility.requestedPublicationState === "published")
    .map((facility) => ({
      id: facility.researchKey,
      name: facility.canonicalName,
      category: facility.category,
      latitude: facility.location.latitude!,
      longitude: facility.location.longitude!,
      coordinatePrecision: facility.location.coordinatePrecision as "building" | "campus" | "street",
      address: facility.location.locality ?? null,
      ownerName: facility.ownerName ?? null,
      operatorName: facility.operatorName ?? null,
      lifecycleStatus: facility.lifecycle?.status ?? null,
      lastVerifiedDate: facility.quality.lastVerifiedDate!,
      sources: facility.evidence.map((evidence) => ({ publisher: evidence.publisher, title: evidence.title, url: evidence.url })),
    }));

  it("projects into map points the existing converter accepts", () => {
    const collection = buildMapFeatureCollection(published.map(facilityToMapPoint));
    expect(collection.features).toHaveLength(published.length);
    expect(collection.features.every((feature) => feature.geometry.type === "Point")).toBe(true);
  });

  it("still filters by category through the legend's own machinery", () => {
    const collection = buildMapFeatureCollection(published.map(facilityToMapPoint));
    const withoutPower = filterPointCollection(collection, { ...DEFAULT_MAP_VISIBILITY, power_infrastructure: false });
    expect(withoutPower.features.length).toBeLessThan(collection.features.length);
    expect(withoutPower.features.some((feature) => feature.properties.category === "power_infrastructure")).toBe(false);

    const none = filterPointCollection(collection, { data_center: false, gpu_compute_cluster: false, power_infrastructure: false, semiconductor_fab: false });
    expect(none.features).toEqual([]);
  });

  it("keeps the host and cluster pairs as separate dots at identical coordinates", () => {
    const collection = buildMapFeatureCollection(published.map(facilityToMapPoint));
    const kajaani = collection.features.filter(
      (feature) => feature.geometry.coordinates[0] === 27.691477 && feature.geometry.coordinates[1] === 64.2319866,
    );
    expect(kajaani.map((feature) => feature.id).sort()).toEqual(["csc-kajaani-lumi-host", "lumi-supercomputer"]);
  });
});
