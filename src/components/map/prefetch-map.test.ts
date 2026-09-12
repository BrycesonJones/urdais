import { beforeEach, describe, expect, it, vi } from "vitest";

const importSpy = vi.hoisted(() => vi.fn());
vi.mock("maplibre-gl", () => {
  importSpy();
  return { tag: "renderer" };
});

describe("map renderer loading", () => {
  beforeEach(() => {
    vi.resetModules();
    importSpy.mockClear();
  });

  it("does nothing until asked, so importing the header never pulls MapLibre", async () => {
    await import("@/components/map/prefetch-map");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(importSpy).not.toHaveBeenCalled();
  });

  it("imports the renderer once, however many times intent fires", async () => {
    const { prefetchMapRenderer } = await import("@/components/map/prefetch-map");
    prefetchMapRenderer();
    prefetchMapRenderer();
    prefetchMapRenderer();
    await vi.waitFor(() => expect(importSpy).toHaveBeenCalledTimes(1));
  });

  it("hands every caller the same load, so a prefetch and the map component share one request", async () => {
    const { loadMapRenderer, prefetchMapRenderer } = await import("@/components/map/prefetch-map");
    prefetchMapRenderer();
    const first = loadMapRenderer();
    expect(loadMapRenderer()).toBe(first);
    const [a, b] = await Promise.all([first, loadMapRenderer()]);
    expect(a).toBe(b);
    expect(a).toMatchObject({ tag: "renderer" });
  });
});
