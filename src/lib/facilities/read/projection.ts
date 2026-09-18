/**
 * The projection from the public facility read model to the map's point type.
 *
 * It is deliberately lossless in one direction only: everything the popup shows
 * comes from here, and nothing the map does not show crosses. Coverage counts,
 * the staleness horizon and the unavailable reason stay on the read model,
 * because they describe the dataset rather than any dot.
 */

import type { FacilityMapReadModel, PublicFacility } from "@/lib/facilities/read/read-model";
import type { UrdaisMapPoint } from "@/types/map";

export function facilityToMapPoint(facility: PublicFacility): UrdaisMapPoint {
  const point: UrdaisMapPoint = {
    id: facility.id,
    name: facility.name,
    category: facility.category,
    latitude: facility.latitude,
    longitude: facility.longitude,
  };
  point.verificationStatus = facility.verificationStatus;
  if (facility.address !== null) point.address = facility.address;
  if (facility.ownerName !== null) point.ownerName = facility.ownerName;
  if (facility.operatorName !== null) point.operatorName = facility.operatorName;
  if (facility.lifecycleStatus !== null) point.lifecycleStatus = facility.lifecycleStatus;
  point.lastVerifiedDate = facility.lastVerifiedDate;
  if (facility.sources.length > 0) {
    point.sources = facility.sources.map((source) => ({ publisher: source.publisher, url: source.url }));
  }
  return point;
}

export function facilityMapPoints(model: FacilityMapReadModel): readonly UrdaisMapPoint[] {
  return model.facilities.map(facilityToMapPoint);
}
