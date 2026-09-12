import type { StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import { applyBasemapOverrides } from "@/components/map/basemap-style";

/** A cut-down Positron: the layers the overrides target plus neighbours they must leave alone. */
function positronLike(): StyleSpecification {
  return {
    version: 8,
    sources: { openmaptiles: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "rgb(242,243,240)" } },
      {
        id: "label_city",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": ["get", "name"], "text-anchor": "bottom", "text-offset": [0, -0.1], "text-size": 13, "text-font": ["Noto Sans Regular"] },
        paint: { "text-color": "#000" },
      },
      {
        id: "label_state",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": ["get", "name"], "text-transform": "uppercase", "text-size": 10 },
      },
      {
        id: "label_country_1",
        type: "symbol",
        source: "openmaptiles",
        "source-layer": "place",
        layout: { "text-field": ["get", "name"], "text-size": 17 },
      },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#c7cdd3" } },
    ],
  };
}

const layer = (style: StyleSpecification, id: string) => style.layers.find((candidate) => candidate.id === id) as SymbolLayerSpecification;

describe("applyBasemapOverrides", () => {
  it("shrinks city text and lets the label choose an anchor instead of the fixed bottom anchor", () => {
    const city = layer(applyBasemapOverrides(positronLike()), "label_city");
    expect(city.layout?.["text-variable-anchor"]).toEqual(["bottom", "top", "right", "left"]);
    expect(city.layout?.["text-radial-offset"]).toBe(0.35);
    expect(city.layout?.["text-size"]).toEqual(["interpolate", ["exponential", 1.2], ["zoom"], 4, 10.5, 7, 12, 11, 16]);
    expect(city.layout).not.toHaveProperty("text-anchor");
    expect(city.layout).not.toHaveProperty("text-offset");
  });

  it("keeps everything it does not override, including the text field and paint", () => {
    const city = layer(applyBasemapOverrides(positronLike()), "label_city");
    expect(city.layout?.["text-field"]).toEqual(["get", "name"]);
    expect(city.layout?.["text-font"]).toEqual(["Noto Sans Regular"]);
    expect(city.paint).toEqual({ "text-color": "#000" });
  });

  it("lets state labels reposition but leaves their size and casing to Positron", () => {
    const state = layer(applyBasemapOverrides(positronLike()), "label_state");
    expect(state.layout?.["text-variable-anchor"]).toEqual(["center", "top", "bottom", "left", "right"]);
    expect(state.layout?.["text-size"]).toBe(10);
    expect(state.layout?.["text-transform"]).toBe("uppercase");
  });

  it("leaves untargeted layers, sources, and the layer order untouched", () => {
    const input = positronLike();
    const output = applyBasemapOverrides(input);
    expect(output.layers.map((candidate) => candidate.id)).toEqual(input.layers.map((candidate) => candidate.id));
    expect(layer(output, "label_country_1")).toEqual(layer(input, "label_country_1"));
    expect(output.layers[0]).toEqual(input.layers[0]);
    expect(output.layers[4]).toEqual(input.layers[4]);
    expect(output.sources).toEqual(input.sources);
    expect(output.version).toBe(8);
  });

  it("does not mutate the style it is given", () => {
    const input = positronLike();
    const snapshot = JSON.parse(JSON.stringify(input));
    applyBasemapOverrides(input);
    expect(input).toEqual(snapshot);
  });

  it("ignores a style whose layer ids no longer match, so a Positron update cannot break the map", () => {
    const input = positronLike();
    input.layers = input.layers.map((candidate) => ({ ...candidate, id: `renamed_${candidate.id}` }) as typeof candidate);
    expect(applyBasemapOverrides(input)).toEqual(input);
  });

  it("only patches symbol layers even if a non-symbol layer shares a targeted id", () => {
    const input = positronLike();
    input.layers.push({ id: "label_town", type: "fill", source: "openmaptiles", "source-layer": "place" });
    const town = applyBasemapOverrides(input).layers.at(-1);
    expect(town).toEqual({ id: "label_town", type: "fill", source: "openmaptiles", "source-layer": "place" });
  });
});
