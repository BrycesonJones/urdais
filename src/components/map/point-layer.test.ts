import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAP_VISIBILITY, POINT_COLOR_EXPRESSION, filterPointCollection } from "@/components/map/map-point-style";
import { CLUSTERS_LAYER_ID, CLUSTER_COUNT_LAYER_ID, CLUSTER_MAX_ZOOM, CLUSTER_RADIUS, POINTS_LAYER_ID, POINTS_SOURCE_ID, addPointLayer, applyPointVisibility } from "@/components/map/point-layer";
import { buildMapFeatureCollection } from "@/lib/map-geojson";

const collection = buildMapFeatureCollection([
  { id: "p1", name: "P1", longitude: 1, latitude: 2, mappingStatus: "mapped", category: "data_center" },
  { id: "p2", name: "P2", longitude: 3, latitude: 4, mappingStatus: "unmapped" },
]);

/** A map stub that remembers what was added, with a Positron-like layer order. */
function stubMap() {
  const sources = new Map<string, { setData: ReturnType<typeof vi.fn> }>();
  const layers = new Map<string, unknown>();
  const map = {
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, source: unknown) => sources.set(id, { ...(source as object), setData: vi.fn() })),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string; paint?: Record<string, unknown> }, beforeId?: string) => layers.set(layer.id, { layer, beforeId })),
    setFilter: vi.fn(),
    getStyle: vi.fn(() => ({
      layers: [
        { id: "background", type: "background" },
        { id: "water", type: "fill" },
        { id: "highway_motorway_inner", type: "line" },
        { id: "label_city", type: "symbol" },
        { id: "label_country_1", type: "symbol" },
      ],
    })),
  };
  return map as unknown as MapLibreMap & typeof map;
}

describe("addPointLayer", () => {
  it("adds one clustered GeoJSON source and three layers with the expected ids", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addSource).toHaveBeenCalledWith(POINTS_SOURCE_ID, { type: "geojson", data: collection, cluster: true, clusterRadius: CLUSTER_RADIUS, clusterMaxZoom: CLUSTER_MAX_ZOOM });
    expect(CLUSTER_RADIUS).toBe(48);
    expect(CLUSTER_MAX_ZOOM).toBe(12);
    const added = map.addLayer.mock.calls.map(([layer]) => layer as { id: string; type: string; source: string });
    expect(added.map((layer) => layer.id)).toEqual([CLUSTERS_LAYER_ID, CLUSTER_COUNT_LAYER_ID, POINTS_LAYER_ID]);
    expect(added.map((layer) => layer.type)).toEqual(["circle", "symbol", "circle"]);
    expect(added.every((layer) => layer.source === POINTS_SOURCE_ID)).toBe(true);
    expect([POINTS_SOURCE_ID, CLUSTERS_LAYER_ID, CLUSTER_COUNT_LAYER_ID, POINTS_LAYER_ID]).toEqual(["urdais-points", "urdais-point-clusters", "urdais-point-cluster-count", "urdais-points-circle"]);
  });

  it("seeds the source with the visible subset when a visibility state is given", () => {
    const map = stubMap();
    const hidden = { ...DEFAULT_MAP_VISIBILITY, unmapped: false };
    addPointLayer(map, collection, hidden);
    expect(map.addSource.mock.calls[0]?.[1]).toMatchObject({ data: filterPointCollection(collection, hidden) });
  });

  it("filters clusters and individual points by point_count and inserts all three beneath the first label layer", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    const [clusters, count, points] = map.addLayer.mock.calls.map(([layer]) => layer as { filter?: unknown });
    expect(clusters?.filter).toEqual(["has", "point_count"]);
    expect(count?.filter).toEqual(["has", "point_count"]);
    expect(points?.filter).toEqual(["!", ["has", "point_count"]]);
    expect(map.addLayer.mock.calls.map(([, beforeId]) => beforeId)).toEqual(["label_city", "label_city", "label_city"]);
  });

  it("steps the cluster radius by point count and labels clusters with the abbreviated count", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    const [clusters, count] = map.addLayer.mock.calls.map(([layer]) => layer as { paint?: Record<string, unknown>; layout?: Record<string, unknown> });
    expect(clusters?.paint?.["circle-radius"]).toEqual(["step", ["get", "point_count"], 14, 10, 18, 50, 24]);
    expect(typeof clusters?.paint?.["circle-color"]).toBe("string");
    expect(count?.layout?.["text-field"]).toEqual(["coalesce", ["get", "point_count_abbreviated"], ["to-string", ["get", "point_count"]]]);
    expect(count?.layout?.["text-allow-overlap"]).toBe(true);
  });

  it("appends on top when the style has no label layers", () => {
    const map = stubMap();
    map.getStyle.mockReturnValue({ layers: [{ id: "background", type: "background" }] });
    addPointLayer(map, collection);
    expect(map.addLayer.mock.calls.map(([, beforeId]) => beforeId)).toEqual([undefined, undefined, undefined]);
  });

  it("never adds the source or any layer twice", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    addPointLayer(map, collection);
    addPointLayer(map, collection);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(3);
  });

  it("colours the individual point layer with the shared status-then-category expression", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    const points = map.addLayer.mock.calls[2]?.[0] as { paint?: Record<string, unknown> };
    expect(points?.paint?.["circle-color"]).toBe(POINT_COLOR_EXPRESSION);
  });
});

describe("applyPointVisibility", () => {
  it("replaces the source data with the visible subset without touching the source or layers", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    const hidden = { ...DEFAULT_MAP_VISIBILITY, unmapped: false };
    applyPointVisibility(map, collection, hidden);
    const source = map.getSource(POINTS_SOURCE_ID) as unknown as { setData: ReturnType<typeof vi.fn> };
    expect(source.setData).toHaveBeenCalledTimes(1);
    expect(source.setData).toHaveBeenCalledWith(filterPointCollection(collection, hidden));
    expect((source.setData.mock.calls[0]?.[0] as { features: Array<{ id: string }> }).features.map((item) => item.id)).toEqual(["p1"]);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(3);
  });

  it("feeds the source an empty collection when every group is off", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    applyPointVisibility(map, collection, { data_center: false, compute_cluster: false, power_infrastructure: false, semiconductor_fab: false, unmapped: false });
    const source = map.getSource(POINTS_SOURCE_ID) as unknown as { setData: ReturnType<typeof vi.fn> };
    expect(source.setData.mock.calls[0]?.[0]).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("is a no-op before the source exists", () => {
    const map = stubMap();
    expect(() => applyPointVisibility(map, collection, DEFAULT_MAP_VISIBILITY)).not.toThrow();
    expect(map.addSource).not.toHaveBeenCalled();
  });
});
