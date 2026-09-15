import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UrdaisIndices } from "@/components/market/urdais-indices";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import type { IndexSnapshot } from "@/types/market";

function snapshot(symbol: string, name: string): IndexSnapshot {
  return { symbol, name, unit: "pts", value: 100, changePercent: 1.5, asOf: 1_789_000_000 };
}

describe("UrdaisIndices rail", () => {
  it("lists the published indices and not the withheld Chip & Accelerator Index", () => {
    render(<UrdaisIndices indices={INDEX_SNAPSHOTS} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("UGAI"), expect.stringContaining("UAVI")]),
    );
    expect(screen.queryByText("UACI")).toBeNull();
    expect(screen.queryByText("Urdais Chip & Accelerator Index")).toBeNull();
    expect(screen.queryByRole("link", { name: /chip|accelerator/i })).toBeNull();
  });

  it("renders one row per snapshot, at any count, so the layout never assumes a fixed index family", () => {
    // A watchlist, not a grid: the rail reflows around however many indices are published.
    for (const count of [0, 1, 3, 9]) {
      const { unmount } = render(
        <UrdaisIndices indices={Array.from({ length: count }, (_, i) => snapshot(`U${i}I`, `Index ${i}`))} />,
      );
      expect(screen.queryAllByRole("listitem")).toHaveLength(count);
      expect(screen.getByRole("heading", { name: "Urdais Indices" })).toBeInTheDocument();
      unmount();
    }
  });
});
