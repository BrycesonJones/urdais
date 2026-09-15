import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// The modal reads the app router, which only exists inside a Next app tree.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { SearchModal } from "@/components/layout/search-modal";

// jsdom implements <dialog> but not its top-layer methods. The modal only needs
// them to reflect the `open` prop into the DOM element; what the top layer does
// with the result is browser behaviour, not something these tests assert.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

function openSearch() {
  render(<SearchModal open onClose={() => {}} />);
  return screen.getByRole("searchbox");
}

/*
 * Search is the product's index directory: an empty query lists every published
 * index. UACI is withheld, so it appears neither in that listing nor under any
 * query that would otherwise reach it.
 */
describe("SearchModal index results", () => {
  it("lists the published indices on an empty query", () => {
    openSearch();
    for (const name of [
      "Urdais Compute Price Index",
      "Urdais Global AI Index",
      "Urdais AI Volatility Index",
      "Urdais Memory Price Index",
      "Urdais Photonics Price Index",
      "Urdais Energy & Power Index",
      "Urdais Bitcoin Wealth Index",
    ]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("never lists the withheld Chip & Accelerator Index", () => {
    openSearch();
    expect(screen.queryByText("UACI")).toBeNull();
    expect(screen.queryByText("Urdais Chip & Accelerator Index")).toBeNull();
    expect(screen.queryByRole("link", { name: /chip|accelerator index/i })).toBeNull();
  });

  it("finds nothing for its symbol or its name", () => {
    const input = openSearch();
    for (const query of ["uaci", "chip", "accelerator index"]) {
      fireEvent.change(input, { target: { value: query } });
      expect(screen.getByText("No matching markets or indices.")).toBeInTheDocument();
      expect(screen.queryByText("Urdais Chip & Accelerator Index")).toBeNull();
    }
  });

  it("still resolves the published indices by symbol and by name", () => {
    const input = openSearch();
    fireEvent.change(input, { target: { value: "ucpi" } });
    expect(screen.getByRole("link", { name: /Urdais Compute Price Index/ })).toHaveAttribute("href", "/markets/ucpi");

    fireEvent.change(input, { target: { value: "volatility" } });
    expect(screen.getByRole("link", { name: /Urdais AI Volatility Index/ })).toHaveAttribute("href", "/markets/uavi");
  });
});
