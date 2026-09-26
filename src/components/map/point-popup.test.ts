import type { Map as MapLibreMap } from "maplibre-gl";
import { describe, expect, it, vi } from "vitest";

import { CLUSTERS_LAYER_ID, POINTS_LAYER_ID } from "@/components/map/point-layer";
import {
  attachPointInteractions,
  buildCoordinateFacilityIndex,
  buildFacilityGroupCard,
  buildProfileCard,
  facilitiesAtCoordinate,
  readPointProfile,
  readSources,
} from "@/components/map/point-popup";
import type { MapPointCollection, MapPointFeature } from "@/lib/map-geojson";

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
  const source = {
    getClusterExpansionZoom: vi.fn(async (id: number) => (id === 99 ? Promise.reject(new Error("unknown cluster")) : 8)),
    getClusterLeaves: vi.fn(async (): Promise<MapPointFeature[]> => []),
  };
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

const feature = (properties: Record<string, unknown>, coordinates = [-0.128, 51.507], id = String(properties.name ?? "feature")): MapPointFeature => ({
  type: "Feature",
  id,
  properties: properties as MapPointFeature["properties"],
  geometry: { type: "Point", coordinates },
});
const collection = (...features: MapPointFeature[]): MapPointCollection => ({ type: "FeatureCollection", features });
const SOURCES_JSON = JSON.stringify([{ publisher: "CSC", url: "https://example.com/csc" }]);
const point = feature({
  name: "CSC Kajaani Data Center",
  category: "data_center",
  address: "Tehdaskatu 15, Kajaani, Kainuu, Finland",
  ownerName: "CSC – IT Center for Science",
  operatorName: "CSC",
  lifecycleStatus: "operational",
  lastVerifiedDate: "2026-09-17",
  sourcesJson: SOURCES_JSON,
});
const nameless = feature({ category: "data_center" }, [8.682, 50.111]);
const LAGOS_COORDINATES = [3.4202447, 6.4270355];
const los1 = feature(
  {
    name: "Digital Realty LOS1",
    category: "data_center",
    operatorName: "Digital Realty",
    address: "8A Saka Tinubu Street, Victoria Island, Lagos, Nigeria",
  },
  LAGOS_COORDINATES,
  "digital-realty-los1",
);
const los2 = feature(
  {
    name: "Digital Realty LOS2",
    category: "data_center",
    operatorName: "Digital Realty",
    address: "8B Saka Tinubu Street, Victoria Island, Lagos, Nigeria",
  },
  LAGOS_COORDINATES,
  "digital-realty-los2",
);

const wire = (map: MapLibreMap, Popup: new () => never, features: MapPointFeature[] = [point]) =>
  attachPointInteractions(map, Popup, collection(...features));

describe("readSources", () => {
  it("parses the encoded citation list", () => {
    expect(readSources(SOURCES_JSON)).toEqual([{ publisher: "CSC", url: "https://example.com/csc" }]);
  });

  it("returns none rather than throwing on anything malformed", () => {
    for (const bad of ["", "{", "null", '"a string"', "[1,2]", undefined, 7, JSON.stringify([{ publisher: "X" }])]) {
      expect(readSources(bad), String(bad)).toEqual([]);
    }
  });

  it("drops a source whose URL is not http(s), so no property can become a javascript: link", () => {
    expect(readSources(JSON.stringify([{ publisher: "X", url: "javascript:alert(1)" }, { publisher: "Y", url: "https://ok.example" }]))).toEqual([
      { publisher: "Y", url: "https://ok.example" },
    ]);
  });
});

describe("readPointProfile", () => {
  it("returns the profile with readable wording for the category and the status", () => {
    expect(readPointProfile(point)).toEqual({
      name: "CSC Kajaani Data Center",
      category: "Data Center",
      address: "Tehdaskatu 15, Kajaani, Kainuu, Finland",
      owner: "CSC – IT Center for Science",
      operator: "CSC",
      status: "Operational",
      lastVerified: "2026-09-17",
      sources: [{ publisher: "CSC", url: "https://example.com/csc" }],
    });
  });

  it("omits the operator when it is the owner, because repeating a company name says nothing", () => {
    const profile = readPointProfile(feature({ name: "Meta New Albany", category: "data_center", ownerName: "Meta", operatorName: "Meta" }));
    expect(profile).toEqual({ name: "Meta New Albany", category: "Data Center", owner: "Meta" });
  });

  it("never shows a raw category or status value, and tolerates a missing or unknown one", () => {
    expect(readPointProfile(feature({ name: "Fab", category: "semiconductor_fab" }))).toEqual({ name: "Fab", category: "Semiconductor Fab" });
    expect(readPointProfile(feature({ name: "Odd", category: "gpu" }))).toEqual({ name: "Odd" });
    expect(readPointProfile(feature({ name: "None", category: 9 }))).toEqual({ name: "None" });
    expect(readPointProfile(feature({ name: "Status", category: "data_center", lifecycleStatus: "mothballed" }))).toEqual({ name: "Status", category: "Data Center" });
    expect(readPointProfile(feature({ name: "Cluster", category: "gpu_compute_cluster" }))).toEqual({ name: "Cluster", category: "GPU Compute Cluster" });
  });

  it("returns null for unnamed or malformed features without throwing", () => {
    expect(readPointProfile(nameless)).toBeNull();
    expect(readPointProfile(feature({ name: "" }))).toBeNull();
    expect(readPointProfile({ properties: null as never })).toBeNull();
    expect(readPointProfile(undefined)).toBeNull();
  });
});

describe("buildProfileCard", () => {
  it("renders every row as text, never as markup, and never a raw enum value", () => {
    const card = buildProfileCard({
      name: "<b>Demo</b> Point",
      category: "GPU Compute Cluster",
      address: "9663 87th Ave SE, Ellendale, ND, United States",
      owner: "Applied Digital",
      operator: "CoreWeave",
      status: "Operational, expanding",
      lastVerified: "2026-09-17",
    });
    expect(card.querySelector("p")?.textContent).toBe("<b>Demo</b> Point");
    expect(card.querySelector("b")).toBeNull();
    expect([...card.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Category:", "Address:", "Owner:", "Operator:", "Status:", "Checked:"]);
    expect(card.textContent).not.toContain("gpu_compute_cluster");
  });

  it("shows the public verification level without creating a map category", () => {
    expect(readPointProfile(feature({ name: "Research site", category: "data_center", verificationStatus: "research" }))).toEqual({
      name: "Research site",
      category: "Data Center",
      verification: "Research",
    });
    const card = buildProfileCard({ name: "Research site", verification: "Research" });
    expect(card.textContent).toContain("Verification:Research");
  });

  it("renders each source as a new-tab link whose href is the source URL", () => {
    const card = buildProfileCard({
      name: "Susquehanna Steam Electric Station",
      sources: [
        { publisher: "Talen Energy", url: "https://example.com/powering-data" },
        { publisher: "Talen Energy IR", url: "https://example.com/sale" },
      ],
    });
    const links = [...card.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["https://example.com/powering-data", "https://example.com/sale"]);
    expect(links.map((link) => link.getAttribute("rel"))).toEqual(["noreferrer noopener", "noreferrer noopener"]);
    expect(card.querySelector("dt")?.textContent).toBe("Sources:");
    expect(card.innerHTML).not.toContain("<script");
  });

  it("uses the singular label for one source", () => {
    const card = buildProfileCard({ name: "Demo", sources: [{ publisher: "NIST", url: "https://example.com/nist" }] });
    expect([...card.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Source:"]);
  });

  it("omits rows it has no value for", () => {
    const addressOnly = buildProfileCard({ name: "Demo", category: "Data Center", address: "Singapore" });
    expect([...addressOnly.querySelectorAll("dt")].map((term) => term.textContent)).toEqual(["Category:", "Address:"]);
    expect(addressOnly.querySelector("a")).toBeNull();
  });

  it("omits the detail list entirely when there is nothing beyond the name", () => {
    const card = buildProfileCard({ name: "Demo Point 7" });
    expect(card.textContent).toBe("Demo Point 7");
    expect(card.querySelector("dl")).toBeNull();
  });
});

describe("exact-coordinate facility groups", () => {
  it("groups exact coordinates, preserves research keys, deduplicates ids, and orders independently of input order", () => {
    const alpha = feature({ name: "Alpha", category: "data_center", operatorName: "A operator" }, LAGOS_COORDINATES, "alpha");
    const index = buildCoordinateFacilityIndex(collection(los2, alpha, los1, los1));
    expect(facilitiesAtCoordinate(index, LAGOS_COORDINATES).map((member) => member.researchKey)).toEqual([
      "alpha",
      "digital-realty-los1",
      "digital-realty-los2",
    ]);
    expect(facilitiesAtCoordinate(index, [3.4202448, 6.4270355])).toEqual([]);
  });

  it("renders two, three, and six-member groups as keyboard-operable facility buttons", () => {
    for (const size of [2, 3, 6]) {
      const features = Array.from({ length: size }, (_, index) =>
        feature(
          { name: `Facility ${index + 1}`, category: "data_center", operatorName: "Operator", address: `${index + 1} Main Street` },
          LAGOS_COORDINATES,
          `facility-${index + 1}`,
        ),
      );
      const members = facilitiesAtCoordinate(buildCoordinateFacilityIndex(collection(...features)), LAGOS_COORDINATES);
      const selected: string[] = [];
      const card = buildFacilityGroupCard(members, (member) => selected.push(member.researchKey));
      expect(card.getAttribute("aria-label")).toBe(`${size} facilities at this location`);
      expect(card.className).toContain("overflow-y-auto");
      const buttons = [...card.querySelectorAll("button")];
      expect(buttons).toHaveLength(size);
      expect(buttons.every((button) => button.type === "button" && button.tabIndex === 0)).toBe(true);
      buttons.at(-1)?.click();
      expect(selected).toEqual([`facility-${size}`]);
    }
  });

  it("shows each member's own operator in a mixed-operator, mixed-category group", () => {
    const host = feature({ name: "Polaris Forge 1", category: "data_center", operatorName: "Applied Digital" }, LAGOS_COORDINATES, "host");
    const cluster = feature({ name: "GPU deployment", category: "gpu_compute_cluster", operatorName: "CoreWeave" }, LAGOS_COORDINATES, "cluster");
    const members = facilitiesAtCoordinate(buildCoordinateFacilityIndex(collection(cluster, host)), LAGOS_COORDINATES);
    const card = buildFacilityGroupCard(members, () => undefined);
    expect(card.textContent).toContain("Applied Digital");
    expect(card.textContent).toContain("CoreWeave");
    expect(card.textContent).toContain("Data Center");
    expect(card.textContent).toContain("GPU Compute Cluster");
  });
});

describe("attachPointInteractions", () => {
  it("registers the point, cluster, and moveend handlers once and removes them on dispose", () => {
    const { map } = stubMap();
    const { dispose } = wire(map, stubPopup().Popup);
    for (const event of ["click", "mousemove", "mouseleave"]) { expect(map.registered(event, POINTS_LAYER_ID)).toBe(1); expect(map.registered(event, CLUSTERS_LAYER_ID)).toBe(1); }
    expect(map.registered("moveend")).toBe(1);
    expect(map.on).toHaveBeenCalledTimes(7);
    dispose();
    for (const event of ["click", "mousemove", "mouseleave"]) { expect(map.registered(event, POINTS_LAYER_ID)).toBe(0); expect(map.registered(event, CLUSTERS_LAYER_ID)).toBe(0); }
    expect(map.registered("moveend")).toBe(0);
  });

  it("opens a popup anchored to a clicked point with its profile and its sources", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    wire(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    expect(instances).toHaveLength(1);
    expect(instances[0]?.lngLat).toEqual([-0.128, 51.507]);
    expect(instances[0]?.added).toBe(true);
    expect(instances[0]?.content?.textContent).toContain("CSC Kajaani Data Center");
    expect(instances[0]?.content?.textContent).toContain("Tehdaskatu 15, Kajaani, Kainuu, Finland");
    expect(instances[0]?.content?.querySelector("a")?.getAttribute("href")).toBe("https://example.com/csc");
    expect(instances[0]?.content?.textContent).toContain("Data Center");
    expect(instances[0]?.options).toMatchObject({ closeButton: true, className: "urdais-point-popup" });
  });

  it("exposes LOS1 and LOS2 independently, supports Back, and reopens at the group list", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    wire(map, Popup, [los2, los1]);

    // The renderer reports LOS2 first; the application index still exposes both.
    map.fire("click", POINTS_LAYER_ID, { features: [los2, los2, los1] });
    expect(instances[0]?.content?.textContent).toContain("2 facilities at this location");
    expect(instances[0]?.content?.querySelectorAll("[data-research-key]")).toHaveLength(2);

    instances[0]?.content?.querySelector<HTMLButtonElement>('[data-research-key="digital-realty-los1"]')?.click();
    expect(instances[0]?.content?.textContent).toContain("Digital Realty LOS1");
    expect(instances[0]?.content?.textContent).toContain("8A Saka Tinubu Street");
    expect(instances[0]?.content?.textContent).not.toContain("Digital Realty LOS2");
    const back = [...(instances[0]?.content?.querySelectorAll("button") ?? [])].find((button) => button.textContent === "Back to facilities");
    expect(back).toBeTruthy();
    back?.click();
    expect(instances[0]?.content?.textContent).toContain("Digital Realty LOS1");
    expect(instances[0]?.content?.textContent).toContain("Digital Realty LOS2");

    instances[0]?.content?.querySelector<HTMLButtonElement>('[data-research-key="digital-realty-los2"]')?.click();
    expect(instances[0]?.content?.textContent).toContain("8B Saka Tinubu Street");
    instances[0]?.handlers.close?.();
    map.fire("click", POINTS_LAYER_ID, { features: [los1] });
    expect(instances[1]?.content?.textContent).toContain("2 facilities at this location");
  });

  it("does nothing for an unnamed point or an empty click", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    wire(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [nameless] });
    map.fire("click", POINTS_LAYER_ID, { features: [] });
    map.fire("click", POINTS_LAYER_ID, {});
    expect(instances).toHaveLength(0);
  });

  it("replaces the open popup when a second mapped point is clicked, so only one exists", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    wire(map, Popup, [point, feature({ name: "Second Point", category: "data_center" }, [-84.388, 33.749])]);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    map.fire("click", POINTS_LAYER_ID, { features: [feature({ name: "Second Point", category: "data_center" }, [-84.388, 33.749])] });
    expect(instances).toHaveLength(2);
    expect(instances[0]?.removed).toBe(true);
    expect(instances[1]?.removed).toBe(false);
  });

  it("removes an open popup on dispose", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const { dispose } = wire(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    dispose();
    expect(instances[0]?.removed).toBe(true);
  });

  it("forgets a popup the user closed, so a later dispose does not remove it twice", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const { dispose } = wire(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    instances[0]?.handlers.close?.();
    const removeSpy = vi.fn();
    instances[0]!.removed = false;
    dispose();
    expect(instances[0]?.removed).toBe(false);
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it("shows a pointer over a point with a profile and restores the cursor on leave", () => {
    const { map, canvas } = stubMap();
    wire(map, stubPopup().Popup);
    map.fire("mousemove", POINTS_LAYER_ID, { features: [point] });
    expect(canvas.style.cursor).toBe("pointer");
    map.fire("mousemove", POINTS_LAYER_ID, { features: [nameless] });
    expect(canvas.style.cursor).toBe("");
    map.fire("mousemove", POINTS_LAYER_ID, { features: [point] });
    map.fire("mouseleave", POINTS_LAYER_ID, {});
    expect(canvas.style.cursor).toBe("");
  });

  it("closes the open popup when its point's group is hidden, and leaves it when another group is", () => {
    const { map, canvas } = stubMap();
    const { Popup, instances } = stubPopup();
    const { setCollection } = wire(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    setCollection(collection(point));
    expect(instances[0]?.removed).toBe(false);
    setCollection(collection());
    expect(instances[0]?.removed).toBe(true);
    expect(canvas.style.cursor).toBe("");
    setCollection(collection());
    expect(instances).toHaveLength(1);
  });

  it("refreshes an open mixed-category group from the currently visible collection", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const host = feature({ name: "Host", category: "data_center", operatorName: "A" }, LAGOS_COORDINATES, "host");
    const cluster = feature({ name: "Cluster", category: "gpu_compute_cluster", operatorName: "B" }, LAGOS_COORDINATES, "cluster");
    const { setCollection } = wire(map, Popup, [host, cluster]);
    map.fire("click", POINTS_LAYER_ID, { features: [cluster] });
    expect(instances[0]?.content?.textContent).toContain("2 facilities at this location");
    setCollection(collection(host));
    expect(instances[0]?.content?.textContent).toContain("Host");
    expect(instances[0]?.content?.textContent).not.toContain("2 facilities at this location");
    expect(instances[0]?.content?.textContent).not.toContain("Cluster");
  });

  it("re-enabling a group after a hide lets the point open a fresh popup", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    const { setCollection } = wire(map, Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    setCollection(collection());
    setCollection(collection(point));
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    expect(instances).toHaveLength(2);
    expect(instances[1]?.removed).toBe(false);
  });

  it("eases into a clicked cluster at the source's expansion zoom, and opens no popup", async () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    wire(map, Popup);
    map.fire("click", CLUSTERS_LAYER_ID, { features: [{ properties: { cluster: true, cluster_id: 7, point_count: 12 }, geometry: { type: "Point", coordinates: [-96.8, 32.8] } }] });
    await vi.waitFor(() => expect(map.easeTo).toHaveBeenCalledTimes(1));
    expect(map.source.getClusterExpansionZoom).toHaveBeenCalledWith(7);
    expect(map.easeTo).toHaveBeenCalledWith({ center: [-96.8, 32.8], zoom: 8 });
    expect(instances).toHaveLength(0);
  });

  it("opens a group when cluster leaves share one exact coordinate instead of expanding forever", async () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    map.source.getClusterExpansionZoom.mockResolvedValueOnce(13);
    map.source.getClusterLeaves.mockResolvedValueOnce([los1, los2]);
    wire(map, Popup, [los1, los2]);
    map.fire("click", CLUSTERS_LAYER_ID, {
      features: [{ properties: { cluster: true, cluster_id: 17, point_count: 2 }, geometry: { type: "Point", coordinates: LAGOS_COORDINATES } }],
    });
    await vi.waitFor(() => expect(instances).toHaveLength(1));
    expect(instances[0]?.content?.textContent).toContain("2 facilities at this location");
    expect(map.easeTo).not.toHaveBeenCalled();
    expect(map.source.getClusterExpansionZoom).toHaveBeenCalledWith(17);
  });

  it("ignores malformed cluster clicks and a failed expansion lookup", async () => {
    const { map } = stubMap();
    wire(map, stubPopup().Popup);
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
    wire(map, stubPopup().Popup);
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    expect(map.source.getClusterExpansionZoom).not.toHaveBeenCalled();
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("shows a pointer over a cluster and restores it on leave", () => {
    const { map, canvas } = stubMap();
    wire(map, stubPopup().Popup);
    map.fire("mousemove", CLUSTERS_LAYER_ID, { features: [{ properties: { cluster_id: 1 } }] });
    expect(canvas.style.cursor).toBe("pointer");
    map.fire("mouseleave", CLUSTERS_LAYER_ID, {});
    expect(canvas.style.cursor).toBe("");
  });

  it("closes the popup after a camera move once its point is no longer rendered individually", () => {
    const { map } = stubMap();
    const { Popup, instances } = stubPopup();
    wire(map, Popup);
    map.fire("moveend", undefined, {});
    map.fire("click", POINTS_LAYER_ID, { features: [point] });
    map.fire("moveend", undefined, {});
    expect(instances[0]?.removed).toBe(false);
    expect(map.queryRenderedFeatures).toHaveBeenCalledWith({ x: 5, y: 5 }, { layers: [POINTS_LAYER_ID, CLUSTERS_LAYER_ID] });
    map.queryRenderedFeatures.mockReturnValueOnce([]);
    map.fire("moveend", undefined, {});
    expect(instances[0]?.removed).toBe(true);
    map.fire("moveend", undefined, {});
    expect(map.queryRenderedFeatures).toHaveBeenCalledTimes(2);
  });
});
