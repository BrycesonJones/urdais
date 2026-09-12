import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MapLegend } from "@/components/map/map-legend";
import { MAP_POINT_CATEGORY_COLORS, UNMAPPED_POINT_COLOR } from "@/components/map/map-point-style";

/** Tailwind's inline style reaches jsdom as an rgb() string; normalise for comparison. */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

describe("MapLegend", () => {
  it("names the four categories and Unmapped in text, inside a labelled group, with no generic Mapped row", () => {
    render(<MapLegend />);
    expect(screen.getByRole("group", { name: "Map legend" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Data Center", "Compute Cluster", "Power Infrastructure", "Semiconductor Fab", "Unmapped"]);
    expect(screen.queryByText(/^Mapped$/)).toBeNull();
  });

  it("paints its swatches from the shared colour table, and keeps them decorative", () => {
    const { container } = render(<MapLegend />);
    const swatches = [...container.querySelectorAll("li > span[aria-hidden='true']")] as HTMLElement[];
    expect(swatches.map((swatch) => swatch.style.backgroundColor)).toEqual([
      rgb(MAP_POINT_CATEGORY_COLORS.data_center),
      rgb(MAP_POINT_CATEGORY_COLORS.compute_cluster),
      rgb(MAP_POINT_CATEGORY_COLORS.power_infrastructure),
      rgb(MAP_POINT_CATEGORY_COLORS.semiconductor_fab),
      rgb(UNMAPPED_POINT_COLOR),
    ]);
  });

  it("renders without any map at all", () => {
    expect(() => render(<MapLegend className="absolute bottom-3 left-3" />)).not.toThrow();
    expect(screen.getByRole("group", { name: "Map legend" })).toHaveClass("absolute", "bottom-3", "left-3");
  });
});
