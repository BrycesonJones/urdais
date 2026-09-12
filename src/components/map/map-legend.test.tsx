import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MapLegend } from "@/components/map/map-legend";
import { DEFAULT_MAP_VISIBILITY, MAP_POINT_CATEGORY_COLORS, UNMAPPED_POINT_COLOR } from "@/components/map/map-point-style";

/** Tailwind's inline style reaches jsdom as an rgb() string; normalise for comparison. */
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

describe("MapLegend", () => {
  it("renders the four categories and Unmapped as pressed toggle buttons, all on by default, with no generic Mapped row", () => {
    render(<MapLegend visibility={DEFAULT_MAP_VISIBILITY} onToggle={() => undefined} />);
    expect(screen.getByRole("group", { name: "Map legend" })).toBeInTheDocument();
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual(["Data Center", "Compute Cluster", "Power Infrastructure", "Semiconductor Fab", "Unmapped"]);
    expect(buttons.every((button) => button.getAttribute("aria-pressed") === "true")).toBe(true);
    expect(screen.queryByText(/^Mapped$/)).toBeNull();
  });

  it("paints its swatches from the shared colour table and keeps them decorative", () => {
    const { container } = render(<MapLegend visibility={DEFAULT_MAP_VISIBILITY} onToggle={() => undefined} />);
    const swatches = [...container.querySelectorAll("button > span[aria-hidden='true']")] as HTMLElement[];
    expect(swatches.map((swatch) => swatch.style.backgroundColor)).toEqual([
      rgb(MAP_POINT_CATEGORY_COLORS.data_center),
      rgb(MAP_POINT_CATEGORY_COLORS.compute_cluster),
      rgb(MAP_POINT_CATEGORY_COLORS.power_infrastructure),
      rgb(MAP_POINT_CATEGORY_COLORS.semiconductor_fab),
      rgb(UNMAPPED_POINT_COLOR),
    ]);
  });

  it("reports the clicked group, and the whole row is the control", () => {
    const onToggle = vi.fn();
    render(<MapLegend visibility={DEFAULT_MAP_VISIBILITY} onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button", { name: "Power Infrastructure" }));
    fireEvent.click(screen.getByRole("button", { name: "Unmapped" }));
    expect(onToggle.mock.calls.map(([group]) => group)).toEqual(["power_infrastructure", "unmapped"]);
    const row = screen.getByRole("button", { name: "Data Center" });
    expect(row.tagName).toBe("BUTTON");
    expect(row).toHaveClass("w-full", "min-h-8");
    fireEvent.click(row.querySelector("span[aria-hidden='true']")!);
    expect(onToggle).toHaveBeenLastCalledWith("data_center");
  });

  it("exposes a hidden group as not pressed, keeps its row and colour, and mutes it visibly", () => {
    const { container } = render(<MapLegend visibility={{ ...DEFAULT_MAP_VISIBILITY, compute_cluster: false, unmapped: false }} onToggle={() => undefined} />);
    const compute = screen.getByRole("button", { name: "Compute Cluster" });
    expect(compute).toHaveAttribute("aria-pressed", "false");
    expect(compute).toHaveClass("text-neutral-400");
    expect(screen.getByRole("button", { name: "Unmapped" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Data Center" })).toHaveAttribute("aria-pressed", "true");
    const swatches = [...container.querySelectorAll("button > span[aria-hidden='true']")] as HTMLElement[];
    expect(swatches[1]?.style.backgroundColor).toBe(rgb(MAP_POINT_CATEGORY_COLORS.compute_cluster));
    expect(swatches[1]).toHaveClass("opacity-30");
    expect(swatches[0]).not.toHaveClass("opacity-30");
    expect(screen.getAllByRole("button")).toHaveLength(5);
  });

  it("renders without any map at all", () => {
    expect(() => render(<MapLegend visibility={DEFAULT_MAP_VISIBILITY} onToggle={() => undefined} className="absolute bottom-3 left-3" />)).not.toThrow();
    expect(screen.getByRole("group", { name: "Map legend" })).toHaveClass("absolute", "bottom-3", "left-3");
  });
});
