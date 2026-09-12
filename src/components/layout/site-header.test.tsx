import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const prefetchMapRenderer = vi.hoisted(() => vi.fn());
vi.mock("@/components/map/prefetch-map", () => ({ prefetchMapRenderer }));
// The search modal reads the app router, which only exists inside a Next app tree.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SiteHeader } from "@/components/layout/site-header";

describe("SiteHeader map navigation", () => {
  it("links to /map from the primary navigation at every width", () => {
    render(<SiteHeader />);
    const link = screen.getByRole("link", { name: "Map" });
    expect(link).toHaveAttribute("href", "/map");
    expect(link).not.toHaveClass("hidden");
    expect(link.closest("nav")).toHaveAttribute("aria-label", "Primary");
  });

  it("warms the map renderer on hover or focus, and only then", () => {
    render(<SiteHeader />);
    expect(prefetchMapRenderer).not.toHaveBeenCalled();
    const link = screen.getByRole("link", { name: "Map" });
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
    expect(prefetchMapRenderer).toHaveBeenCalledTimes(2);
  });

  it("keeps the other navigation links as they were", () => {
    render(<SiteHeader />);
    expect(screen.getByRole("link", { name: "Products" })).toHaveClass("hidden");
    expect(screen.getByRole("link", { name: "Get Started" })).toHaveAttribute("href", "/get-started");
  });
});
