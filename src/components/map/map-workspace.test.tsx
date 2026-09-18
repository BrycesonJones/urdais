import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAP_VISIBILITY } from "@/components/map/map-point-style";
import type { MapVisibilityState } from "@/components/map/map-point-style";
import type { UrdaisMapPoint } from "@/types/map";

const received: MapVisibilityState[] = [];
const receivedPoints: Array<readonly UrdaisMapPoint[]> = [];
vi.mock("@/components/map/urdais-map", () => ({
  UrdaisMap: ({ visibility, points }: { visibility: MapVisibilityState; points: readonly UrdaisMapPoint[] }) => {
    received.push(visibility);
    receivedPoints.push(points);
    return <div data-testid="map" />;
  },
}));

import { MapWorkspace } from "@/components/map/map-workspace";

const POINTS: readonly UrdaisMapPoint[] = [
  { id: "csc-kajaani-lumi-host", name: "CSC Kajaani Data Center", longitude: 27.691477, latitude: 64.2319866, category: "data_center" },
];

describe("MapWorkspace", () => {
  it("starts with every group visible and hands that state to both the map and the legend", () => {
    received.length = 0;
    receivedPoints.length = 0;
    render(<MapWorkspace points={POINTS} />);
    expect(received.at(-1)).toEqual(DEFAULT_MAP_VISIBILITY);
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(screen.getByRole("group", { name: "Map legend" })).toHaveClass("absolute", "left-3", "bottom-16", "sm:bottom-3");
    // The facilities pass straight through: the workspace owns visibility, not data.
    expect(receivedPoints.at(-1)).toBe(POINTS);
  });

  it("toggles a group off and on again from the legend, flowing the new state to the map", () => {
    received.length = 0;
    render(<MapWorkspace points={POINTS} />);
    const fab = screen.getByRole("button", { name: "Semiconductor Fab" });
    fireEvent.click(fab);
    expect(fab).toHaveAttribute("aria-pressed", "false");
    expect(received.at(-1)).toEqual({ ...DEFAULT_MAP_VISIBILITY, semiconductor_fab: false });
    fireEvent.click(fab);
    expect(fab).toHaveAttribute("aria-pressed", "true");
    expect(received.at(-1)).toEqual(DEFAULT_MAP_VISIBILITY);
  });

  it("lets every category be turned off, and offers no Unmapped row to turn off", () => {
    received.length = 0;
    render(<MapWorkspace points={POINTS} />);
    for (const name of ["Data Center", "GPU Compute Cluster", "Power Infrastructure", "Semiconductor Fab"]) fireEvent.click(screen.getByRole("button", { name }));
    expect(received.at(-1)).toEqual({ data_center: false, gpu_compute_cluster: false, power_infrastructure: false, semiconductor_fab: false });
    expect(screen.queryByRole("button", { name: "Unmapped" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
});
