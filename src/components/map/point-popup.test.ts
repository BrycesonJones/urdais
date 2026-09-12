import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { CLUSTERS_LAYER_ID, POINTS_LAYER_ID } from "@/components/map/point-layer";
import { DEFAULT_MAP_VISIBILITY } from "@/components/map/map-point-style";
import { attachPointInteractions, buildProfileCard, readMappedPointProfile } from "@/components/map/point-popup";

function stubPopup() {
  const instances: Array<{ options: unknown; lngLat: unknown; content: HTMLElement | null; added: boolean; removed: boolean; handlers: Record<string, () => void> }> = [];
  const Popup = vi.fn(function (this: unknown, options: unknown) {
    const instance = { options, lngLat: null as unknown, content: null as HTMLElement | null, added: false, removed: false, handlers: {} as Record<string, () => void> };
    const api = {
      setLngLat: (lngLat: unknown) => ((instance.lngLat = lngLat), api),
      setDOMContent: (content: HTMLElement) => ((instance.content = content), api),
      addTo: () => ((instance.added = true), api),
      remove: () => ((instance.removed = true), api),
      on: (event: string, handler: () => void) => ((instance.handlers[event] = handler), api),
    };
    instances.push(instance);
    return api;
  });
  return { Popup: Popup as unknown as new () => never, instances };
}

function stubMap() {
  const handlers = new Map<string, Array<(event: unknown) => void>>();
  const canvas = document.createElement("canvas");
  const key = (event: string, layer?: string) => (layer ? `${event}:${layer}` : event);
  const split = (layerOrHandler: string | ((event: unknown) => void), maybeHandler?: (event: unknown) => void) =>
    typeof layerOrHandler === "string" ? ([layerOrHandler, maybeHandler!] as const) : ([undefined, layerOrHandler] as const);
  const source = { getClusterExpansionZoom: vi.fn(async (id: number) => (id === 99 ? Promise.reject(new Error("unknown cluster")) : 8)) };
  const map = {
    getCanvas: () => canvas,
    getSource: vi.fn(() => source),
    easeTo: vi.fn(),
    project: vi.fn(() => ({ x: 5, y: 5 })),
    queryRenderedFeatures: vi.fn(() => [{}]),
    on: vi.fn((event: string, layerOrHandler: string | ((event: unknown) => void), maybeHandler?: (event: unknown) => void) => { const [layer, handler] = split(layerOrHandler, maybeHandler); handlers.set(key(event, layer), [...(handlers.get(key(event, layer)) ?? []), handler]); }),
    off: vi.fn((event: string, layerOrHandler: string | ((event: unknown) => void), maybeHandler?: (event: unknown) => void) => { const [layer, handler] = split(layerOrHandler, maybeHandler); handlers.set(key(event, layer), (handlers.get(key(event, layer)) ?? []).filter((candidate) => candidate !== handler)); }),
    fire: (event: string, layer: string | undefined, payload?: unknown) => handlers.get(key(event, layer))?.forEach((handler) => handler(payload)),
    registered: (event: string, layer?: string) => handlers.get(key(event, layer))?.length ?? 0,
    source,
  };
  return { map: map as unknown as MapLibreMap & typeof map, canvas };
}

const feature = (properties: Record<string, unknown>, coordinates = [-0.128, 51.507]) => ({ properties, geometry: { type: "Point", coordinates } });
const mapped = feature({ name: "Demo Point 3", mappingStatus: "mapped", category: "data_center", address: "London, United Kingdom", contactEmail: "demo@example.com" });
const unmapped = feature({ name: "Demo Point 4", mappingStatus: "unmapped" }, [8.682, 50.111]);

describe("readMappedPointProfile", () => {
  it("returns the profile for a mapped feature with a readable category, and drops blank optional fields", () => {
    expect(readMappedPointProfile(mapped)).toEqual({ name: "Demo Point 3", category: "Data Center", address: "London, United Kingdom", contactEmail: "demo@example.com" });
    expect(readMappedPointProfile(feature({ name: "Only name", mappingStatus: "mapped", address: "  ", contactEmail: 7 }))).toEqual({ name: "Only name" });
    expect(readMappedPointProfile(feature({ name: "Bad mail", mappingStatus: "mapped", contactEmail: "not an email" }))).toEqual({ name: "Bad mail" });
    expect(readMappedPointProfile(feature({ name: "Legacy", mappingStatus: "mapped", operator: "Demo Operator", location: "Somewhere" }))).toEqual({ name: "Legacy" });
  });

  it("never shows a raw category value, and tolerates a missing or unknown one", () => {
    expect(readMappedPointProfile(feature({ name: "Fab", mappingStatus: "mapped", category: "semiconductor_fab" }))).toEqual({ name: "Fab", category: "Semiconductor Fab" });
    expect(readMappedPointProfile(feature({ name: "Odd", mappingStatus: "mapped", category: "gpu" }))).toEqual({ name: "Odd" });
    expect(readMappedPointProfile(feature({ name: "None", mappingStatus: "mapped", category: 9 }))).toEqual({ name: "None" });
  });

  it("returns null for unmapped, unnamed, or malformed features without throwing", () => {
    expect(readMappedPointProfile(unmapped)).toBeNull();
    expect(readMappedPointProfile(feature({ mappingStatus: "mapped" }))).toBeNull();
    expect(readMappedPointProfile(feature({ name: "", mappingStatus: "mapped" }))).toBeNull();
    expect(readMappedPointProfile({ properties: null as never })).toBeNull();
    expect(readMappedPointProfile(undefined)).toBeNull();
  });
});

describe("buildProfileCard", () => {
  it("renders the name, category, address, and email as text, never as markup, and never an Operator row", () => {
    const card = buildProfileCard({ name: "<b>Demo</b> Point", category: "Compute Cluster", address: "8209 Valley Pike, Middletown, Virginia, USA", contactEmail: "contact@example.com" });
    expect(card.querySelector("p")?.textContent).toBe("<b>Demo</b> Point");
    expect(card.querySelector("b")).toBeNull();
    expect([...card.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Category:", "Address:", "Email:"]);
    expect([...card.querySelectorAll("dd")].map((detail) => detail.textContent)).toEqual(["Compute Cluster", "8209 Valley Pike, Middletown, Virginia, USA", "contact@example.com"]);
    expect(card.textContent).not.toContain("compute_cluster");
    expect(card.textContent).not.toMatch(/Operator/);
  });

  it("renders the email as a same-tab mailto link with a safe href", () => {
    const card = buildProfileCard({ name: "Demo", contactEmail: "contact@example.com" });
    const link = card.querySelector("a");
    expect(link?.getAttribute("href")).toBe("mailto:contact@example.com");
    expect(link?.textContent).toBe("contact@example.com");
    expect(link?.getAttribute("target")).toBeNull();
    expect(card.querySelectorAll("a")).toHaveLength(1);
    const tricky = buildProfileCard({ name: "Demo", contactEmail: 'a"@example.com' });
    expect(tricky.querySelector("a")?.getAttribute("href")).toBe('mailto:a"@example.com');
    expect(tricky.innerHTML).not.toContain("<script");
  });

  it("omits the Address row when there is no address and the Email row when there is no email", () => {
    const addressOnly = buildProfileCard({ name: "Demo", category: "Data Center", address: "Singapore" });
    expect([...addressOnly.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Category:", "Address:"]);
    expect(addressOnly.querySelector("a")).toBeNull();
    const emailOnly = buildProfileCard({ name: "Demo", category: "Power Infrastructure", contactEmail: "demo@example.com" });
    expect([...emailOnly.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Category:", "Email:"]);
  });

  it("omits the detail list entirely when there is nothing beyond the name", () => {
    const card = buildProfileCard({ name: "Demo Point 7" });
    expect(card.textContent).toBe("Demo Point 7");
    expect(card.querySelector("dl")).toBeNull();
  });
});

describe("attachPointInteractions", () => {
  it("registers the point, cluster, and moveend handlers once and removes them on dispose", () => {
    const { map } = stubMap();
    const { dispose } = attachPointInteractions(map, stubPopup().Popup);
    for (const event of ["click", "mousemove", "mouseleave"]) { expect(map.registered(event, POINTS_LAYER_ID)).toBe(1); expect(map.registered(event, CLUSTERS_LAYER_ID)).toBe(1); }
    expect(map.registered("moveend")).toBe(1);
    expect(map.on).toHaveBeenCalledTimes(7);
    dispose();
    for (const event of ["click", "mousemove", "mouseleave"]) { expect(map.registered(event, POINTS_LAYER_ID)).toBe(0); expect(map.registered(event, CLUSTERS_LAYER_ID)).toBe(0); }
    expect(map.registered("moveend")).toBe(0);
  });

  it("opens a popup anchored to a clicked mapped point with its profile", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    expect(instances).toHaveLength(1);
    expect(instances[0]?.lngLat).toEqual([-0.128, 51.507]);
    expect(instances[0]?.added).toBe(true);
    expect(instances[0]?.content?.textContent).toContain("Demo Point 3");
    expect(instances[0]?.content?.textContent).toContain("London, United Kingdom");
    expect(instances[0]?.content?.querySelector("a")?.getAttribute("href")).toBe("mailto:demo@example.com");
    expect(instances[0]?.content?.textContent).toContain("Data Center");
    expect(instances[0]?.options).toMatchObject({ closeButton: true, className: "urdais-point-popup" });
  });

  it("does nothing for an unmapped point or an empty click", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [unmapped] });
    map.fire("click", POINTS_LAYER_ID, { features: [] });
    map.fire("click", POINTS_LAYER_ID, {});
    expect(instances).toHaveLength(0);
  });

  it("replaces the open popup when a second mapped point is clicked, so only one exists", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    map.fire("click", POINTS_LAYER_ID, { features: [feature({ name: "Demo Point 1", mappingStatus: "mapped" }, [-84.388, 33.749])] });
    expect(instances).toHaveLength(2);
    expect(instances[0]?.removed).toBe(true);
    expect(instances[1]?.removed).toBe(false);
  });

  it("removes an open popup on dispose", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const { dispose } = attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    dispose();
    expect(instances[0]?.removed).toBe(true);
  });

  it("forgets a popup the user closed, so a later dispose does not remove it twice", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const { dispose } = attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    instances[0]?.handlers.close?.();
    const removeSpy = vi.fn();
    instances[0]!.removed = false;
    dispose();
    expect(instances[0]?.removed).toBe(false);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("shows a pointer only over mapped points and restores the cursor on leave", () => {
    const { map, canvas } = stubMap();
    attachPointInteractions(map, stubPopup().Popup);
    map.fire("mousemove", POINTS_LAYER_ID, { features: [mapped] });
    expect(canvas.style.cursor).toBe("pointer");
    map.fire("mousemove", POINTS_LAYER_ID, { features: [unmapped] });
    expect(canvas.style.cursor).toBe("");
    map.fire("mousemove", POINTS_LAYER_ID, { features: [mapped] });
    map.fire("mouseleave", POINTS_LAYER_ID, {});
    expect(canvas.style.cursor).toBe("");
  });

  it("closes the open popup when its point's group is hidden, and leaves it when another group is", () => {
    const { map, canvas } = stubMap();
    const { Popup, instances } = stubPopup();
    const { applyVisibility } = attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    applyVisibility({ ...DEFAULT_MAP_VISIBILITY, semiconductor_fab: false, unmapped: false });
    expect(instances[0]?.removed).toBe(false);
    applyVisibility({ ...DEFAULT_MAP_VISIBILITY, data_center: false });
    expect(instances[0]?.removed).toBe(true);
    expect(canvas.style.cursor).toBe("");
    applyVisibility({ ...DEFAULT_MAP_VISIBILITY, data_center: false });
    expect(instances).toHaveLength(1);
  });

  it("re-enabling a group after a hide lets the point open a fresh popup", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const { applyVisibility } = attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    applyVisibility({ ...DEFAULT_MAP_VISIBILITY, data_center: false });
    applyVisibility(DEFAULT_MAP_VISIBILITY);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    expect(instances).toHaveLength(2);
    expect(instances[1]?.removed).toBe(false);
  });

  it("eases into a clicked cluster at the source's expansion zoom, and opens no popup", async () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    attachPointInteractions(map, Popup);
    map.fire("click", CLUSTERS_LAYER_ID, { features: [{ properties: { cluster: true, cluster_id: 7, point_count: 12 }, geometry: { type: "Point", coordinates: [-96.8, 32.8] } }] });
    await vi.waitFor(() => expect(map.easeTo).toHaveBeenCalledTimes(1));
    expect(map.source.getClusterExpansionZoom).toHaveBeenCalledWith(7);
    expect(map.easeTo).toHaveBeenCalledWith({ center: [-96.8, 32.8], zoom: 8 });
    expect(instances).toHaveLength(0);
  });

  it("ignores malformed cluster clicks and a failed expansion lookup", async () => {
    const { map } = stubMap();
    attachPointInteractions(map, stubPopup().Popup);
    map.fire("click", CLUSTERS_LAYER_ID, { features: [{ properties: { point_count: 3 }, geometry: { type: "Point", coordinates: [0, 0] } }] });
    map.fire("click", CLUSTERS_LAYER_ID, { features: [] });
    map.fire("click", CLUSTERS_LAYER_ID, {});
    map.fire("click", CLUSTERS_LAYER_ID, { features: [{ properties: { cluster_id: 99 }, geometry: { type: "Point", coordinates: [0, 0] } }] });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.source.getClusterExpansionZoom).toHaveBeenCalledTimes(1);
  });

  it("does not expand a cluster from an individual point click", () => {
    const { map } = stubMap();
    attachPointInteractions(map, stubPopup().Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    expect(map.source.getClusterExpansionZoom).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("shows a pointer over a cluster and restores it on leave", () => {
    const { map, canvas } = stubMap();
    attachPointInteractions(map, stubPopup().Popup);
    map.fire("mousemove", CLUSTERS_LAYER_ID, { features: [{ properties: { cluster_id: 1 } }] });
    expect(canvas.style.cursor).toBe("pointer");
    map.fire("mouseleave", CLUSTERS_LAYER_ID, {});
    expect(canvas.style.cursor).toBe("");
  });

  it("closes the popup after a camera move once its point is no longer rendered individually", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    attachPointInteractions(map, Popup);
    map.fire("moveend", undefined, {});
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    map.fire("moveend", undefined, {});
    expect(instances[0]?.removed).toBe(false);
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ x: 5, y: 5 }, { layers: [POINTS_LAYER_ID] });
    map.queryRenderedFeatures.mockReturnValueOnce([]);
    map.fire("moveend", undefined, {});
    expect(instances[0]?.removed).toBe(true);
    map.fire("moveend", undefined, {});
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(2);
  });
});
