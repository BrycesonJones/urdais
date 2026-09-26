import type { GeoJSONSource, LngLat, LngLatLike, Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent, Popup as MapLibrePopup, PopupOptions } from "maplibre-gl";

import { MAP_POINT_CATEGORY_LABELS, isMapPointCategory, visibilityGroupOf } from "@/components/map/map-point-style";
import type { MapVisibilityState } from "@/components/map/map-point-style";
import { CLUSTERS_LAYER_ID, POINTS_LAYER_ID, POINTS_SOURCE_ID } from "@/components/map/point-layer";

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
  /** Closes the open popup if its point's group has been hidden. */
  applyVisibility: (visibility: MapVisibilityState) => void;
  /** Removes the handlers and any open popup. */
  dispose: () => void;
};

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
 * Wires the mapped-point interactions onto the existing circle layer: a
 * click on a point opens its profile card anchored to the point (a second
 * click elsewhere replaces it, so at most one popup exists), and the cursor
 * turns into a pointer only while over a point. A click on a cluster asks the
 * source for the zoom at which that cluster splits and eases the camera
 * there, never opening a popup; hovering a cluster also shows a pointer.
 * Hidden points never reach these handlers because they are not in the
 * source, a popup whose point is hidden after opening is closed by
 * applyVisibility, and a popup whose point is swallowed by a cluster after
 * a zoom or pan is closed on moveend. dispose removes the handlers and any
 * open popup; the map component calls it before removing the map so nothing
 * leaks across remounts.
 */
export function attachPointInteractions(map: MapLibreMap, Popup: PopupConstructor): PointInteractions {
  let popup: MapLibrePopup | null = null;
  let openGroup: ReturnType<typeof visibilityGroupOf> = null;
  let openAnchor: LngLatLike | null = null;
  const canvas = map.getCanvas();

  const closePopup = () => {
    popup?.remove();
    popup = null;
    openGroup = null;
    openAnchor = null;
  };

  const handleClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = event.features?.[0];
    const profile = readPointProfile(feature);
    if (!profile || feature?.geometry.type !== "Point") return;
    closePopup();
    const anchor = feature.geometry.coordinates as LngLatLike;
    popup = new Popup(POPUP_OPTIONS).setLngLat(anchor).setDOMContent(buildProfileCard(profile)).addTo(map);
    openGroup = visibilityGroupOf(feature.properties);
    openAnchor = anchor;
    popup.on("close", () => {
      popup = null;
      openGroup = null;
      openAnchor = null;
    });
  };

  const handleClusterClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = event.features?.[0];
    const clusterId = feature?.properties?.cluster_id;
    if (typeof clusterId !== "number" || feature?.geometry.type !== "Point") return;
    const source = map.getSource(POINTS_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;
    const center = feature.geometry.coordinates as LngLatLike;
    void source
      .getClusterExpansionZoom(clusterId)
      .then((zoom) => map.easeTo({ center, zoom }))
      .catch(() => undefined);
  };

  const handleClusterMove = () => {
    canvas.style.cursor = "pointer";
  };

  // After any camera change, a point may have been absorbed into a cluster;
  // if nothing is individually rendered at the popup's anchor, close it.
  const handleMoveEnd = () => {
    if (!popup || !openAnchor) return;
    const rendered = map.queryRenderedFeatures(map.project(openAnchor as LngLat), { layers: [POINTS_LAYER_ID] });
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
    applyVisibility: (visibility) => {
      if (popup && openGroup && !visibility[openGroup]) {
        closePopup();
        canvas.style.cursor = "";
      }
    },
    dispose: () => {
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
