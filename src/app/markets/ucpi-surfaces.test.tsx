import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/charts/detailed-market-chart", () => ({ DetailedMarketChart: () => null }));
vi.mock("@/components/layout/site-header", () => ({ SiteHeader: () => null }));
vi.mock("@/components/layout/site-footer", () => ({ SiteFooter: () => null }));

// Tokens are hydrated on both routes and are not what these tests are about; leaving the
// family untouched is exactly what the real loader does when nothing is publicable.
vi.mock("@/lib/tokens/read/load", () => ({
  hydrateMarketWithTokenPrices: vi.fn(async (market: unknown) => market),
  tokenResearchPreviewActive: vi.fn(async () => false),
}));

vi.mock("@/lib/ucpi/read/load", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ucpi/read/load")>();
  return { ...actual, hydrateMarketWithListedCompute: vi.fn(actual.hydrateMarketWithListedCompute) };
});

import MarketIndexPage from "@/app/markets/[symbol]/page";
import MarketsPage from "@/app/markets/page";
import {
  hydrateMarketWithListedCompute,
  listedInstrumentsFrom,
  withListedComputeInstruments,
  type ListedChildState,
} from "@/lib/ucpi/read/load";
import { findMarket, DEFAULT_MARKET_SYMBOL } from "@/data/mock/market-detail";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";

const hydrateCompute = vi.mocked(hydrateMarketWithListedCompute);

/**
 * The production shape of the first published UCPI run: calculation date 2026-09-15,
 * released 2026-09-16T01:01:18Z at 3.628. Deliberately unlike the fixture's 2.41 on
 * 2026-09-04, so a surface still on the fixture fails these rather than passing.
 */
const RELEASED: UcpiSeriesPoint = {
  instrument: "UCPI-H100-SXM-LISTED",
  displayName: "UCPI H100 SXM Listed",
  gpu: { vendor: "NVIDIA", model: "H100", formFactor: "SXM", memoryGb: 80, label: "H100 SXM" },
  observationType: "listed",
  procurementMode: "on_demand",
  regionScope: "listed_provider_wide",
  country: null,
  attributions: ["Data: Price of Compute — priceofcompute.com"],
  calculationDate: "2026-09-15",
  status: "published",
  priceLevel: 3.628,
  currency: "USD",
  unit: "accelerator_hour",
  percentageChange1d: null,
  changeDisposition: "withheld",
  marketBreadth: "normal",
  structuralCondition: null,
  participantCount: 4,
  contributingSourceCount: 1,
  largestSourceParticipantShare: 1,
  dispersion: null,
  reasonCodes: [],
  freshness: {
    windowStart: "2026-09-15T00:00:00.000Z",
    cutoff: "2026-09-16T00:00:00.000Z",
    allInputsWithinWindow: true,
  },
  methodologyVersion: "1.0.0",
  instrumentSpecVersion: "1.0.0",
  calculatedAt: "2026-09-16T01:01:18.507Z",
  publishedAt: "2026-09-16T01:01:18.628Z",
};

const CHILD: ListedChildState = {
  symbol: "UCPI-H100-SXM-LISTED",
  displayName: "UCPI H100 SXM Listed",
  gpuLabel: "H100 SXM",
  specVersion: "1.0.0",
  latest: RELEASED,
  points: [RELEASED],
};

/** The production hydration, with the released child standing in for the database read. */
function serveProduction() {
  hydrateCompute.mockImplementation(async (market) =>
    withListedComputeInstruments(market, listedInstrumentsFrom([CHILD])),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("the UCPI market detail route serves production", () => {
  it("renders the released value and its publication timestamp, not the Sep-4 fixture", async () => {
    serveProduction();
    render(await MarketIndexPage({ params: Promise.resolve({ symbol: "ucpi" }) }));
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("UCPI-H100 SXM");
    expect(heading).not.toHaveTextContent("UCPI-UCPI");
    expect(screen.getByText(/3\.63/)).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toHaveTextContent("Sep 16, 2026");
    expect(screen.queryByText("2.41")).toBeNull();
    expect(screen.queryByText(/Sep 4, 2026/)).toBeNull();
  });

  it("does not label the released production series demo data", async () => {
    serveProduction();
    render(await MarketIndexPage({ params: Promise.resolve({ symbol: "ucpi" }) }));
    expect(screen.queryByText("Demo data")).toBeNull();
  });

  it("hydrates Compute from production, which this route previously skipped", async () => {
    serveProduction();
    await MarketIndexPage({ params: Promise.resolve({ symbol: "ucpi" }) });
    expect(hydrateCompute).toHaveBeenCalledOnce();
  });

  it("keeps the mock market intact when production has released nothing", async () => {
    // The rule that stops an empty production read blanking a working page.
    hydrateCompute.mockImplementation(async (market) => withListedComputeInstruments(market, []));
    render(await MarketIndexPage({ params: Promise.resolve({ symbol: "ucpi" }) }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("UCPI-H100");
    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });
});

describe("both UCPI market surfaces resolve the same way", () => {
  it("runs the same production hydration on /markets and /markets/ucpi", async () => {
    serveProduction();
    await MarketsPage();
    await MarketIndexPage({ params: Promise.resolve({ symbol: "ucpi" }) });
    expect(hydrateCompute).toHaveBeenCalledTimes(2);
    // Same market handed to both, so neither can drift onto a different source.
    const [indexArg] = hydrateCompute.mock.calls[0]!;
    const [detailArg] = hydrateCompute.mock.calls[1]!;
    expect(indexArg.symbol).toBe(findMarket(DEFAULT_MARKET_SYMBOL)!.symbol);
    expect(detailArg.symbol).toBe(indexArg.symbol);
  });

  it("shows the same headline value on both", async () => {
    serveProduction();
    const { unmount } = render(await MarketsPage());
    const onIndex = screen.getByText(/3\.63/).textContent;
    unmount();
    render(await MarketIndexPage({ params: Promise.resolve({ symbol: "ucpi" }) }));
    expect(screen.getByText(/3\.63/).textContent).toBe(onIndex);
  });
});
