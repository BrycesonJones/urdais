import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/map/urdais-map", () => ({ UrdaisMap: () => <div data-testid="map" /> }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header data-testid="header" /> }));
vi.mock("@/components/map/map-legend", () => ({ MapLegend: ({ className }: { className?: string }) => <div data-testid="legend" className={className} /> }));

import MapRoute, { metadata } from "@/app/map/page";

describe("/map route", () => {
  it("is a viewport-tall column: header, then the map taking the remaining height, no footer", () => {
    const { container, getByTestId } = render(<MapRoute />);
    const column = container.firstElementChild;
    expect(column).toHaveClass("flex", "h-dvh", "flex-col");
    expect(column?.children[0]).toBe(getByTestId("header"));
    const main = container.querySelector("main");
    expect(main).toHaveClass("flex-1", "min-h-80");
    expect(main).toContainElement(getByTestId("map"));
    expect(container.querySelector("footer")).toBeNull();
  });

  it("floats the legend over the map's bottom-left corner, away from the zoom, scale, and attribution controls", () => {
    const { container, getByTestId } = render(<MapRoute />);
    const main = container.querySelector("main");
    expect(main).toHaveClass("relative");
    expect(main).toContainElement(getByTestId("legend"));
    expect(getByTestId("legend")).toHaveClass("absolute", "left-3", "bottom-16", "sm:bottom-3");
  });

  it("titles the page Map", () => {
    expect(metadata.title).toBe("Map");
  });
});
