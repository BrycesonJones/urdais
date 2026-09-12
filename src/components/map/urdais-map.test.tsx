import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maplibre = vi.hoisted(() => {
  type Instance = {
    options: Record<string, unknown>;
    addControl: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
    off: ReturnType<typeof vi.fn>;
    getCanvas: ReturnType<typeof vi.fn>;
    getSource: ReturnType<typeof vi.fn>;
    addSource: ReturnType<typeof vi.fn>;
    getLayer: ReturnType<typeof vi.fn>;
    addLayer: ReturnType<typeof vi.fn>;
    easeTo: ReturnType<typeof vi.fn>;
    project: ReturnType<typeof vi.fn>;
    queryRenderedFeatures: ReturnType<typeof vi.fn>;
    getStyle: ReturnType<typeof vi.fn>;
    /** The one GeoJSON source stub, once added. */
    source: () => { setData: ReturnType<typeof vi.fn>; getClusterExpansionZoom: ReturnType<typeof vi.fn> } | undefined;
    /** Fires the handlers registered for a map event (optionally on a layer), as the real map would. */
    emit: (event: string, layer?: string, payload?: unknown) => void;
    /** Live handler count for an event / layer pair. */
    handlerCount: (event: string, layer?: string) => number;
  };
  const instances: Instance[] = [];
  const Map = vi.fn(function (this: unknown, options: Record<string, unknown>) {
    const handlers = new globalThis.Map<string, Array<(payload?: unknown) => void>>();
    const sources = new globalThis.Map<string, { setData: ReturnType<typeof vi.fn>; getClusterExpansionZoom: ReturnType<typeof vi.fn> }>();
    const layers = new globalThis.Map<string, unknown>();
    const canvas = document.createElement("canvas");
    const key = (event: string, layer?: string) => (layer ? `${event}:${layer}` : event);
    const register = (event: string, layerOrHandler: string | ((payload?: unknown) => void), maybeHandler?: (payload?: unknown) => void) => {
      const [layer, handler] = typeof layerOrHandler === "string" ? [layerOrHandler, maybeHandler!] : [undefined, layerOrHandler];
      handlers.set(key(event, layer), [...(handlers.get(key(event, layer)) ?? []), handler]);
    };
    const unregister = (event: string, layerOrHandler: string | ((payload?: unknown) => void), maybeHandler?: (payload?: unknown) => void) => {
      const [layer, handler] = typeof layerOrHandler === "string" ? [layerOrHandler, maybeHandler!] : [undefined, layerOrHandler];
      handlers.set(key(event, layer), (handlers.get(key(event, layer)) ?? []).filter((candidate) => candidate !== handler));
    };
    const instance: Instance = {
      options,
      addControl: vi.fn(),
      remove: vi.fn(),
      on: vi.fn(register),
      off: vi.fn(unregister),
      getCanvas: vi.fn(() => canvas),
      getSource: vi.fn((id: string) => sources.get(id)),
      addSource: vi.fn((id: string, source: unknown) => sources.set(id, { ...(source as object), setData: vi.fn(), getClusterExpansionZoom: vi.fn(async () => 7) })),
      getLayer: vi.fn((id: string) => layers.get(id)),
      addLayer: vi.fn((layer: { id: string }) => layers.set(layer.id, layer)),
      easeTo: vi.fn(),
      project: vi.fn(() => ({ x: 10, y: 10 })),
      queryRenderedFeatures: vi.fn(() => [{}]),
      source: () => sources.get("urdais-points"),
      getStyle: vi.fn(() => ({ layers: [{ id: "background", type: "background" }, { id: "label_city", type: "symbol" }] })),
      emit: (event, layer, payload) => handlers.get(key(event, layer))?.forEach((handler) => handler(payload)),
      handlerCount: (event, layer) => handlers.get(key(event, layer))?.length ?? 0,
    };
    instances.push(instance);
    return instance;
  });
  const NavigationControl = vi.fn(function (this: unknown, options: unknown) {
    return { kind: "navigation", options };
  });
  const ScaleControl = vi.fn(function (this: unknown, options: unknown) {
    return { kind: "scale", options };
  });
  const popups: Array<{ removed: boolean; content: HTMLElement | null }> = [];
  const Popup = vi.fn(function (this: unknown) {
    const popup = { removed: false, content: null as HTMLElement | null };
    popups.push(popup);
    const api = { setLngLat: () => api, setDOMContent: (content: HTMLElement) => ((popup.content = content), api), addTo: () => api, remove: () => ((popup.removed = true), api), on: () => api };
    return api;
  });
  return { instances, popups, Map, NavigationControl, Popup, ScaleControl, setWorkerUrl: vi.fn() };
});

vi.mock("maplibre-gl", () => ({
  Map: maplibre.Map,
  NavigationControl: maplibre.NavigationControl,
  Popup: maplibre.Popup,
  ScaleControl: maplibre.ScaleControl,
  setWorkerUrl: maplibre.setWorkerUrl,
}));

const STYLE = { version: 8, sources: {}, layers: [{ id: "label_city", type: "symbol", source: "openmaptiles", layout: { "text-anchor": "bottom", "text-size": 13 } }] };

async function loadComponent() {
  const { UrdaisMap } = await import("@/components/map/urdais-map");
  return UrdaisMap;
}

describe("UrdaisMap", () => {
  beforeEach(() => {
    maplibre.instances.length = 0;
    maplibre.popups.length = 0;
    maplibre.Map.mockClear();
    maplibre.Popup.mockClear();
    maplibre.NavigationControl.mockClear();
    maplibre.ScaleControl.mockClear();
    maplibre.setWorkerUrl.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => structuredClone(STYLE) })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates one map in its container with the world-scale view and the worker served from our origin", async () => {
    const UrdaisMap = await loadComponent();
    const { container } = render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));

    const [instance] = maplibre.instances;
    expect(instance?.options.container).toBe(container.firstElementChild);
    expect(instance?.options.center).toEqual([10, 20]);
    expect(instance?.options.zoom).toBe(1.4);
    expect(instance?.options.minZoom).toBe(1);
    expect(maplibre.setWorkerUrl).toHaveBeenCalledWith("/vendor/maplibre-gl/maplibre-gl-worker.mjs");
    expect(maplibre.setWorkerUrl.mock.invocationCallOrder[0]).toBeLessThan(maplibre.Map.mock.invocationCallOrder[0]!);
  });

  it("hands MapLibre the Positron style with the label overrides already applied", async () => {
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));

    expect(fetch).toHaveBeenCalledWith("https://tiles.openfreemap.org/styles/positron");
    const style = maplibre.instances[0]?.options.style as typeof STYLE;
    expect(style.layers[0]?.layout).toMatchObject({ "text-variable-anchor": ["bottom", "top", "right", "left"] });
    expect(style.layers[0]?.layout).not.toHaveProperty("text-anchor");
  });

  it("falls back to the style URL when the style cannot be fetched, so MapLibre reports the failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    expect(maplibre.instances[0]?.options.style).toBe("https://tiles.openfreemap.org/styles/positron");
  });

  it("adds zoom controls without a compass top-right and a metric scale bottom-right", async () => {
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));

    const controls = maplibre.instances[0]!.addControl.mock.calls.map(([control, position]) => [(control as { kind: string }).kind, position]);
    expect(controls).toEqual([
      ["navigation", "top-right"],
      ["scale", "bottom-right"],
    ]);
    expect(maplibre.NavigationControl).toHaveBeenCalledWith({ showCompass: false });
    expect(maplibre.ScaleControl).toHaveBeenCalledWith({ unit: "metric", maxWidth: 120 });
  });

  it("adds the demo points as one GeoJSON source and one circle layer once the style has loaded", async () => {
    const { POINTS_LAYER_ID, POINTS_SOURCE_ID } = await import("@/components/map/point-layer");
    const { DEMO_MAP_POINTS } = await import("@/data/mock/map-points");
    const { buildMapFeatureCollection } = await import("@/lib/map-geojson");
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;

    expect(instance.addSource).not.toHaveBeenCalled();
    instance.emit("load");
    expect(instance.addSource).toHaveBeenCalledTimes(1);
    expect(instance.addSource).toHaveBeenCalledWith(POINTS_SOURCE_ID, { type: "geojson", data: buildMapFeatureCollection(DEMO_MAP_POINTS), cluster: true, clusterRadius: 48, clusterMaxZoom: 12 });
    expect(instance.addLayer).toHaveBeenCalledTimes(3);
    expect(instance.addLayer.mock.calls.map(([layer]) => (layer as { id: string }).id)).toEqual(["urdais-point-clusters", "urdais-point-cluster-count", POINTS_LAYER_ID]);
    expect(instance.addLayer.mock.calls[2]?.[0]).toMatchObject({ id: POINTS_LAYER_ID, type: "circle", source: POINTS_SOURCE_ID, filter: ["!", ["has", "point_count"]] });
    expect(instance.addLayer.mock.calls.every(([, beforeId]) => beforeId === "label_city")).toBe(true);

    const supplied = (instance.addSource.mock.calls[0]?.[1] as { data: { features: Array<{ properties: { mappingStatus: string; category?: string } }> } }).data;
    const statuses = new Set(supplied.features.map((feature) => feature.properties.mappingStatus));
    expect(statuses).toEqual(new Set(["mapped", "unmapped"]));
    const categories = new Set(supplied.features.filter((feature) => feature.properties.mappingStatus === "mapped").map((feature) => feature.properties.category));
    expect(categories).toEqual(new Set(["data_center", "compute_cluster", "power_infrastructure", "semiconductor_fab"]));
  });

  it("does not duplicate the source or layer if load fires again", async () => {
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    instance.emit("load");
    instance.emit("load");
    expect(instance.addSource).toHaveBeenCalledTimes(1);
    expect(instance.addLayer).toHaveBeenCalledTimes(3);
  });

  it("skips adding points when the map was unmounted before its style loaded", async () => {
    const UrdaisMap = await loadComponent();
    const { unmount } = render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    unmount();
    instance.emit("load");
    expect(instance.addSource).not.toHaveBeenCalled();
    expect(instance.remove).toHaveBeenCalledTimes(1);
  });

  it("wires the point interactions once after load and removes them, and any open popup, on unmount", async () => {
    const { POINTS_LAYER_ID } = await import("@/components/map/point-layer");
    const UrdaisMap = await loadComponent();
    const { unmount } = render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    instance.emit("load");
    expect(instance.handlerCount("click", POINTS_LAYER_ID)).toBe(1);
    expect(instance.handlerCount("mousemove", POINTS_LAYER_ID)).toBe(1);
    expect(instance.handlerCount("mouseleave", POINTS_LAYER_ID)).toBe(1);
    expect(instance.handlerCount("click", "urdais-point-clusters")).toBe(1);
    expect(instance.handlerCount("mousemove", "urdais-point-clusters")).toBe(1);
    expect(instance.handlerCount("mouseleave", "urdais-point-clusters")).toBe(1);
    expect(instance.handlerCount("moveend")).toBe(1);

    instance.emit("click", POINTS_LAYER_ID, { features: [{ properties: { name: "Demo Point 1", mappingStatus: "mapped", category: "compute_cluster", address: "Atlanta, Georgia, USA", contactEmail: "demo@example.com" }, geometry: { type: "Point", coordinates: [-84.388, 33.749] } }] });
    expect(maplibre.popups).toHaveLength(1);
    expect(maplibre.popups[0]?.content?.textContent).toContain("Demo Point 1");
    expect(maplibre.popups[0]?.content?.textContent).toContain("Compute Cluster");

    instance.emit("click", POINTS_LAYER_ID, { features: [{ properties: { name: "Demo Point 2", mappingStatus: "unmapped" }, geometry: { type: "Point", coordinates: [0, 0] } }] });
    expect(maplibre.popups).toHaveLength(1);

    unmount();
    expect(maplibre.popups[0]?.removed).toBe(true);
    expect(instance.handlerCount("click", POINTS_LAYER_ID)).toBe(0);
    expect(instance.handlerCount("mousemove", POINTS_LAYER_ID)).toBe(0);
    expect(instance.handlerCount("mouseleave", POINTS_LAYER_ID)).toBe(0);
    expect(instance.handlerCount("click", "urdais-point-clusters")).toBe(0);
    expect(instance.handlerCount("mousemove", "urdais-point-clusters")).toBe(0);
    expect(instance.handlerCount("moveend")).toBe(0);
    expect(instance.remove).toHaveBeenCalledTimes(1);
  });

  it("feeds the clustered source the visible subset on change, without recreating the map, source, layers, or viewport", async () => {
    const { DEFAULT_MAP_VISIBILITY, filterPointCollection } = await import("@/components/map/map-point-style");
    const { DEMO_MAP_POINTS } = await import("@/data/mock/map-points");
    const { buildMapFeatureCollection } = await import("@/lib/map-geojson");
    const UrdaisMap = await loadComponent();
    const { rerender } = render(<UrdaisMap visibility={DEFAULT_MAP_VISIBILITY} />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    instance.emit("load");
    const source = instance.source()!;
    expect(source.setData).not.toHaveBeenCalled();

    const hidden = { ...DEFAULT_MAP_VISIBILITY, power_infrastructure: false, unmapped: false };
    rerender(<UrdaisMap visibility={hidden} />);
    expect(source.setData).toHaveBeenCalledTimes(1);
    const expected = filterPointCollection(buildMapFeatureCollection(DEMO_MAP_POINTS), hidden);
    expect(source.setData).toHaveBeenLastCalledWith(expected);
    const supplied = source.setData.mock.calls[0]?.[0] as { features: Array<{ properties: { mappingStatus: string; category?: string } }> };
    expect(supplied.features.some((feature) => feature.properties.mappingStatus === "unmapped" || feature.properties.category === "power_infrastructure")).toBe(false);
    expect(supplied.features.length).toBeGreaterThan(0);
    expect(maplibre.Map).toHaveBeenCalledTimes(1);
    expect(instance.addSource).toHaveBeenCalledTimes(1);
    expect(instance.addLayer).toHaveBeenCalledTimes(3);
    expect(instance.remove).not.toHaveBeenCalled();
    expect(instance.easeTo).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);

    const allOff = { data_center: false, compute_cluster: false, power_infrastructure: false, semiconductor_fab: false, unmapped: false };
    rerender(<UrdaisMap visibility={allOff} />);
    expect(source.setData).toHaveBeenLastCalledWith({ type: "FeatureCollection", features: [] });
    rerender(<UrdaisMap visibility={DEFAULT_MAP_VISIBILITY} />);
    expect(source.setData).toHaveBeenLastCalledWith(buildMapFeatureCollection(DEMO_MAP_POINTS));
  });

  it("seeds the source with the latest visibility if it changed before the style loaded", async () => {
    const { DEFAULT_MAP_VISIBILITY, filterPointCollection } = await import("@/components/map/map-point-style");
    const { DEMO_MAP_POINTS } = await import("@/data/mock/map-points");
    const { buildMapFeatureCollection } = await import("@/lib/map-geojson");
    const UrdaisMap = await loadComponent();
    const { rerender } = render(<UrdaisMap visibility={DEFAULT_MAP_VISIBILITY} />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    const hidden = { ...DEFAULT_MAP_VISIBILITY, data_center: false };
    rerender(<UrdaisMap visibility={hidden} />);
    expect(instance.addSource).not.toHaveBeenCalled();
    instance.emit("load");
    expect(instance.addSource.mock.calls[0]?.[1]).toMatchObject({ data: filterPointCollection(buildMapFeatureCollection(DEMO_MAP_POINTS), hidden) });
    expect(instance.source()!.setData).not.toHaveBeenCalled();
  });

  it("zooms into a clicked cluster through the source's expansion zoom and never opens a popup", async () => {
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    instance.emit("load");
    instance.emit("click", "urdais-point-clusters", { features: [{ properties: { cluster: true, cluster_id: 42, point_count: 6 }, geometry: { type: "Point", coordinates: [-77.4, 39.0] } }] });
    await waitFor(() => expect(instance.easeTo).toHaveBeenCalledTimes(1));
    expect(instance.source()!.getClusterExpansionZoom).toHaveBeenCalledWith(42);
    expect(instance.easeTo).toHaveBeenCalledWith({ center: [-77.4, 39.0], zoom: 7 });
    expect(maplibre.popups).toHaveLength(0);
  });

  it("closes an open popup once its point is no longer individually rendered after the camera moves", async () => {
    const { POINTS_LAYER_ID } = await import("@/components/map/point-layer");
    const UrdaisMap = await loadComponent();
    render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    instance.emit("load");
    instance.emit("click", POINTS_LAYER_ID, { features: [{ properties: { name: "Demo Point 3", mappingStatus: "mapped", category: "data_center" }, geometry: { type: "Point", coordinates: [-0.128, 51.507] } }] });
    expect(maplibre.popups).toHaveLength(1);
    instance.emit("moveend");
    expect(maplibre.popups[0]?.removed).toBe(false);
    instance.queryRenderedFeatures.mockReturnValueOnce([]);
    instance.emit("moveend");
    expect(maplibre.popups[0]?.removed).toBe(true);
  });

  it("closes an open popup when its point's group is hidden", async () => {
    const { DEFAULT_MAP_VISIBILITY } = await import("@/components/map/map-point-style");
    const { POINTS_LAYER_ID } = await import("@/components/map/point-layer");
    const UrdaisMap = await loadComponent();
    const { rerender } = render(<UrdaisMap visibility={DEFAULT_MAP_VISIBILITY} />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    const instance = maplibre.instances[0]!;
    instance.emit("load");
    instance.emit("click", POINTS_LAYER_ID, { features: [{ properties: { name: "Demo Point 3", mappingStatus: "mapped", category: "data_center" }, geometry: { type: "Point", coordinates: [-0.128, 51.507] } }] });
    expect(maplibre.popups).toHaveLength(1);
    rerender(<UrdaisMap visibility={{ ...DEFAULT_MAP_VISIBILITY, compute_cluster: false }} />);
    expect(maplibre.popups[0]?.removed).toBe(false);
    rerender(<UrdaisMap visibility={{ ...DEFAULT_MAP_VISIBILITY, compute_cluster: false, data_center: false }} />);
    expect(maplibre.popups[0]?.removed).toBe(true);
  });

  it("removes the map on unmount", async () => {
    const UrdaisMap = await loadComponent();
    const { unmount } = render(<UrdaisMap />);
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalledTimes(1));
    unmount();
    expect(maplibre.instances[0]?.remove).toHaveBeenCalledTimes(1);
  });

  it("survives React's development double mount with exactly one live map", async () => {
    const UrdaisMap = await loadComponent();
    render(
      <StrictMode>
        <UrdaisMap />
      </StrictMode>,
    );
    await waitFor(() => expect(maplibre.Map).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));

    const live = maplibre.instances.filter((instance) => !instance.remove.mock.calls.length);
    expect(live).toHaveLength(1);
  });

  it("never touches MapLibre before mounting, so the route can render on the server", async () => {
    await loadComponent();
    expect(maplibre.Map).not.toHaveBeenCalled();
    expect(maplibre.setWorkerUrl).not.toHaveBeenCalled();
  });

  it("exposes the map as a labelled region that fills its parent", async () => {
    const UrdaisMap = await loadComponent();
    const { getByRole } = render(<UrdaisMap />);
    const region = getByRole("region", { name: "World map" });
    expect(region).toHaveClass("h-full", "w-full");
  });
});
