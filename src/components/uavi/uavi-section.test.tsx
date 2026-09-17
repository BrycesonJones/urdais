import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UaviSection } from "@/components/uavi/uavi-section";
import { MARKETS, findMarket } from "@/data/mock/market-detail";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { UAVI_WATCHLIST_ROW } from "@/lib/uavi/read/watchlist";
import { unconfiguredUaviReadModel, type UaviReadModel } from "@/lib/uavi/read/read-model";

function model(overrides: Partial<UaviReadModel> = {}): UaviReadModel {
  return { ...unconfiguredUaviReadModel(), ...overrides };
}

describe("the UAVI surface when nothing is published", () => {
  it("shows no level, no change and no chart", () => {
    const { container } = render(<UaviSection model={model()} />);
    const text = container.textContent ?? "";
    // Twice: the heading badge and the panel title, which is the intended emphasis.
    expect(screen.getAllByText("Not yet live").length).toBeGreaterThan(0);
    expect(text).toContain("No published history");
    expect(text).not.toMatch(/Updated /);
    // No digits followed by the unit anywhere: no "27.84 pts", no "0.00 pts".
    expect(text).not.toMatch(/\d+\.\d+\s*pts/);
  });

  it("never shows the level the removed demo walk carried", () => {
    // The specific fabrication this surface replaced. On a volatility index a plausible number is
    // indistinguishable from a real one, because a reader has no external anchor for what
    // AI-equity implied volatility should be.
    const { container } = render(<UaviSection model={model()} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("27.84");
    expect(text).not.toContain("30.00");
    expect(text).not.toMatch(/[+-]\d+\.\d+\s*%/);
  });

  it("states the reason rather than leaving the space blank", () => {
    const { container } = render(<UaviSection model={model()} />);
    expect(container.textContent).toContain("has not begun live publication");
  });

  it("distinguishes a withheld session from an index that never started", () => {
    // `unavailable` is the state in which UAVI is working correctly and declining to publish.
    // Collapsing it into "not yet live" would tell a reader nothing about which is true.
    render(
      <UaviSection
        model={model({
          lifecycle: "unavailable",
          publicReason: "UAVI calculated for this date and is not publishing a level.",
          coverage: {
            coveredParentWeight: 0.41,
            coveredIssuerCount: 6,
            uncoveredIssuerCount: 19,
            maxConstituentWeight: 0.34,
            effectiveIssuerCount: 4.2,
          },
        })}
      />,
    );
    expect(screen.getAllByText("Withheld this session").length).toBeGreaterThan(0);
    // The coverage that explains the refusal is published alongside it.
    expect(screen.getByText("41.0%")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("presents the draft methodology as a draft", () => {
    render(<UaviSection model={model()} />);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Urdais AI Volatility Index/ })).toHaveAttribute(
      "href",
      "/docs/methodology/uavi",
    );
  });

  it("says what UAVI is not, on the surface rather than only in the methodology", () => {
    const { container } = render(<UaviSection model={model()} />);
    expect(container.textContent).toContain("not the implied volatility of UGAI");
  });
});

describe("the UAVI surface with a published observation", () => {
  const published = model({
    lifecycle: "live",
    publicReason: "",
    level: 31.42,
    previousLevel: 28.9,
    change: 2.52,
    changePercent: 8.72,
    observationDate: "2026-09-18",
    publishedAt: "2026-09-18T20:00:00.000Z",
    coverage: {
      coveredParentWeight: 0.84,
      coveredIssuerCount: 27,
      uncoveredIssuerCount: 4,
      maxConstituentWeight: 0.11,
      effectiveIssuerCount: 18.2,
    },
  });

  it("shows the level, its change and its coverage", () => {
    render(<UaviSection model={published} series={[{ date: "2026-09-18", level: 31.42 }]} />);
    expect(screen.getByText("31.42")).toBeInTheDocument();
    expect(screen.getByText("84.0%")).toBeInTheDocument();
    expect(screen.getByText("27")).toBeInTheDocument();
  });

  it("withholds the change on a first observation rather than showing zero", () => {
    render(<UaviSection model={{ ...published, previousLevel: null, change: null, changePercent: null }} />);
    expect(screen.getByText(/First published observation/)).toBeInTheDocument();
  });
});

describe("UAVI carries no mock data anywhere", () => {
  it("has no instruments and therefore no demo series", () => {
    const uavi = findMarket("uavi")!;
    expect(uavi.families.flatMap((f) => f.instruments)).toHaveLength(0);
    expect(MARKETS.map((m) => m.symbol)).toContain("UAVI");
  });

  it("is absent from the demo snapshot dataset", () => {
    expect(INDEX_SNAPSHOTS.find((row) => row.symbol === "UAVI")).toBeUndefined();
  });

  it("joins the homepage rail as an unpublished row carrying no number", () => {
    expect(UAVI_WATCHLIST_ROW.provenance).toBe("unpublished");
    expect(UAVI_WATCHLIST_ROW.changePercent).toBeNull();
  });

  it("is not offered as a comparison series against other indices", () => {
    // Comparing a real series against fabricated volatility points is a comparison a reader has
    // no way to sanity-check.
    for (const market of MARKETS) {
      for (const instrument of market.families.flatMap((f) => f.instruments)) {
        expect(instrument.comparisons.map((c) => c.label)).not.toContain("UAVI");
      }
    }
  });
});
