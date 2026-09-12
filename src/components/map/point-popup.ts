import type { LngLatLike, Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent, Popup as MapLibrePopup, PopupOptions } from "maplibre-gl";

import { MAP_POINT_CATEGORY_LABELS, isMapPointCategory } from "@/components/map/map-point-style";
import { POINTS_LAYER_ID } from "@/components/map/point-layer";

/** What the profile card shows. Only mapped points with a name qualify. */
export type MapPointProfile = {
  name: string;
  /** Human-readable category label, never the raw enum value. */
  category?: string;
  location?: string;
  operator?: string;
};

/** MapLibre's Popup class, handed in because the renderer is loaded lazily. */
export type PopupConstructor = new (options?: PopupOptions) => MapLibrePopup;

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
  const location = text(record.location);
  const operator = text(record.operator);
  if (location) profile.location = location;
  if (operator) profile.operator = operator;
  return profile;
}

/** The card's DOM, built with textContent only so point data can never inject markup. */
export function buildProfileCard(profile: MapPointProfile): HTMLElement {
  const card = document.createElement("div");
  card.className = "flex flex-col gap-1.5 pr-4";
  const title = document.createElement("p");
  title.className = "text-sm font-semibold leading-snug text-neutral-900";
  title.textContent = profile.name;
  card.append(title);
  const rows: Array<[string, string | undefined]> = [
    ["Category", profile.category],
    ["Operator", profile.operator],
    ["Location", profile.location],
  ];
  const present = rows.filter((row): row is [string, string] => Boolean(row[1]));
  if (present.length > 0) {
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
 * pointer only while over a mapped point. Returns a dispose function that
 * removes the handlers and any open popup; the map component calls it
 * before removing the map so nothing leaks across remounts.
 */
export function attachPointInteractions(map: MapLibreMap, Popup: PopupConstructor): () => void {
  let popup: MapLibrePopup | null = null;
  const canvas = map.getCanvas();

  const closePopup = () => {
    popup?.remove();
    popup = null;
  };

  const handleClick = (event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = event.features?.[0];
    const profile = readMappedPointProfile(feature);
    if (!profile || feature?.geometry.type !== "Point") return;
    closePopup();
    const anchor = feature.geometry.coordinates as LngLatLike;
    popup = new Popup(POPUP_OPTIONS).setLngLat(anchor).setDOMContent(buildProfileCard(profile)).addTo(map);
    popup.on("close", () => {
      popup = null;
    });
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

  return () => {
    map.off("click", POINTS_LAYER_ID, handleClick);
    map.off("mousemove", POINTS_LAYER_ID, handleMove);
    map.off("mouseleave", POINTS_LAYER_ID, handleLeave);
    closePopup();
    canvas.style.cursor = "";
  };
}
