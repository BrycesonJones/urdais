import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { POINTS_LAYER_ID } from "@/components/map/point-layer";
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
  const map = {
    getCanvas: () => canvas,
    on: vi.fn((event: string, layer: string, handler: (event: unknown) => void) => handlers.set(`${event}:${layer}`, [...(handlers.get(`${event}:${layer}`) ?? []), handler])),
    off: vi.fn((event: string, layer: string, handler: (event: unknown) => void) => handlers.set(`${event}:${layer}`, (handlers.get(`${event}:${layer}`) ?? []).filter((candidate) => candidate !== handler))),
    fire: (event: string, layer: string, payload: unknown) => handlers.get(`${event}:${layer}`)?.forEach((handler) => handler(payload)),
    registered: (event: string, layer: string) => handlers.get(`${event}:${layer}`)?.length ?? 0,
  };
  return { map: map as unknown as MapLibreMap & typeof map, canvas };
}

const feature = (properties: Record<string, unknown>, coordinates = [-0.128, 51.507]) => ({ properties, geometry: { type: "Point", coordinates } });
const mapped = feature({ name: "Demo Point 3", mappingStatus: "mapped", operator: "Demo Operator", location: "London, United Kingdom" });
const unmapped = feature({ name: "Demo Point 4", mappingStatus: "unmapped" }, [8.682, 50.111]);

describe("readMappedPointProfile", () => {
  it("returns the profile for a mapped feature and drops blank optional fields", () => {
    expect(readMappedPointProfile(mapped)).toEqual({ name: "Demo Point 3", operator: "Demo Operator", location: "London, United Kingdom" });
    expect(readMappedPointProfile(feature({ name: "Only name", mappingStatus: "mapped", location: "  ", operator: 7 }))).toEqual({ name: "Only name" });
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
  it("renders the name and labelled operator and location as text, never as markup", () => {
    const card = buildProfileCard({ name: "<b>Demo</b> Point", operator: "Demo Operator", location: "Atlanta, Georgia, USA" });
    expect(card.querySelector("p")?.textContent).toBe("<b>Demo</b> Point");
    expect(card.querySelector("b")).toBeNull();
    expect([...card.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Operator:", "Location:"]);
    expect([...card.querySelectorAll("dd")].map((detail) => detail.textContent)).toEqual(["Demo Operator", "Atlanta, Georgia, USA"]);
  });

  it("omits the detail list entirely when there is nothing beyond the name", () => {
    const card = buildProfileCard({ name: "Demo Point 7" });
    expect(card.textContent).toBe("Demo Point 7");
    expect(card.querySelector("dl")).toBeNull();
  });
});

describe("attachPointInteractions", () => {
  it("registers click, mousemove, and mouseleave on the circle layer once and removes them on dispose", () => {
    const { map } = stubMap();
    const dispose = attachPointInteractions(map, stubPopup().Popup);
    for (const event of ["click", "mousemove", "mouseleave"]) expect(map.registered(event, POINTS_LAYER_ID)).toBe(1);
    expect(map.on).toHaveBeenCalledTimes(3);
    dispose();
    for (const event of ["click", "mousemove", "mouseleave"]) expect(map.registered(event, POINTS_LAYER_ID)).toBe(0);
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
    expect(instances[0]?.content?.textContent).toContain("Demo Operator");
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
    const dispose = attachPointInteractions(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [mapped] });
    dispose();
    expect(instances[0]?.removed).toBe(true);
  });

  it("forgets a popup the user closed, so a later dispose does not remove it twice", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const dispose = attachPointInteractions(map, Popup);
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
});
