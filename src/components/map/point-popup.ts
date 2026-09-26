import type { GeoJSONSource, LngLat, LngLatLike, Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent, Popup as MapLibrePopup, PopupOptions } from "maplibre-gl";

import { MAP_POINT_CATEGORY_LABELS, isMapPointCategory } from "@/components/map/map-point-style";
import { CLUSTERS_LAYER_ID, CLUSTER_MAX_ZOOM, POINTS_LAYER_ID, POINTS_SOURCE_ID } from "@/components/map/point-layer";
import type { MapPointCollection, MapPointFeature } from "@/lib/map-geojson";

/** What the profile card shows. A point with no name does not qualify. */
export type MapPointProfile = {
  name: string;
  /** Human-readable category label, never the raw enum value. */
  category?: string;
  verification?: "Verified" | "Research";
  address?: string;
  owner?: string;
  operator?: string;
  /** Human-readable lifecycle wording, never the raw enum value. */
  status?: string;
  lastVerified?: string;
  /** The documents behind the record. Every public facility has at least one. */
  sources?: readonly { publisher: string; url: string }[];
};

/** Lifecycle statuses in the words a reader uses, not the words the schema uses. */
const STATUS_LABELS: Record<string, string> = {
  announced: "Announced",
  planned: "Planned",
  under_construction: "Under construction",
  operational: "Operational",
  expansion: "Operational, expanding",
  suspended: "Suspended",
  cancelled: "Cancelled",
  retired: "Retired",
};

/** Parses the citation list back out of the encoded property. Malformed input yields none, never a throw. */
export function readSources(value: unknown): readonly { publisher: string; url: string }[] {
  if (typeof value !== "string" || value === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (typeof entry !== "object" || entry === null) return null;
        const record = entry as Record<string, unknown>;
        const publisher = typeof record.publisher === "string" ? record.publisher.trim() : "";
        const url = typeof record.url === "string" ? record.url.trim() : "";
        // Only http(s) becomes a link: a javascript: or data: URL arriving in a
        // property must never become an anchor href.
        if (publisher === "" || !/^https?:\/\//.test(url)) return null;
        return { publisher, url };
      })
      .filter((entry): entry is { publisher: string; url: string } => entry !== null);
  } catch {
    return [];
  }
}

/** MapLibre's Popup class, handed in because the renderer is loaded lazily. */
export type PopupConstructor = new (options?: PopupOptions) => MapLibrePopup;

/** Handle on the wired interactions. */
export type PointInteractions = {
  /** Replaces the exact-coordinate index after points or category visibility change. */
  setCollection: (collection: MapPointCollection) => void;
  /** Removes the handlers and any open popup. */
  dispose: () => void;
};

export type FacilityAtCoordinate = {
  researchKey: string;
  feature: MapPointFeature;
  profile: MapPointProfile;
};

export type CoordinateFacilityIndex = ReadonlyMap<string, readonly FacilityAtCoordinate[]>;

const coordinateKey = (coordinates: readonly number[]): string | null => {
  if (coordinates.length < 2 || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return null;
  return `${coordinates[0]}\u0000${coordinates[1]}`;
};

const compareText = (left: string, right: string): number => (left === right ? 0 : left < right ? -1 : 1);

/**
 * Builds the selection model from the same visible collection MapLibre sees.
 * Coordinates are compared exactly: nearby points are never treated as one
 * location, and feature ids remain the canonical research keys. Sorting is an
 * application rule, never an accidental consequence of renderer z-order.
 */
export function buildCoordinateFacilityIndex(collection: MapPointCollection): CoordinateFacilityIndex {
  const groups = new Map<string, FacilityAtCoordinate[]>();
  for (const feature of collection.features) {
    const researchKey = typeof feature.id === "string" ? feature.id : "";
    const key = coordinateKey(feature.geometry.coordinates);
    const profile = readPointProfile(feature as Pick<MapGeoJSONFeature, "properties">);
    if (!researchKey || !key || !profile) continue;
    const group = groups.get(key) ?? [];
    if (!group.some((member) => member.researchKey === researchKey)) {
      group.push({ researchKey, feature, profile });
      groups.set(key, group);
    }
  }
  for (const group of groups.values()) {
    group.sort((left, right) => {
      const leftOperator = left.feature.properties.operatorName ?? left.feature.properties.ownerName ?? "";
      const rightOperator = right.feature.properties.operatorName ?? right.feature.properties.ownerName ?? "";
      return (
        compareText(leftOperator, rightOperator) ||
        compareText(left.profile.name, right.profile.name) ||
        compareText(left.researchKey, right.researchKey)
      );
    });
  }
  return groups;
}

export function facilitiesAtCoordinate(index: CoordinateFacilityIndex, coordinates: readonly number[]): readonly FacilityAtCoordinate[] {
  const key = coordinateKey(coordinates);
  return key ? (index.get(key) ?? []) : [];
}

/**
 * Reads a clicked feature's properties defensively. GeoJSON properties are
 * untyped at runtime and may arrive partial or malformed, so nothing here
 * assumes a shape: a missing or blank name, a malformed source list, or absent
 * optional fields all resolve without throwing. Returns null when there is
 * nothing to show.
 */
export function readPointProfile(feature: Pick<MapGeoJSONFeature, "properties"> | undefined): MapPointProfile | null {
  const properties: unknown = feature?.properties;
  if (!properties || typeof properties !== "object") return null;
  const record = properties as Record<string, unknown>;
  const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);
  const name = text(record.name);
  if (!name) return null;
  const profile: MapPointProfile = { name };
  if (isMapPointCategory(record.category)) profile.category = MAP_POINT_CATEGORY_LABELS[record.category];
  if (record.verificationStatus === "verified") profile.verification = "Verified";
  if (record.verificationStatus === "research") profile.verification = "Research";
  const address = text(record.address);
  if (address) profile.address = address;
  const owner = text(record.ownerName);
  if (owner) profile.owner = owner;
  const operator = text(record.operatorName);
  // Named only when it differs: "Meta / Meta" tells a reader nothing, while
  // "Applied Digital / CoreWeave" is the whole point of keeping both.
  if (operator && operator !== owner) profile.operator = operator;
  const status = text(record.lifecycleStatus);
  if (status && STATUS_LABELS[status]) profile.status = STATUS_LABELS[status];
  const lastVerified = text(record.lastVerifiedDate);
  if (lastVerified) profile.lastVerified = lastVerified;
  const sources = readSources(record.sourcesJson);
  if (sources.length > 0) profile.sources = sources;
  return profile;
}

/**
 * The card's DOM, built with createElement and textContent only so point
 * data can never inject markup. Source links are real anchors whose href is
 * set as a property and never interpolated, and only after readSources has
 * established the URL is http(s).
 */
export function buildProfileCard(profile: MapPointProfile): HTMLElement {
  const card = document.createElement("div");
  card.className = "flex flex-col gap-1.5 pr-4";
  const title = document.createElement("p");
  title.className = "text-sm font-semibold leading-snug text-neutral-900";
  title.textContent = profile.name;
  card.append(title);
  const rows: Array<[string, string | undefined]> = [
    ["Category", profile.category],
    ["Verification", profile.verification],
    ["Address", profile.address],
    ["Owner", profile.owner],
    ["Operator", profile.operator],
    ["Status", profile.status],
    ["Checked", profile.lastVerified],
  ];
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]));
  const list = document.createElement("dl");
  list.className = "flex flex-col gap-0.5 text-xs text-neutral-600";
  for (const [label, value] of present) {
    const row = document.createElement("div");
    row.className = "flex gap-1.5";
    const term = document.createElement("dt");
    term.className = "shrink-0 text-neutral-500";
    term.textContent = `${label}:`;
    const detail = document.createElement("dd");
    detail.className = "min-w-0 text-neutral-800";
    detail.textContent = value;
    row.append(term, detail);
    list.append(row);
  }

  // The sources row is the one the card exists for: every dot is a claim, and
  // this is where the claim's evidence is. Publishers are named rather than
  // counted, so a reader sees whether a site is placed by its operator or by a
  // county permit without opening anything.
  const sources = profile.sources ?? [];
  if (sources.length > 0) {
    const row = document.createElement("div");
    row.className = "flex gap-1.5";
    const term = document.createElement("dt");
    term.className = "shrink-0 text-neutral-500";
    term.textContent = sources.length === 1 ? "Source:" : "Sources:";
    const detail = document.createElement("dd");
    detail.className = "flex min-w-0 flex-wrap gap-x-1.5 gap-y-0.5 text-neutral-800";
    sources.forEach((source, index) => {
      const link = document.createElement("a");
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      link.textContent = index === sources.length - 1 ? source.publisher : `${source.publisher},`;
      link.className = "text-[#3b55c4] underline decoration-[#3b55c4]/40 underline-offset-2 hover:decoration-[#3b55c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526fe0]";
      detail.append(link);
    });
    row.append(term, detail);
    list.append(row);
  }

  if (list.childElementCount > 0) card.append(list);
  return card;
}

const buttonClasses =
  "w-full rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-left transition-colors hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526fe0]";

/** A location-level list; each button keeps the canonical research key. */
export function buildFacilityGroupCard(
  facilities: readonly FacilityAtCoordinate[],
  onSelect: (facility: FacilityAtCoordinate) => void,
): HTMLElement {
  const card = document.createElement("div");
  card.className = "flex max-h-[min(420px,calc(100vh-7rem))] flex-col gap-2 overflow-y-auto pr-4";
  card.setAttribute("role", "group");
  const heading = document.createElement("p");
  heading.className = "text-sm font-semibold leading-snug text-neutral-900";
  heading.textContent = `${facilities.length} facilities at this location`;
  card.setAttribute("aria-label", heading.textContent);
  card.append(heading);

  const list = document.createElement("div");
  list.className = "flex flex-col gap-1.5";
  for (const facility of facilities) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = buttonClasses;
    button.dataset.researchKey = facility.researchKey;
    button.setAttribute("aria-label", `Open ${facility.profile.name}`);

    const name = document.createElement("span");
    name.className = "block text-xs font-semibold text-neutral-900";
    name.textContent = facility.profile.name;
    button.append(name);

    const operator = facility.feature.properties.operatorName ?? facility.feature.properties.ownerName;
    for (const value of [operator, facility.profile.address, facility.profile.category]) {
      if (!value) continue;
      const detail = document.createElement("span");
      detail.className = "block text-[11px] leading-snug text-neutral-600";
      detail.textContent = value;
      button.append(detail);
    }
    button.addEventListener("click", () => onSelect(facility));
    list.append(button);
  }
  card.append(list);
  return card;
}

function buildGroupMemberCard(profile: MapPointProfile, onBack: (button: HTMLButtonElement) => void): HTMLElement {
  const card = document.createElement("div");
  card.className = "flex flex-col gap-2 pr-4";
  const back = document.createElement("button");
  back.type = "button";
  back.className =
    "self-start rounded text-xs font-medium text-[#3b55c4] underline decoration-[#3b55c4]/40 underline-offset-2 hover:decoration-[#3b55c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526fe0]";
  back.textContent = "Back to facilities";
  back.addEventListener("click", () => onBack(back));
  card.append(back, buildProfileCard(profile));
  return card;
}

const POPUP_OPTIONS: PopupOptions = {
  closeButton: true,
  closeOnClick: true,
  focusAfterOpen: true,
  offset: 10,
  // Bounded on phones so the card never runs past the viewport edge.
  maxWidth: "min(280px, calc(100vw - 2rem))",
  className: "urdais-point-popup",
};

/**
 * Wires the mapped-point interactions onto the existing layers. Point clicks
 * resolve through an exact-coordinate index of the visible collection rather
 * than trusting renderer hit order. Normal clusters still expand; a cluster
 * whose leaves all occupy one exact coordinate opens that coordinate's group
 * because no amount of zooming can separate it.
 */
export function attachPointInteractions(map: MapLibreMap, Popup: PopupConstructor, initialCollection: MapPointCollection): PointInteractions {
  let popup: MapLibrePopup | null = null;
  let openAnchor: LngLatLike | null = null;
  let coordinateIndex = buildCoordinateFacilityIndex(initialCollection);
  let collectionRevision = 0;
  let disposed = false;
  const canvas = map.getCanvas();

  const closePopup = () => {
    popup?.remove();
    popup = null;
    openAnchor = null;
  };

  const focusAfterContentChange = (element: HTMLElement | null) => {
    queueMicrotask(() => {
      element?.focus();
    });
  };

  const showFacilities = (facilities: readonly FacilityAtCoordinate[], focusResearchKey?: string) => {
    if (!popup) return;
    if (facilities.length === 1) {
      popup.setDOMContent(buildProfileCard(facilities[0]!.profile));
      return;
    }
    const card = buildFacilityGroupCard(facilities, (facility) => {
      if (!popup) return;
      const memberCard = buildGroupMemberCard(facility.profile, () => {
        showFacilities(facilities, facility.researchKey);
      });
      popup.setDOMContent(memberCard);
      focusAfterContentChange(memberCard.querySelector("button"));
    });
    popup.setDOMContent(card);
    if (focusResearchKey) {
      const previous = [...card.querySelectorAll<HTMLButtonElement>("[data-research-key]")].find(
        (button) => button.dataset.researchKey === focusResearchKey,
      );
      focusAfterContentChange(previous ?? null);
    }
  };

  const openFacilities = (anchor: readonly number[], facilities: readonly FacilityAtCoordinate[]) => {
    if (facilities.length === 0) return;
    closePopup();
    openAnchor = [anchor[0]!, anchor[1]!];
    popup = new Popup(POPUP_OPTIONS).setLngLat(openAnchor).setDOMContent(document.createElement("div")).addTo(map);
    showFacilities(facilities);
    popup.on("close", () => {
      popup = null;
      openAnchor = null;
    });
  };

  const handleClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = event.features?.[0];
    if (!readPointProfile(feature) || feature?.geometry.type !== "Point") return;
    const anchor = feature.geometry.coordinates;
    openFacilities(anchor, facilitiesAtCoordinate(coordinateIndex, anchor));
  };

  const handleClusterClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.cluster_id;
    if (typeof clusterId !== "number" || feature?.geometry.type !== "Point") return;
    const source = map.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const center = feature.geometry.coordinates as LngLatLike;
    const pointCount = typeof feature.properties?.point_count === "number" ? feature.properties.point_count : 0;
    const revision = collectionRevision;
    void (async () => {
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        if (disposed || revision !== collectionRevision) return;
        // Ordinary clusters keep MapLibre's existing expansion behavior. Only
        // a cluster that cannot separate beyond the configured maximum needs
        // the more expensive leaf inspection below.
        if (pointCount < 2 || zoom <= CLUSTER_MAX_ZOOM) {
          map.easeTo({ center, zoom });
          return;
        }

        const leaves = await source.getClusterLeaves(clusterId, pointCount, 0);
        if (disposed || revision !== collectionRevision) return;
        const pointLeaves = leaves.filter((leaf) => leaf.geometry.type === "Point");
        const first = pointLeaves[0];
        if (first?.geometry.type === "Point") {
          const firstKey = coordinateKey(first.geometry.coordinates);
          const inseparable =
            firstKey !== null &&
            pointLeaves.length === pointCount &&
            pointLeaves.every((leaf) => leaf.geometry.type === "Point" && coordinateKey(leaf.geometry.coordinates) === firstKey);
          if (inseparable) {
            const facilities = facilitiesAtCoordinate(coordinateIndex, first.geometry.coordinates);
            if (facilities.length > 1) {
              openFacilities(first.geometry.coordinates, facilities);
              return;
            }
          }
        }
        map.easeTo({ center, zoom });
      } catch {
        // A stale cluster id can disappear while its worker result is in flight.
      }
    })();
  };

  const handleClusterMove = () => {
    canvas.style.cursor = "pointer";
  };

  // After any camera change, a point may have been absorbed into a cluster;
  // if nothing is individually rendered at the popup's anchor, close it.
  const handleMoveEnd = () => {
    if (!popup || !openAnchor) return;
    const rendered = map.queryRenderedFeatures(map.project(openAnchor as LngLat), { layers: [POINTS_LAYER_ID, CLUSTERS_LAYER_ID] });
    if (rendered.length === 0) closePopup();
  };

  const handleMove = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    canvas.style.cursor = readPointProfile(event.features?.[0]) ? "pointer" : "";
  };

  const handleLeave = () => {
    canvas.style.cursor = "";
  };

  map.on("click", POINTS_LAYER_ID, handleClick);
  map.on("mousemove", POINTS_LAYER_ID, handleMove);
  map.on("mouseleave", POINTS_LAYER_ID, handleLeave);
  map.on("click", CLUSTERS_LAYER_ID, handleClusterClick);
  map.on("mousemove", CLUSTERS_LAYER_ID, handleClusterMove);
  map.on("mouseleave", CLUSTERS_LAYER_ID, handleLeave);
  map.on("moveend", handleMoveEnd);

  return {
    setCollection: (collection) => {
      coordinateIndex = buildCoordinateFacilityIndex(collection);
      collectionRevision += 1;
      if (!popup || !openAnchor) return;
      const anchor = openAnchor as readonly number[];
      const facilities = facilitiesAtCoordinate(coordinateIndex, anchor);
      if (facilities.length === 0) {
        closePopup();
        canvas.style.cursor = "";
        return;
      }
      showFacilities(facilities);
    },
    dispose: () => {
      disposed = true;
      collectionRevision += 1;
      map.off("click", POINTS_LAYER_ID, handleClick);
      map.off("mousemove", POINTS_LAYER_ID, handleMove);
      map.off("mouseleave", POINTS_LAYER_ID, handleLeave);
      map.off("click", CLUSTERS_LAYER_ID, handleClusterClick);
      map.off("mousemove", CLUSTERS_LAYER_ID, handleClusterMove);
      map.off("mouseleave", CLUSTERS_LAYER_ID, handleLeave);
      map.off("moveend", handleMoveEnd);
      closePopup();
      canvas.style.cursor = "";
    },
  };
}
