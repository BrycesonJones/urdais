import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { POINTS_LAYER_ID, POINTS_SOURCE_ID, addPointLayer } from "@/components/map/point-layer";
import { buildMapFeatureCollection } from "@/lib/map-geojson";

const collection = buildMapFeatureCollection([{ id: "p1", name: "P1", longitude: 1, latitude: 2 }]);

/** A map stub that remembers what was added, with a Positron-like layer order. */
function stubMap() {
  const sources = new Map<string, unknown>();
  const layers = new Map<string, unknown>();
  const map = {
    getSource: vi.fn((id: string) => sources.get(id)),
    addSource: vi.fn((id: string, source: unknown) => sources.set(id, source)),
    getLayer: vi.fn((id: string) => layers.get(id)),
    addLayer: vi.fn((layer: { id: string; paint?: Record<string, unknown> }, beforeId?: string) => layers.set(layer.id, { layer, beforeId })),
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
  it("adds one GeoJSON source with the collection and one circle layer with the expected ids", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addSource).toHaveBeenCalledWith(POINTS_SOURCE_ID, { type: "geojson", data: collection });
    expect(map.addLayer).toHaveBeenCalledTimes(1);
    expect(map.addLayer.mock.calls[0]?.[0]).toMatchObject({ id: POINTS_LAYER_ID, type: "circle", source: POINTS_SOURCE_ID });
    expect(POINTS_SOURCE_ID).toBe("urdais-points");
    expect(POINTS_LAYER_ID).toBe("urdais-points-circle");
  });

  it("inserts the circle layer beneath the basemap's first label layer", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    expect(map.addLayer.mock.calls[0]?.[1]).toBe("label_city");
  });

  it("appends on top when the style has no label layers", () => {
    const map = stubMap();
    map.getStyle.mockReturnValue({ layers: [{ id: "background", type: "background" }] });
    addPointLayer(map, collection);
    expect(map.addLayer.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("never adds the source or layer twice", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    addPointLayer(map, collection);
    addPointLayer(map, collection);
    expect(map.addSource).toHaveBeenCalledTimes(1);
    expect(map.addLayer).toHaveBeenCalledTimes(1);
  });

  it("uses a single neutral treatment with no data-driven colour yet", () => {
    const map = stubMap();
    addPointLayer(map, collection);
    const paint = map.addLayer.mock.calls[0]?.[0].paint ?? {};
    expect(typeof paint["circle-color"]).toBe("string");
    expect(paint["circle-stroke-width"]).toBe(1);
  });
});
