import { render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const maplibre = vi.hoisted(() => {
  const instances: Array<{ options: Record<string, unknown>; addControl: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> }> = [];
  const Map = vi.fn(function (this: unknown, options: Record<string, unknown>) {
    const instance = { options, addControl: vi.fn(), remove: vi.fn() };
    instances.push(instance);
    return instance;
  });
  const NavigationControl = vi.fn(function (this: unknown, options: unknown) {
    return { kind: "navigation", options };
  });
  const ScaleControl = vi.fn(function (this: unknown, options: unknown) {
    return { kind: "scale", options };
  });
  return { instances, Map, NavigationControl, ScaleControl, setWorkerUrl: vi.fn() };
});

vi.mock("maplibre-gl", () => ({
  Map: maplibre.Map,
  NavigationControl: maplibre.NavigationControl,
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
    maplibre.Map.mockClear();
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
