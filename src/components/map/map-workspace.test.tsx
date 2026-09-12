import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_MAP_VISIBILITY } from "@/components/map/map-point-style";
import type { MapVisibilityState } from "@/components/map/map-point-style";

const received: MapVisibilityState[] = [];
vi.mock("@/components/map/urdais-map", () => ({
  UrdaisMap: ({ visibility }: { visibility: MapVisibilityState }) => {
    received.push(visibility);
    return <div data-testid="map" />;
  },
}));

import { MapWorkspace } from "@/components/map/map-workspace";

describe("MapWorkspace", () => {
  it("starts with every group visible and hands that state to both the map and the legend", () => {
    received.length = 0;
    render(<MapWorkspace />);
    expect(received.at(-1)).toEqual(DEFAULT_MAP_VISIBILITY);
    expect(screen.getAllByRole("button").every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(screen.getByRole("group", { name: "Map legend" })).toHaveClass("absolute", "left-3", "bottom-16", "sm:bottom-3");
  });

  it("toggles a group off and on again from the legend, flowing the new state to the map", () => {
    received.length = 0;
    render(<MapWorkspace />);
    const fab = screen.getByRole("button", { name: "Semiconductor Fab" });
    fireEvent.click(fab);
    expect(fab).toHaveAttribute("aria-pressed", "false");
    expect(received.at(-1)).toEqual({ ...DEFAULT_MAP_VISIBILITY, semiconductor_fab: false });
    fireEvent.click(fab);
    expect(fab).toHaveAttribute("aria-pressed", "true");
    expect(received.at(-1)).toEqual(DEFAULT_MAP_VISIBILITY);
  });

  it("lets every group be turned off, and keeps Unmapped independent of the categories", () => {
    received.length = 0;
    render(<MapWorkspace />);
    for (const name of ["Data Center", "Compute Cluster", "Power Infrastructure", "Semiconductor Fab"]) fireEvent.click(screen.getByRole("button", { name }));
    expect(received.at(-1)).toEqual({ data_center: false, compute_cluster: false, power_infrastructure: false, semiconductor_fab: false, unmapped: true });
    fireEvent.click(screen.getByRole("button", { name: "Unmapped" }));
    expect(received.at(-1)).toEqual({ data_center: false, compute_cluster: false, power_infrastructure: false, semiconductor_fab: false, unmapped: false });
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });
});
