import type { GeoJSONSource, LngLat, LngLatLike, Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent, Popup as MapLibrePopup, PopupOptions } from "maplibre-gl";

import { MAP_POINT_CATEGORY_LABELS, isMapPointCategory, visibilityGroupOf } from "@/components/map/map-point-style";
import type { MapVisibilityState } from "@/components/map/map-point-style";
import { CLUSTERS_LAYER_ID, POINTS_LAYER_ID, POINTS_SOURCE_ID } from "@/components/map/point-layer";

/** What the profile card shows. Only mapped points with a name qualify. */
export type MapPointProfile = {
  name: string;
  /** Human-readable category label, never the raw enum value. */
  category?: string;
  address?: string;
  contactEmail?: string;
};

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
 * assumes a shape: an unmapped point, a missing or blank name, or absent
 * optional fields all resolve without throwing. Returns null when there is
 * nothing to show.
 */
export function readMappedPointProfile(feature: Pick<MapGeoJSONFeature, "properties"> | undefined): MapPointProfile | null {
  const properties: unknown = feature?.properties;
  if (!properties || typeof properties !== "object") return null;
  const record = properties as Record<string, unknown>;
  if (record.mappingStatus !== "mapped") return null;
  const text = (value: unknown): string | undefined => (typeof value === "string" && value.trim() !== "" ? value : undefined);
  const name = text(record.name);
  if (!name) return null;
  const profile: MapPointProfile = { name };
  if (isMapPointCategory(record.category)) profile.category = MAP_POINT_CATEGORY_LABELS[record.category];
  const address = text(record.address);
  const contactEmail = text(record.contactEmail);
  if (address) profile.address = address;
  if (contactEmail && !/\s/.test(contactEmail) && contactEmail.includes("@")) profile.contactEmail = contactEmail;
  return profile;
}

/**
 * The card's DOM, built with createElement and textContent only so point
 * data can never inject markup. The email is a real mailto link (same tab,
 * keyboard reachable); the href is set as a property, never interpolated.
 */
export function buildProfileCard(profile: MapPointProfile): HTMLElement {
  const card = document.createElement("div");
  card.className = "flex flex-col gap-1.5 pr-4";
  const title = document.createElement("p");
  title.className = "text-sm font-semibold leading-snug text-neutral-900";
  title.textContent = profile.name;
  card.append(title);
  const rows: Array<[string, string | undefined, "text" | "email"]> = [
    ["Category", profile.category, "text"],
    ["Address", profile.address, "text"],
    ["Email", profile.contactEmail, "email"],
  ];
  const present = rows.filter((row): row is [string, string, "text" | "email"] => Boolean(row[1]));
  if (present.length > 0) {
    const list = document.createElement("dl");
    list.className = "flex flex-col gap-0.5 text-xs text-neutral-600";
    for (const [label, value, kind] of present) {
      const row = document.createElement("div");
      row.className = "flex gap-1.5";
      const term = document.createElement("dt");
      term.className = "shrink-0 text-neutral-500";
      term.textContent = `${label}:`;
      const detail = document.createElement("dd");
      detail.className = "min-w-0 text-neutral-800";
      if (kind === "email") {
        const link = document.createElement("a");
        link.href = `mailto:${value}`;
        link.textContent = value;
        link.className = "break-all text-[#3b55c4] underline decoration-[#3b55c4]/40 underline-offset-2 hover:decoration-[#3b55c4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#526fe0]";
        detail.append(link);
      } else {
        detail.textContent = value;
      }
      row.append(term, detail);
      list.append(row);
    }
    card.append(list);
  }
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
 * click on a mapped point opens its profile card anchored to the point (a
 * second click elsewhere replaces it, so at most one popup exists), a
 * click on an unmapped point does nothing, and the cursor turns into a
 * pointer only while over a mapped point. A click on a cluster asks the
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
    const profile = readMappedPointProfile(feature);
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
    canvas.style.cursor = readMappedPointProfile(event.features?.[0]) ? "pointer" : "";
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
