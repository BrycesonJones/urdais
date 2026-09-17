import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UrdaisIndices } from "@/components/market/urdais-indices";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { ubwiIndexSnapshot } from "@/lib/ubwi/read/surface";
import type { IndexSnapshot } from "@/types/market";

/**
 * The integrity rule for watchlist rows: a synthetic index must never be readable as a
 * quoted Urdais value. The rail is where that failed -- UGAI's seeded walk rendered as
 * "184.21 pts +1.14 %" beside UBWI's published percentage, in the same type and the same
 * rail, with no provenance anywhere on the row.
 */

const DEMO: IndexSnapshot = {
  symbol: "UGAI",
  name: "Urdais Global AI Index",
  unit: "pts",
  provenance: "demo",
  value: 184.21,
  changePercent: 1.14,
  asOf: Date.UTC(2026, 8, 4, 16, 0, 0) / 1000,
};

const LIVE: IndexSnapshot = {
  symbol: "UBWI",
  name: "Urdais Bitcoin Wealth Index",
  unit: "%",
  provenance: "production",
  value: 0.26716309468662236,
  valueFractionDigits: 4,
  changePercent: null,
  asOf: Date.UTC(2026, 8, 15, 4, 33, 47) / 1000,
};

function row(name: string) {
  const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
  return within(rail).getByRole("link", { name: new RegExp(`^${name}\\b`) });
}

describe("a demo index row", () => {
  it("says it is demo data and that nothing is published", () => {
    render(<UrdaisIndices indices={[DEMO]} />);
    const ugai = row("UGAI");
    expect(ugai).toHaveTextContent("Demo data");
    expect(ugai).toHaveTextContent("Not published");
  });

  it("quotes no level, no unit and no movement", () => {
    render(<UrdaisIndices indices={[DEMO]} />);
    const ugai = row("UGAI");
    expect(ugai).not.toHaveTextContent("184.21");
    expect(ugai).not.toHaveTextContent("1.14");
    expect(ugai).not.toHaveTextContent("pts");
    // No digit survives anywhere in the row, so there is nothing to read as a quote.
    expect(ugai.textContent).not.toMatch(/\d/);
  });

  it("carries the distinction as text, not as colour alone", () => {
    render(<UrdaisIndices indices={[DEMO]} />);
    // Both markers are in the row's accessible name, so a screen reader and a
    // monochrome display both get them.
    const name = row("UGAI").textContent ?? "";
    expect(name).toContain("Demo data");
    expect(name).toContain("Not published");
  });

  it("does not imply an outage, a delay or a stale value", () => {
    render(<UrdaisIndices indices={[DEMO]} />);
    const text = row("UGAI").textContent ?? "";
    for (const wrong of [/unavailable/i, /delayed/i, /stale/i, /loading/i, /pending/i, /error/i]) {
      expect(text).not.toMatch(wrong);
    }
  });

  it("still links to the detail page, where the illustrative series lives", () => {
    render(<UrdaisIndices indices={[DEMO]} />);
    expect(row("UGAI")).toHaveAttribute("href", "/markets/ugai");
  });
});

describe("a production index row is untouched", () => {
  it("keeps its level at its own precision, and its unit", () => {
    render(<UrdaisIndices indices={[LIVE]} />);
    const ubwi = row("UBWI");
    expect(ubwi).toHaveTextContent("0.2672");
    expect(ubwi).toHaveTextContent("%");
  });

  it("carries no demo label and no unpublished line", () => {
    render(<UrdaisIndices indices={[LIVE]} />);
    const ubwi = row("UBWI");
    expect(ubwi).not.toHaveTextContent("Demo data");
    expect(ubwi).not.toHaveTextContent("Not published");
  });

  it("still withholds movement when there is no prior observation", () => {
    render(<UrdaisIndices indices={[LIVE]} />);
    expect(row("UBWI").textContent ?? "").not.toMatch(/[+−-]\d+\.\d+\s*%/);
  });

  it("renders movement when there is one", () => {
    render(<UrdaisIndices indices={[{ ...LIVE, changePercent: -1.62 }]} />);
    expect(row("UBWI")).toHaveTextContent("1.62");
  });
});

describe("demo and production rows are distinguishable side by side", () => {
  it("shows a level for the published row and none for the synthetic one", () => {
    render(<UrdaisIndices indices={[DEMO, LIVE]} />);
    expect(row("UGAI").textContent).not.toMatch(/\d/);
    expect(row("UBWI")).toHaveTextContent("0.2672");
  });
});

describe("the data contract behind the rail", () => {
  it("states demo on every mock watchlist row", () => {
    expect(INDEX_SNAPSHOTS.length).toBeGreaterThan(0);
    for (const snapshot of INDEX_SNAPSHOTS) expect(snapshot.provenance).toBe("demo");
  });

  it("states production on the one row built from a frozen publication", () => {
    const published = ubwiIndexSnapshot({
      publishedAt: "2026-09-15T04:33:47.738Z",
      valuePercent: 0.26716309468662236,
      changePercent: null,
    });
    expect(published!.provenance).toBe("production");
  });
});
