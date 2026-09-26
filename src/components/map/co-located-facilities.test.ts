import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildCoordinateFacilityIndex, buildFacilityGroupCard } from "@/components/map/point-popup";
import { parseFacilityImportDocument } from "@/lib/facilities/contract";
import { isMapEligible } from "@/lib/facilities/domain";
import { buildMapFeatureCollection } from "@/lib/map-geojson";
import type { UrdaisMapPoint } from "@/types/map";

const raw: unknown = JSON.parse(readFileSync(resolve(process.cwd(), "data/map/facilities.v1.json"), "utf8"));
const { document, issues } = parseFacilityImportDocument(raw);

const points: UrdaisMapPoint[] = (document?.facilities ?? [])
  .filter(
    (facility) =>
      (facility.requestedPublicationState === "published" || facility.requestedPublicationState === "research") &&
      isMapEligible({
        latitude: facility.location.latitude ?? null,
        longitude: facility.location.longitude ?? null,
        coordinatePrecision: facility.location.coordinatePrecision ?? null,
      }),
  )
  .map((facility) => ({
    id: facility.researchKey,
    name: facility.canonicalName,
    category: facility.category,
    latitude: facility.location.latitude!,
    longitude: facility.location.longitude!,
    ...(facility.location.streetAddress ? { address: facility.location.streetAddress } : {}),
    ...(facility.ownerName ? { ownerName: facility.ownerName } : {}),
    ...(facility.operatorName ? { operatorName: facility.operatorName } : {}),
  }));

describe("production-shaped co-located facilities", () => {
  it("keeps all 44 exact-coordinate groups and makes every one of their 111 research keys addressable", () => {
    expect(issues).toEqual([]);
    expect(points).toHaveLength(446);
    const groups = [...buildCoordinateFacilityIndex(buildMapFeatureCollection(points)).values()].filter((group) => group.length > 1);
    expect(groups).toHaveLength(44);
    expect(groups.reduce((total, group) => total + group.length, 0)).toBe(111);
    expect(Math.max(...groups.map((group) => group.length))).toBe(6);
    for (const group of groups) {
      expect(new Set(group.map((member) => member.researchKey)).size).toBe(group.length);
      expect(group.every((member) => member.feature.id === member.researchKey)).toBe(true);
      const reached: string[] = [];
      const card = buildFacilityGroupCard(group, (member) => reached.push(member.researchKey));
      card.querySelectorAll<HTMLButtonElement>("[data-research-key]").forEach((button) => button.click());
      expect(reached).toEqual(group.map((member) => member.researchKey));
    }

    const mixedOperatorGroups = groups.filter(
      (group) =>
        new Set(group.map((member) => member.feature.properties.operatorName ?? member.feature.properties.ownerName)).size > 1,
    );
    expect(mixedOperatorGroups).toHaveLength(2);
  });

  it("finds both canonical Lagos records and the six-member Hortolandia group", () => {
    const groups = [...buildCoordinateFacilityIndex(buildMapFeatureCollection(points)).values()];
    const lagos = groups.find((group) => group.some((member) => member.researchKey === "digital-realty-los1"));
    expect(lagos?.map((member) => member.researchKey)).toEqual(["digital-realty-los1", "digital-realty-los2"]);
    const hortolandia = groups.find((group) => group.some((member) => member.researchKey === "digital-realty-htl01"));
    expect(hortolandia?.map((member) => member.researchKey)).toEqual([
      "digital-realty-htl01",
      "digital-realty-htl02",
      "digital-realty-htl03",
      "digital-realty-htl04",
      "digital-realty-htl05",
      "digital-realty-htl06",
    ]);
  });
});
