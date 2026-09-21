/**
 * Technology composition on the Interconnection Queue section.
 *
 * The interesting cases are all about denominators and absence. A hybrid names two technologies
 * and must stay one project; a market whose rows carry a status must contribute nothing rather
 * than a zero; and SPP must not reach the markup at all, because the read model it is rendered
 * from has already filtered it in SQL.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InterconnectionQueue, technologyComposition }
  from "@/components/power-analytics/interconnection-queue";
import type { MarketAnalytics, MetricValue, QueueAnalyticsReadModel }
  from "@/lib/interconnection-queue/analytics/read";

const metric = (overrides: Partial<MetricValue> & Pick<MetricValue, "metric">): MetricValue => ({
  label: "", family: "mix", comparability: "A", dimension: null, status: "live", value: 0,
  unit: "requests", nativeField: null, basis: null, sampleSize: 0, populationSize: 0,
  coverage: {}, ...overrides,
});

const technology = (value: string, count: number | null, population: number,
  status: MetricValue["status"] = "live"): MetricValue =>
  metric({
    metric: "active_request_count_by_technology", dimension: { kind: "technology", value },
    status, value: count, sampleSize: count ?? 0, populationSize: population,
    coverage: { multiLabel: true, note: "a project is counted once per technology it names" },
  });

const market = (slug: string, name: string, active: number, metrics: MetricValue[]): MarketAnalytics => ({
  marketSlug: slug, marketName: name, sourceName: `${name} source`, attribution: null,
  metrics: [metric({ metric: "active_request_count", value: active, sampleSize: active }), ...metrics],
});

const model = (markets: MarketAnalytics[],
  overrides: Partial<QueueAnalyticsReadModel> = {}): QueueAnalyticsReadModel => ({
  methodology: {
    slug: "interconnection-queue-analytics", version: "1.0.0",
    documentPath: "/docs/methodology/interconnection-queue-analytics",
    title: "Urdais Interconnection Queue Analytics",
  },
  calculatedAt: "2026-09-21T21:24:53.637Z",
  inputDigest: "digest", snapshotCount: 1, markets,
  excludedMarkets: [], deferredMetrics: [], notes: [], ...overrides,
});

describe("technologyComposition", () => {
  it("aggregates the rows the API already serves", () => {
    const composition = technologyComposition(model([
      market("pjm", "PJM", 2781, [technology("solar", 1960, 2781), technology("wind", 179, 2781)]),
      market("caiso", "CAISO", 262, [technology("solar", 143, 262), technology("battery_storage", 242, 262)]),
    ]));

    expect(composition.rows.map((row) => [row.technology, row.count])).toEqual([
      ["solar", 2103], ["battery_storage", 242], ["wind", 179],
    ]);
    expect(composition.projects).toBe(3043);
    expect(composition.contributing).toEqual(["PJM", "CAISO"]);
  });

  it("keeps a hybrid one project, so shares exceed 100% rather than the count inflating", () => {
    // One market, 100 projects, 40 of which name both solar and a battery.
    const composition = technologyComposition(model([
      market("caiso", "CAISO", 100, [technology("solar", 70, 100), technology("battery_storage", 40, 100)]),
    ]));

    // The denominator is projects, never the sum of the technology counts.
    expect(composition.projects).toBe(100);
    expect(composition.rows.find((row) => row.technology === "solar")!.share).toBeCloseTo(0.7);
    expect(composition.rows.find((row) => row.technology === "battery_storage")!.share).toBeCloseTo(0.4);
    const total = composition.rows.reduce((sum, row) => sum + row.share, 0);
    expect(total).toBeCloseTo(1.1);
    // Had the sum of counts (110) been used, solar would be understated at 0.636.
    expect(composition.rows[0]!.share).not.toBeCloseTo(70 / 110);
  });

  it("never turns an absent technology row into a zero", () => {
    const composition = technologyComposition(model([
      market("pjm", "PJM", 2781, [technology("solar", 1960, 2781)]),
      market("iso-ne", "ISO-NE", 28, [technology("solar", null, 28, "insufficient_sample")]),
    ]));

    expect(composition.contributing).toEqual(["PJM"]);
    expect(composition.omitted).toEqual([
      { marketName: "ISO-NE", note: "28 projects, below the sample floor" },
    ]);
    // ISO-NE's 28 projects are not in the denominator, and contribute no zero-count technology.
    expect(composition.projects).toBe(2781);
    expect(composition.rows.every((row) => row.count > 0)).toBe(true);
  });

  it("reports an empty composition rather than an invented one when nothing is live", () => {
    const composition = technologyComposition(model([
      market("iso-ne", "ISO-NE", 28, [technology("solar", null, 28, "insufficient_sample")]),
    ]));
    expect(composition.rows).toEqual([]);
    expect(composition.projects).toBe(0);
  });
});

describe("InterconnectionQueue technology section", () => {
  const populated = model([
    market("pjm", "PJM", 2781, [technology("solar", 1960, 2781), technology("battery_storage", 918, 2781)]),
    market("iso-ne", "ISO-NE", 28, [technology("solar", null, 28, "insufficient_sample")]),
  ], {
    excludedMarkets: [{
      marketSlug: "spp", marketName: "SPP",
      reason: "the source terms exclude commercial publication",
    }],
  });

  it("renders the served rows with counts and shares", () => {
    render(<InterconnectionQueue analytics={populated} />);
    const list = screen.getByLabelText("Active interconnection requests by technology");
    expect(within(list).getByText("Solar")).toBeTruthy();
    expect(within(list).getByText("1,960")).toBeTruthy();
    expect(within(list).getByText("Battery storage")).toBeTruthy();
    expect(within(list).getByText("918")).toBeTruthy();
  });

  it("states the project denominator and the hybrid caveat rather than implying a pie", () => {
    render(<InterconnectionQueue analytics={populated} />);
    expect(screen.getByText(/counted under each, so the shares total more than 100%/i)).toBeTruthy();
    expect(screen.getByText(/Counts are projects, not megawatts/i)).toBeTruthy();
  });

  it("names the markets it excludes and disclaims national coverage", () => {
    render(<InterconnectionQueue analytics={populated} />);
    expect(screen.getByText(/ISO-NE \(28 projects, below the sample floor\)/)).toBeTruthy();
    expect(screen.getByText(/not of the United States/i)).toBeTruthy();
  });

  it("renders no SPP value anywhere in the markup", () => {
    const { container } = render(<InterconnectionQueue analytics={populated} />);
    const html = container.innerHTML;
    // SPP is named as excluded, and carries no number.
    expect(html).toContain("SPP");
    const list = screen.getByLabelText("Active interconnection requests by technology");
    expect(list.innerHTML).not.toContain("SPP");
  });

  it("renders an unavailable state instead of an empty chart when nothing is live", () => {
    render(<InterconnectionQueue analytics={model([
      market("iso-ne", "ISO-NE", 28, [technology("solar", null, 28, "insufficient_sample")]),
    ])} />);
    expect(screen.getByText(/No market currently publishes a technology breakdown/i)).toBeTruthy();
    expect(screen.queryByLabelText("Active interconnection requests by technology")).toBeNull();
  });

  it("keeps project completion prominent above the fold of the outcome cards", () => {
    render(<InterconnectionQueue analytics={populated} />);
    expect(screen.getByText("Project completion rate")).toBeTruthy();
  });
});

describe("no mock technology data", () => {
  it("the component references no mock module", async () => {
    const source = await import("node:fs/promises")
      .then((fs) => fs.readFile("src/components/power-analytics/interconnection-queue.tsx", "utf8"));
    expect(source).not.toMatch(/data\/mock/);
    expect(source).not.toMatch(/MOCK_|mockTechnolog|sampleTechnolog/);
  });
});
