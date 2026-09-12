import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MapLegend } from "@/components/map/map-legend";
import { MAPPED_POINT_COLOR, UNMAPPED_POINT_COLOR } from "@/components/map/map-point-style";

/** Tailwind's inline style reaches jsdom as an rgb() string; normalise for comparison. */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

describe("MapLegend", () => {
  it("names both statuses in text, inside a labelled group", () => {
    render(<MapLegend />);
    const group = screen.getByRole("group", { name: "Map legend" });
    expect(group).toHaveTextContent("Mapped");
    expect(group).toHaveTextContent("Unmapped");
    expect(screen.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Mapped", "Unmapped"]);
  });

  it("paints its swatches with the same colours the map layer uses, and keeps them decorative", () => {
    const { container } = render(<MapLegend />);
    const swatches = [...container.querySelectorAll("li > span[aria-hidden='true']")] as HTMLElement[];
    expect(swatches.map((swatch) => swatch.style.backgroundColor)).toEqual([rgb(MAPPED_POINT_COLOR), rgb(UNMAPPED_POINT_COLOR)]);
  });

  it("renders without any map at all", () => {
    expect(() => render(<MapLegend className="absolute bottom-3 left-3" />)).not.toThrow();
    expect(screen.getByRole("group", { name: "Map legend" })).toHaveClass("absolute", "bottom-3", "left-3");
  });
});
