import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InformationMarketsSection } from "@/components/home/information-markets-section";
import { MOCK_AS_OF } from "@/data/mock/ucpi";
import { LISTED_GPU_UNIT_CAPTION, type UcpiHeadline } from "@/lib/ucpi/read/load";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { assembleIndexRail } from "@/lib/market/index-rail";
import { UAVI_WATCHLIST_ROW } from "@/lib/uavi/read/watchlist";
import { UGAI_WATCHLIST_ROW } from "@/lib/ugai/read/watchlist";
import { UMPI_WATCHLIST_ROW } from "@/lib/umpi/read/watchlist";

/**
 * The regression these cover: the panel used to import the UCPI fixtures at module
 * scope, so the homepage showed 2.41 as of 2026-09-04 no matter what production had
 * published, under a hardcoded "Demo data" badge.
 *
 * The production figures here are deliberately not the fixture's, and later than it,
 * so an assertion cannot pass by accident on a snapshot of the fixture.
 */
const PUBLISHED_AT = Math.floor(Date.parse("2026-09-16T01:01:18.628Z") / 1000);

const LIVE: UcpiHeadline = {
  index: { symbol: "UCPI", name: "Urdais Compute Price Index", unit: LISTED_GPU_UNIT_CAPTION },
  snapshot: { value: 3.628, changePercent: null, asOf: PUBLISHED_AT },
  series: {
    "1D": [{ time: PUBLISHED_AT, value: 3.628 }],
    "1W": [{ time: PUBLISHED_AT, value: 3.628 }],
    "1M": [{ time: PUBLISHED_AT, value: 3.628 }],
    "3M": [{ time: PUBLISHED_AT, value: 3.628 }],
    "1Y": [{ time: PUBLISHED_AT, value: 3.628 }],
    ALL: [{ time: PUBLISHED_AT, value: 3.628 }],
  },
};

describe("live UCPI wins over the fixtures", () => {
  it("renders the production value and timestamp, not the Sep-4 fixture", () => {
    render(<InformationMarketsSection ucpi={LIVE} />);
    const panel = screen.getByRole("article", { name: /UCPI/ });
    // Displayed at the panel's two decimals; 3.628 is the released level.
    expect(panel).toHaveTextContent("3.63");
    expect(panel).not.toHaveTextContent("2.41");
    expect(panel).toHaveTextContent("Sep 16, 2026");
    expect(panel).not.toHaveTextContent("Sep 4, 2026");
  });

  it("does not label a released production series demo data", () => {
    render(<InformationMarketsSection ucpi={LIVE} />);
    // Scoped to the panel: the indices rail beside it is demo data and now says so on
    // every row, so a page-wide query for "Demo data" no longer says anything about UCPI.
    const panel = screen.getByRole("article", { name: /UCPI/ });
    expect(within(panel).queryByText("Demo data")).toBeNull();
    expect(within(panel).getByText("Live")).toBeInTheDocument();
  });

  it("shows the listed unit the children actually publish in", () => {
    render(<InformationMarketsSection ucpi={LIVE} />);
    expect(screen.getByRole("article", { name: /UCPI/ })).toHaveTextContent("listed");
  });

  it("prefers production even where fixtures are permitted", () => {
    // Development still has the fixtures available; a live value must still beat them.
    render(<InformationMarketsSection ucpi={LIVE} fixturesPermitted />);
    const panel = screen.getByRole("article", { name: /UCPI/ });
    expect(panel).toHaveTextContent("3.63");
    expect(within(panel).queryByText("Demo data")).toBeNull();
  });
});

describe("a production failure never passes the fixtures off as live", () => {
  it("shows an unavailable state rather than the Sep-4 series when fixtures are barred", () => {
    // ucpi=null is what loadUcpiHeadline returns for an unreachable database as well as
    // for one that has published nothing; neither may reinstate the demo series.
    render(<InformationMarketsSection ucpi={null} fixturesPermitted={false} />);
    const panel = screen.getByRole("article", { name: /UCPI/ });
    expect(panel).toHaveTextContent(/unavailable/i);
    expect(panel).not.toHaveTextContent("2.41");
    expect(panel).not.toHaveTextContent("Sep 4, 2026");
    // Not merely unlabelled -- the number is absent entirely.
    expect(within(panel).queryByText("Live")).toBeNull();
    expect(within(panel).queryByText("Demo data")).toBeNull();
  });

  it("still links to the UCPI market page while unavailable", () => {
    render(<InformationMarketsSection ucpi={null} fixturesPermitted={false} />);
    expect(screen.getByRole("link", { name: "UCPI" })).toHaveAttribute("href", "/markets/ucpi");
  });
});

describe("the fixtures remain available where they are intentionally supported", () => {
  it("renders the demo series, labelled demo, when production has nothing and fixtures are permitted", () => {
    render(<InformationMarketsSection ucpi={null} fixturesPermitted />);
    const panel = screen.getByRole("article", { name: /UCPI/ });
    expect(panel).toHaveTextContent("2.41");
    expect(within(panel).getByText("Demo data")).toBeInTheDocument();
    expect(within(panel).queryByText("Live")).toBeNull();
  });

  it("keeps the prop-less render on fixtures, so no default implies a published value", () => {
    render(<InformationMarketsSection />);
    const panel = screen.getByRole("article", { name: /UCPI/ });
    expect(panel).toHaveTextContent("2.41");
    expect(within(panel).getByText("Demo data")).toBeInTheDocument();
    // The fixture is the frozen one, unchanged by this work.
    expect(MOCK_AS_OF).toBe(Date.UTC(2026, 8, 4, 16, 0, 0) / 1000);
  });
});

/*
 * The defect this covers: the rail rendered UGAI at "184.21 pts +1.14 %" in the same
 * type, rail and colours as UBWI's published percentage, with nothing on the row to
 * separate a seeded walk from a published index.
 */
describe("the indices rail never quotes a demo index", () => {
  // UGAI is no longer among them: its seeded walk was removed rather than relabelled, so it has
  // no mock row at all. UMPI left for the same reason -- nine seeded chip-price walks removed in
  // Phase 7 -- and its row is covered below. UPPI and UACI still have mock rows in the dataset,
  // but neither is presented as a product, so the rail drops both; that is covered below too.
  const MOCK_SYMBOLS = ["UEPI"];

  it("labels every mock row demo and gives it no level and no movement", () => {
    render(<InformationMarketsSection />);
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    for (const symbol of MOCK_SYMBOLS) {
      const row = within(rail).getByRole("link", { name: new RegExp(`^${symbol}\\b`) });
      expect(row).toHaveTextContent("Demo data");
      expect(row).toHaveTextContent("Not published");
      // The strongest form of the rule: a demo row carries no digit at all, so there is
      // no level, no movement and no timestamp to read as a quote.
      expect(row.textContent).not.toMatch(/\d/);
    }
  });

  it("puts a demo row for every mock index, so none is quietly dropped instead of labelled", () => {
    render(<InformationMarketsSection />);
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    expect(within(rail).getAllByRole("link")).toHaveLength(MOCK_SYMBOLS.length);
    expect(within(rail).getAllByText("Demo data")).toHaveLength(MOCK_SYMBOLS.length);
  });
});

/*
 * UGAI, UAVI and UACI are not productized, so the public rail does not list them. They
 * previously sat here stating "Not yet live" and "Demo data" -- which is a product page for a
 * product Urdais has decided not to sell. The rows are withheld rather than relabelled again.
 *
 * Each test hands the rail a row for the withheld index on purpose: the sources that build these
 * rows still exist and still offer them, and the point is that the rail refuses them anyway.
 */
describe("the public indices rail withholds non-production indices", () => {
  const WITHHELD = [
    ["UGAI", UGAI_WATCHLIST_ROW],
    ["UAVI", UAVI_WATCHLIST_ROW],
  ] as const;

  it.each(WITHHELD)("drops the %s row even when one is offered", (symbol, row) => {
    render(<InformationMarketsSection indices={assembleIndexRail([row])} />);
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    expect(within(rail).queryByRole("link", { name: new RegExp(`^${symbol}\\b`) })).toBeNull();
    expect(within(rail).queryAllByRole("link")).toHaveLength(0);
  });

  it("drops UACI, which the mock dataset still builds a demo row for", () => {
    // The row exists upstream; only the rail refuses it. If this first expectation ever fails,
    // the test below is passing for the wrong reason.
    expect(INDEX_SNAPSHOTS.map((row) => row.symbol)).toContain("UACI");
    render(<InformationMarketsSection />);
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    expect(within(rail).queryByRole("link", { name: /^UACI\b/ })).toBeNull();
  });

  it("shows none of their names, tickers or unavailable-state wording anywhere in the rail", () => {
    render(
      <InformationMarketsSection
        indices={assembleIndexRail([...INDEX_SNAPSHOTS, UGAI_WATCHLIST_ROW, UAVI_WATCHLIST_ROW, UMPI_WATCHLIST_ROW])}
      />,
    );
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    const text = rail.textContent ?? "";
    for (const term of [
      "UGAI",
      "UAVI",
      "UACI",
      "Urdais Global AI Index",
      "Urdais AI Volatility Index",
      "Urdais Chip & Accelerator Index",
      "Urdais Photonics Price Index",
      "Not yet live",
      "No published observations",
      "Coming soon",
    ]) {
      expect(text, term).not.toContain(term);
    }
  });

  it("leaves the indices that are productized on the rail", () => {
    render(
      <InformationMarketsSection
        indices={assembleIndexRail([...INDEX_SNAPSHOTS, UGAI_WATCHLIST_ROW, UAVI_WATCHLIST_ROW, UMPI_WATCHLIST_ROW])}
      />,
    );
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    // Catalog order, and every presented index the mock dataset and the watchlist modules supply.
    // UPPI is not among them: its production is deferred pending data rights.
    expect(within(rail).getAllByRole("link").map((link) => link.textContent?.slice(0, 4))).toEqual([
      "UMPI",
      "UEPI",
    ]);
  });
});

/*
 * UMPI's row after its demo memory market was removed. Unlike UGAI, UMPI publishes: it has two
 * monthly series and an approved methodology. What it does not have is a single level, so the row
 * must carry no number while still saying the index is real. "Not yet live" would be false and
 * "Demo data" would promise a series that no longer exists.
 */
describe("the UMPI rail row", () => {
  it("says it publishes two series and carries no digit at all", () => {
    render(<InformationMarketsSection indices={[UMPI_WATCHLIST_ROW]} />);
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    const row = within(rail).getByRole("link", { name: /^UMPI\b/ });
    expect(row).toHaveTextContent("Two series");
    expect(row).toHaveTextContent("No composite level");
    // The row's structurally required value and asOf are inert. If a future change let the value
    // branch render them, UMPI would quote a 0.00 level for an index that has none.
    expect(row.textContent).not.toMatch(/\d/);
    expect(row).not.toHaveTextContent("Demo data");
    expect(row).not.toHaveTextContent("Not yet live");
  });

  it("carries no trace of the demo memory market it replaced", () => {
    render(<InformationMarketsSection indices={[UMPI_WATCHLIST_ROW]} />);
    const rail = screen.getByRole("complementary", { name: "Urdais Indices" });
    const row = within(rail).getByRole("link", { name: /^UMPI\b/ });
    for (const term of ["HBM", "DDR", "$/GB", "$/part"]) {
      expect(row.textContent, term).not.toContain(term);
    }
  });
});
