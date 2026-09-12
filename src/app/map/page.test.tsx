import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/map/map-workspace", () => ({ MapWorkspace: () => <div data-testid="workspace" /> }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => <header data-testid="header" /> }));

import MapRoute, { metadata } from "@/app/map/page";

describe("/map route", () => {
  it("is a viewport-tall column: header, then the workspace taking the remaining height inside a positioned main, no footer", () => {
    const { container, getByTestId } = render(<MapRoute />);
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
});
