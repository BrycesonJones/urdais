import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DetailedMarketChart } from "@/components/charts/detailed-market-chart";
import { ListedMarketList } from "@/components/market-detail/listed-market-list";
import { ListedMarketMeta } from "@/components/market-detail/listed-market-meta";
import { MarketHeader } from "@/components/market-detail/market-header";
import { MarketDetailPage } from "@/components/market-detail/market-detail-page";
import { MAX_COMPARISONS } from "@/components/market-detail/use-instrument-chart";
import { PRICE_OF_COMPUTE_ATTRIBUTION } from "@/lib/ucpi/adapters/price-of-compute";
import { PUBLIC_SERIES_POINT_KEYS, toSeriesPoint, validatePublicResponseShape } from "@/lib/ucpi/api-contract";
import { CONSTITUENT_FIELDS } from "@/lib/ucpi/api-contract";
import { LISTED_GPU_INSTRUMENTS } from "@/lib/ucpi/listed/instruments";
import { overlayListedCompute, loadMarket } from "@/lib/markets/load-market";
import { toListedMarketInstrument } from "@/lib/markets/listed-instrument";
import { handleListedInstrument, handleListedInstruments, handleListedSeries } from "@/lib/ucpi/read/http";
import { runListedCandidate, listedCandidateView, developmentListedCandidates } from "@/lib/ucpi/read/listed-candidates";
import { getListedSeries, listListedMarketViews } from "@/lib/ucpi/read/listed-markets";
import { PUBLIC_LISTED_MARKET_KEYS, validateListedMarketView } from "@/lib/ucpi/read/listed-view";
import { listedPublicSeriesQuery } from "@/lib/ucpi/read/sql-series";
import { showListedCandidates } from "@/lib/ucpi/read/show-candidates";
import { REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { findMarket } from "@/data/mock/market-detail";
import { UCPI_INDEX } from "@/data/mock/ucpi";

function leakScan(value: unknown): string[] {
  const reasons: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (typeof node !== "object" || node === null) return;
    for (const [key, nested] of Object.entries(node)) {
      if (CONSTITUENT_FIELDS.includes(key)) reasons.push(`${path}.${key}`);
      walk(nested, path ? `${path}.${key}` : key);
    }
  };
  walk(value, "");
  return reasons;
}

async function jsonOf(response: Response): Promise<unknown> {
  return JSON.parse(await response.text()) as unknown;
}

describe("listed candidate read model", () => {
  const candidates = developmentListedCandidates();
  const bySymbol = Object.fromEntries(candidates.map((view) => [view.symbol, view]));

  it("H100 SXM candidate: 3.74, Normal, 4 participants, Price of Compute attribution", () => {
    const view = bySymbol["UCPI-H100-SXM-LISTED"]!;
    expect(view).toMatchObject({
      gpuLabel: "H100 SXM",
      breadth: "normal",
      participantCount: 4,
      technicalSourceCount: 1,
      status: "candidate",
      isCandidate: true,
      isPublished: false,
      observationType: "listed",
      procurementMode: "on_demand",
      attributions: [PRICE_OF_COMPUTE_ATTRIBUTION],
      oneDayPctChange: null,
    });
    expect(view.price).toBeCloseTo(3.74);
  });

  it("H200 SXM candidate: 4.395, Minimum, 2 participants", () => {
    const view = bySymbol["UCPI-H200-SXM-LISTED"]!;
    expect(view.price).toBeCloseTo(4.395);
    expect(view).toMatchObject({ gpuLabel: "H200 SXM", breadth: "minimum", participantCount: 2, status: "candidate", isPublished: false });
  });

  it("B200 candidate: 6.79, Normal, 3 participants", () => {
    const view = bySymbol["UCPI-B200-LISTED"]!;
    expect(view.price).toBeCloseTo(6.79);
    expect(view).toMatchObject({ gpuLabel: "B200", breadth: "normal", participantCount: 3, status: "candidate" });
  });

  it("A100 SXM4 80GB candidate: 1.736, Normal, 3 participants", () => {
    const view = bySymbol["UCPI-A100-SXM4-80GB-LISTED"]!;
    expect(view.price).toBeCloseTo(1.736);
    expect(view).toMatchObject({ gpuLabel: "A100 SXM4 80GB", breadth: "normal", participantCount: 3, status: "candidate" });
  });

  it("RTX 5090 is unavailable: SINGLE_PARTICIPANT, one eligible participant, no fabricated price", () => {
    const view = bySymbol["UCPI-RTX-5090-LISTED"]!;
    expect(view).toMatchObject({
      gpuLabel: "RTX 5090",
      price: null,
      status: "unavailable",
      availabilityState: "unavailable",
      participantCount: 1,
      minimumParticipants: 2,
      structuralCondition: "SINGLE_PARTICIPANT",
      isCandidate: true,
      isPublished: false,
    });
  });
});

describe("candidate vs published semantics", () => {
  it("a candidate is never marked published, and production-hidden rows expose no price", async () => {
    const hidden = await listListedMarketViews({ allowCandidates: false });
    for (const view of hidden) {
      expect(view.isCandidate).toBe(false);
      expect(view.isPublished).toBe(false);
      expect(view.status).toBe("no_calculation");
      expect(view.price).toBeNull();
      expect(view.participantCount).toBe(0);
      expect(view.attributions).toEqual([]);
      expect(validateListedMarketView(JSON.parse(JSON.stringify(view)))).toEqual([]);
    }
  });

  it("a persisted calculation series replaces the candidate without a frontend shape change", async () => {
    const persistence = new InMemoryPersistence();
    const h100 = runListedCandidate("UCPI-H100-SXM-LISTED").regional[0]!;
    await persistence.insertRegionalObservation({
      ...h100,
      id: "ro-h100",
      runId: "run-1",
      runKind: "production",
      calculatedAt: "2026-09-15T00:01:00Z",
      supersededById: null,
    });
    const views = await listListedMarketViews({ persistence, allowCandidates: true });
    const listed = views.find((view) => view.symbol === "UCPI-H100-SXM-LISTED")!;
    expect(listed.isCandidate).toBe(false);
    expect(listed.isPublished).toBe(false);
    expect(listed.status).toBe("delayed");
    expect(listed.price).toBeCloseTo(3.74);
    expect(listed.gpuLabel).toBe("H100 SXM");
    expect(Object.keys(listed).sort()).toEqual([...PUBLIC_LISTED_MARKET_KEYS].sort());
  });

  it("a timely publication flips the same view to published", async () => {
    const persistence = new InMemoryPersistence();
    const h100 = runListedCandidate("UCPI-H100-SXM-LISTED").regional[0]!;
    await persistence.insertRegionalObservation({
      ...h100,
      id: "ro-h100",
      runId: "run-1",
      runKind: "production",
      calculatedAt: "2026-09-15T00:01:00Z",
      supersededById: null,
    });
    await persistence.insertPublication({
      id: "pub-1",
      regionalObservationId: "ro-h100",
      publishedAt: "2026-09-15T00:03:00Z",
      publicationStatus: "published",
      publisherIdentity: "test",
    });
    const listed = (await listListedMarketViews({ persistence, allowCandidates: false })).find((view) => view.symbol === "UCPI-H100-SXM-LISTED")!;
    expect(listed.isPublished).toBe(true);
    expect(listed.isCandidate).toBe(false);
    expect(listed.status).toBe("published");
    expect(listed.price).toBeCloseTo(3.74);
  });

  it("showListedCandidates is off in production and on only when explicitly enabled", () => {
    expect(showListedCandidates({ NODE_ENV: "production" })).toBe(false);
    expect(showListedCandidates({ NODE_ENV: "test" })).toBe(false);
    expect(showListedCandidates({ NODE_ENV: "development" })).toBe(true);
    expect(showListedCandidates({ NODE_ENV: "production", UCPI_SHOW_CANDIDATES: "1" })).toBe(true);
    expect(showListedCandidates({ NODE_ENV: "development", UCPI_SHOW_CANDIDATES: "0" })).toBe(false);
  });
});

describe("percentage-only change, attribution, breadth, sources", () => {
  it("the public view has oneDayPctChange and no absolute-change field", () => {
    const view = listedCandidateView("UCPI-H100-SXM-LISTED");
    const json = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
    expect("oneDayPctChange" in json).toBe(true);
    expect("priceChange" in json).toBe(false);
    expect("absoluteChange" in json).toBe(false);
    expect("changeAmount" in json).toBe(false);
    expect(json.oneDayPctChange).toBeNull();
  });

  it("attribution, breadth and source count render from the mapped instrument", () => {
    const view = listedCandidateView("UCPI-H200-SXM-LISTED");
    const instrument = toListedMarketInstrument(view, [view]);
    expect(instrument.listed?.attributions).toEqual([PRICE_OF_COMPUTE_ATTRIBUTION]);
    expect(instrument.listed?.breadth).toBe("minimum");
    expect(instrument.listed?.technicalSourceCount).toBe(1);
    render(<ListedMarketList instruments={[instrument]} selectedId={instrument.id} onSelect={() => undefined} />);
    expect(screen.getByText("H200 SXM")).toBeInTheDocument();
    expect(screen.getByText("$4.395/hr")).toBeInTheDocument();
    expect(screen.getByText("Minimum breadth")).toBeInTheDocument();
    expect(screen.getByText("Listed On-Demand Price")).toBeInTheDocument();
  });
});

describe("unavailable reason and no leakage", () => {
  it("renders SINGLE_PARTICIPANT without seller identity", () => {
    const views = developmentListedCandidates();
    const rtx = toListedMarketInstrument(
      views.find((view) => view.symbol === "UCPI-RTX-5090-LISTED")!,
      views,
    );
    render(<ListedMarketMeta instrument={rtx} />);
    expect(screen.getByText("SINGLE_PARTICIPANT")).toBeInTheDocument();
    expect(screen.getByText(/1 of 2 required/)).toBeInTheDocument();
    expect(screen.queryByText(/runpod/i)).toBeNull();
    expect(leakScan(JSON.parse(JSON.stringify(rtx.listed)))).toEqual([]);
  });

  it("candidate and series JSON never include constituent fields", async () => {
    const views = await listListedMarketViews({ allowCandidates: true });
    expect(leakScan(views)).toEqual([]);
    for (const view of views) expect(validateListedMarketView(JSON.parse(JSON.stringify(view)))).toEqual([]);
    const point = toSeriesPoint(runListedCandidate("UCPI-B200-LISTED").regional[0]!, { calculatedAt: "2026-09-15T00:01:00Z", publishedAt: null });
    expect(validatePublicResponseShape(JSON.parse(JSON.stringify(point)))).toEqual([]);
    expect(Object.keys(point).sort()).toEqual([...PUBLIC_SERIES_POINT_KEYS].sort());
  });
});

describe("no early publication and no fake history", () => {
  it("reading candidates does not create calculation runs or publications", async () => {
    const persistence = new InMemoryPersistence();
    await listListedMarketViews({ persistence, allowCandidates: true });
    expect(persistence.runs).toEqual([]);
    expect(persistence.publications).toEqual([]);
    expect(persistence.regional).toEqual([]);
  });

  it("the series endpoint is empty until a calculation exists, even when candidates are shown", async () => {
    const persistence = new InMemoryPersistence();
    const body = (await jsonOf(await handleListedSeries("UCPI-H100-SXM-LISTED", { persistence, allowCandidates: true }))) as { points: unknown[] };
    expect(body.points).toEqual([]);
    expect(await getListedSeries("UCPI-H100-SXM-LISTED", persistence)).toEqual([]);
  });

  it("two calculation points become a real series; one point is not fabricated into a flat history", async () => {
    const persistence = new InMemoryPersistence();
    const first = runListedCandidate("UCPI-H100-SXM-LISTED").regional[0]!;
    await persistence.insertRegionalObservation({ ...first, id: "ro-1", runId: "run-1", runKind: "production", calculatedAt: "2026-09-15T00:01:00Z", supersededById: null });
    const points = await getListedSeries("UCPI-H100-SXM-LISTED", persistence);
    expect(points).toHaveLength(1);
    expect(points![0]!.priceLevel).toBeCloseTo(3.74);
    const delayed = (await listListedMarketViews({ persistence, allowCandidates: false })).find((view) => view.symbol === "UCPI-H100-SXM-LISTED")!;
    const instrument = toListedMarketInstrument(delayed, [], points ?? []);
    expect(delayed.isCandidate).toBe(false);
    expect(instrument.series.daily).toHaveLength(1);
    expect(instrument.series.daily[0]!.value).toBeCloseTo(3.74);
    expect(instrument.series.intraday).toEqual([]);
  });
});

describe("chart no-history and compare", () => {
  it("the chart empty state copy is shown when there is no historical series", () => {
    class FakeResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    render(
      <DetailedMarketChart
        primary={{ id: "h100", label: "H100 SXM Listed", unit: "$/hr", points: [] }}
        comparisons={[]}
        basis="relative"
        intraday={false}
        label="H100 SXM Listed chart"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Historical series begins after the first recorded Urdais calculation.");
  });

  it("listed instruments compare with each other on a relative basis, max four series unchanged", async () => {
    expect(MAX_COMPARISONS).toBe(3);
    const market = await overlayListedCompute(findMarket("ucpi")!, { allowCandidates: true });
    const compute = market.families.find((family) => family.id === "compute")!;
    expect(compute.instruments).toHaveLength(5);
    for (const instrument of compute.instruments) {
      expect(instrument.comparisons).toHaveLength(4);
      expect(instrument.comparisons.every((option) => option.basis === "relative")).toBe(true);
      expect(instrument.comparisons.map((option) => option.label)).toEqual(
        expect.arrayContaining(["H100 SXM Listed", "H200 SXM Listed", "B200 Listed", "A100 SXM4 80GB Listed", "RTX 5090 Listed"].filter((label) => label !== instrument.symbol)),
      );
    }
  });
});

describe("API shape, methodology links, H100 regression, permissions, zero pubs", () => {
  it("the instruments API returns the canonical view and 404s unknown ids", async () => {
    const list = (await jsonOf(await handleListedInstruments({ allowCandidates: true }))) as { instruments: { symbol: string; price: number | null }[] };
    expect(list.instruments.map((row) => row.symbol)).toEqual(LISTED_GPU_INSTRUMENTS.map((instrument) => instrument.symbol));
    const h100 = await jsonOf(await handleListedInstrument("ucpi-h100-sxm-listed", { allowCandidates: true }));
    expect((h100 as { instrument: { price: number } }).instrument.price).toBeCloseTo(3.74);
    expect((await handleListedInstrument("UCPI-NOPE", { allowCandidates: true })).status).toBe(404);
  });

  it("production-shaped API responses hide candidate prices", async () => {
    const list = (await jsonOf(await handleListedInstruments({ allowCandidates: false }))) as { instruments: { price: number | null; isCandidate: boolean }[] };
    expect(list.instruments.every((row) => row.price === null && row.isCandidate === false)).toBe(true);
  });

  it("methodology links point at the family and child specifications", () => {
    const view = listedCandidateView("UCPI-B200-LISTED");
    const instrument = toListedMarketInstrument(view, [view]);
    expect(instrument.listed?.familyMethodologyHref).toBe("/docs/methodology/ucpi-listed-gpu");
    expect(instrument.listed?.childMethodologyHref).toBe("/docs/methodology/ucpi-b200-listed");
    render(<ListedMarketMeta instrument={instrument} />);
    expect(screen.getByRole("link", { name: "Listed GPU methodology" })).toHaveAttribute("href", "/docs/methodology/ucpi-listed-gpu");
    expect(screen.getByRole("link", { name: "B200 specification" })).toHaveAttribute("href", "/docs/methodology/ucpi-b200-listed");
  });

  it("H100 historical regression: frozen candidate remains 3.74 with four participants", () => {
    const obs = runListedCandidate("UCPI-H100-SXM-LISTED").regional[0]!;
    expect(obs.priceLevel).toBeCloseTo(3.74);
    expect(obs.participantCount).toBe(4);
    expect(obs.marketBreadth).toBe("normal");
  });

  it("direct-source permission classifications are unchanged", () => {
    const runpod = REGISTRY_TODAY.find((source) => source.slug === "runpod-gpu-types")!;
    const lambda = REGISTRY_TODAY.find((source) => source.slug === "lambda-instance-types")!;
    const vast = REGISTRY_TODAY.find((source) => source.slug === "vast-ai-offer-search")!;
    expect(runpod.productionAccessState).toBe("production_blocked");
    expect(lambda.productionAccessState).toBe("production_blocked");
    expect(vast.productionAccessState).toBe("production_blocked");
  });

  it("the SQL public series query never selects constituent or payload columns", () => {
    const query = listedPublicSeriesQuery("UCPI-H100-SXM-LISTED");
    expect(query.text).not.toMatch(/participants|raw_payload|representative_price|permission_grants|seller_entity/);
    expect(query.params).toEqual(["UCPI-H100-SXM-LISTED"]);
  });
});

describe("frontend overlay and header states", () => {
  it("UCPI compute family is the listed read model; other markets stay mock", async () => {
    const ucpi = await loadMarket("ucpi", { allowCandidates: true });
    const ugai = await loadMarket("ugai", { allowCandidates: true });
    expect(ucpi!.families.find((family) => family.id === "compute")!.instruments.map((instrument) => instrument.shortLabel)).toEqual([
      "H100 SXM",
      "H200 SXM",
      "B200",
      "A100 SXM4 80GB",
      "RTX 5090",
    ]);
    expect(ugai!.symbol).toBe(findMarket("ugai")!.symbol);
    expect(ugai!.defaultInstrumentId).toBe(findMarket("ugai")!.defaultInstrumentId);
  });

  it("the header shows Candidate for a priced GPU and Unavailable for RTX 5090", async () => {
    const market = await overlayListedCompute(findMarket("ucpi")!, { allowCandidates: true });
    const compute = market.families.find((family) => family.id === "compute")!;
    const h100 = compute.instruments[0]!;
    const rtx = compute.instruments.find((instrument) => instrument.shortLabel === "RTX 5090")!;
    const { rerender } = render(<MarketHeader market={market} instrument={h100} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("H100 SXM");
    expect(screen.getByText("Candidate")).toBeInTheDocument();
    expect(screen.getByText("Listed On-Demand Price")).toBeInTheDocument();
    expect(screen.getByText("3.74")).toBeInTheDocument();
    expect(screen.getByText("$/hr")).toBeInTheDocument();
    rerender(<MarketHeader market={market} instrument={rtx} />);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByText("0.99")).toBeNull();
  });

  it("selecting RTX 5090 from the listed strip updates the detail header", async () => {
    class FakeResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
    const market = await overlayListedCompute(findMarket("ucpi")!, { allowCandidates: true });
    render(<MarketDetailPage market={market} />);
    fireEvent.click(screen.getByRole("button", { name: /RTX 5090, Unavailable/ }));
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("RTX 5090");
    expect(screen.getByText("SINGLE_PARTICIPANT")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RTX 5090 specification" })).toHaveAttribute("href", "/docs/methodology/ucpi-rtx-5090-listed");
  });

  it("the homepage UCPI snapshot is still demo data, not a listed candidate", () => {
    expect(UCPI_INDEX.symbol).toBe("UCPI");
  });
});
