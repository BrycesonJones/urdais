import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { UrdaisMapPoint } from "@/types/map";

const workspacePoints: Array<readonly UrdaisMapPoint[]> = [];
vi.mock("@/components/map/map-workspace", () => ({
  MapWorkspace: ({ points }: { points: readonly UrdaisMapPoint[] }) => {
    workspacePoints.push(points);
    return <div data-testid="workspace" />;
  },
}));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header data-testid="header" /> }));

const surface = vi.hoisted(() => ({
  model: {
    dataset: "urdais-map-facilities" as const,
    verificationHorizonDays: 365,
    facilities: [
      {
        id: "lumi-supercomputer",
        name: "LUMI Supercomputer",
        category: "gpu_compute_cluster" as const,
        latitude: 64.2319866,
        longitude: 27.691477,
        coordinatePrecision: "building" as const,
        address: "Tehdaskatu 15, Kajaani, Kainuu, Finland",
        ownerName: "EuroHPC Joint Undertaking",
        operatorName: "CSC",
        lifecycleStatus: "operational" as const,
        lastVerifiedDate: "2026-09-17",
        sources: [{ publisher: "EuroHPC Joint Undertaking", title: "Our Supercomputers", url: "https://example.com/eurohpc" }],
      },
    ],
    coverage: { published: 1, served: 1, byCategory: { data_center: 0, gpu_compute_cluster: 1, power_infrastructure: 0, semiconductor_fab: 0 }, countries: 1 },
    unavailableReason: null,
  },
}));
vi.mock("@/lib/facilities/read/surface", () => ({ facilityMapSurface: async () => surface.model }));

import MapRoute, { metadata } from "@/app/map/page";

describe("/map route", () => {
  it("is a viewport-tall column: header, then the workspace taking the remaining height inside a positioned main, no footer", async () => {
    const { container, getByTestId } = render(await MapRoute());
    const column = container.firstElementChild;
    expect(column).toHaveClass("flex", "h-dvh", "flex-col");
    expect(column?.children[0]).toBe(getByTestId("header"));
    const main = container.querySelector("main");
    expect(main).toHaveClass("relative", "flex-1", "min-h-80");
    expect(main).toContainElement(getByTestId("workspace"));
    expect(container.querySelector("footer")).toBeNull();
  });

  it("titles the page Map", () => {
    expect(metadata.title).toBe("Map");
  });

  it("projects the server's published facilities into map points and hands them to the workspace", async () => {
    workspacePoints.length = 0;
    render(await MapRoute());
    expect(workspacePoints.at(-1)).toEqual([
      {
        id: "lumi-supercomputer",
        name: "LUMI Supercomputer",
        category: "gpu_compute_cluster",
        latitude: 64.2319866,
        longitude: 27.691477,
        address: "Tehdaskatu 15, Kajaani, Kainuu, Finland",
        ownerName: "EuroHPC Joint Undertaking",
        operatorName: "CSC",
        lifecycleStatus: "operational",
        lastVerifiedDate: "2026-09-17",
        sources: [{ publisher: "EuroHPC Joint Undertaking", url: "https://example.com/eurohpc" }],
      },
    ]);
  });
});
