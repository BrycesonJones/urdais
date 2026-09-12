import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/map/urdais-map", () => ({ UrdaisMap: () => <div data-testid="map" /> }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header data-testid="header" /> }));

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

  it("titles the page Map", () => {
    expect(metadata.title).toBe("Map");
  });
});
