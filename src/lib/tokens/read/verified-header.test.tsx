/**
 * "Verified" and "Updated" are different claims.
 *
 * Token Price records an observation only when a price changes, so a provider
 * re-read on 22 September whose price had not moved keeps a 14 September
 * benchmark timestamp. That is correct, and it is what the chart must keep
 * showing. What it must not do is stand in as the only date in the header,
 * because "Updated Sep 14" told a reader nobody had looked in eight days, and
 * seven people-signed attestations dated 22 September say otherwise.
 *
 * The two facts now travel separately: `snapshot.asOf` is when the value
 * entered the series, `verifiedAt` is when a person last confirmed it. These
 * tests hold them apart, including in the one case where they coincide.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketHeader } from "@/components/market-detail/market-header";
import { findMarket, MARKETS, defaultInstrument } from "@/data/mock/market-detail";
import { benchmarkLineageFromPersisted } from "@/lib/tokens/read/benchmark-store";
import type { PersistedBenchmarkRow } from "@/lib/tokens/read/benchmark-store";
import { benchmarkInstrumentsFromSeries } from "@/lib/tokens/read/instruments";
import { persistedBenchmarks } from "@/lib/tokens/read/benchmark-store";
import { latestVerificationByProvider, type TokenVerificationEvent } from "@/lib/tokens/read/verification-events";

const SEP_14_ALIBABA = "2026-09-14T17:43:35.197Z";
const SEP_14_ANTHROPIC = "2026-09-14T12:03:02.002Z";
const SEP_22 = "2026-09-22T20:26:30.000Z";

/** Production's frozen rows, as `pipeline.token_price_benchmarks` holds them. */
function frozen(
  providerSlug: string,
  model: string,
  modelName: string,
  version: string,
  at: string,
  price: number,
): PersistedBenchmarkRow {
  return {
    id: `${providerSlug}-${at}`,
    providerSlug,
    methodologyVersion: version,
    benchmarkModelId: model,
    benchmarkModelName: modelName,
    calculationStatus: "value",
    withheldReason: null,
    priceUsdPer1m: price,
    inputObservationId: `in-${providerSlug}-${at}`,
    outputObservationId: `out-${providerSlug}-${at}`,
    inputPriceUsdPer1m: price / 2,
    outputPriceUsdPer1m: price * 1.5,
    inputObservedAt: at,
    outputObservedAt: at,
    calculatedAt: at,
  };
}

/** One attestation, as the 22 September run wrote it. */
function attestation(providerSlug: string, verifiedAt: string, over: Partial<TokenVerificationEvent> = {}): TokenVerificationEvent {
  return {
    id: `${providerSlug}-verified-${verifiedAt}`,
    providerSlug,
    verifiedBy: "Bryceson",
    verifiedAt,
    evidence: "September 22 2026 human first-party pricing review",
    observedState: "value",
    benchmarkId: `${providerSlug}-bench`,
    verificationPurpose: "production",
    ...over,
  };
}

/** The load path's own mapping, without a database: events to slug-keyed instants. */
function verifiedAtMap(events: readonly TokenVerificationEvent[]): Map<string, string> {
  return new Map([...latestVerificationByProvider(events)].map(([slug, event]) => [slug, event.verifiedAt]));
}

function instrumentsFor(rows: PersistedBenchmarkRow[], events: readonly TokenVerificationEvent[]) {
  return benchmarkInstrumentsFromSeries(persistedBenchmarks(rows), benchmarkLineageFromPersisted(rows), verifiedAtMap(events));
}

const ucpi = () => findMarket("ucpi")!;

describe("1. Alibaba: an unchanged price, verified eight days later", () => {
  const rows = [frozen("alibaba", "qwen3.8-max", "Qwen3.8-Max", "1.2", SEP_14_ALIBABA, 4)];
  const events = [attestation("alibaba", SEP_14_ALIBABA), attestation("alibaba", SEP_22)];

  it("keeps the benchmark point on 14 September", () => {
    const [instrument] = instrumentsFor(rows, events);
    expect(instrument!.snapshot.asOf).toBe(Math.floor(Date.parse(SEP_14_ALIBABA) / 1000));
    expect(instrument!.series.daily).toHaveLength(1);
    expect(instrument!.series.daily[0]!.time).toBe(Math.floor(Date.parse(SEP_14_ALIBABA) / 1000));
  });

  it("carries 22 September as its verification instant", () => {
    const [instrument] = instrumentsFor(rows, events);
    expect(instrument!.verifiedAt).toBe(Math.floor(Date.parse(SEP_22) / 1000));
    // The two facts are different numbers, which is the whole point.
    expect(instrument!.verifiedAt).not.toBe(instrument!.snapshot.asOf);
  });

  it("renders Verified Sep 22 and never Updated Sep 14", () => {
    const [instrument] = instrumentsFor(rows, events);
    render(<MarketHeader market={ucpi()} instrument={instrument!} />);
    expect(screen.getByText(/^Verified Sep 22, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^Updated/)).toBeNull();
    expect(screen.queryByText(/Sep 14/)).toBeNull();
    // The value and designated model are untouched.
    expect(screen.getByText("$4.00")).toBeInTheDocument();
    expect(screen.getByText(/Qwen3\.8-Max/)).toBeInTheDocument();
  });
});

describe("2. Anthropic: unchanged history, fresh verification", () => {
  it("keeps 14 September history while the header reads 22 September", () => {
    const rows = [frozen("anthropic", "claude-fable-5-1", "Claude Fable 5.1", "1.1", SEP_14_ANTHROPIC, 30)];
    const [instrument] = instrumentsFor(rows, [attestation("anthropic", SEP_22)]);
    expect(instrument!.series.daily.map((p) => p.time)).toEqual([Math.floor(Date.parse(SEP_14_ANTHROPIC) / 1000)]);
    expect(instrument!.snapshot.asOf).toBe(Math.floor(Date.parse(SEP_14_ANTHROPIC) / 1000));

    render(<MarketHeader market={ucpi()} instrument={instrument!} />);
    expect(screen.getByText(/^Verified Sep 22, 2026/)).toBeInTheDocument();
    expect(screen.getByText("$30.00")).toBeInTheDocument();
  });
});

describe("3. xAI: the two dates coincide, and still mean different things", () => {
  const rows = [
    frozen("xai", "grok-4.6", "Grok 4.6", "1.1", SEP_14_ANTHROPIC, 4),
    frozen("xai", "grok-4.7", "Grok 4.7", "1.3", SEP_22, 4),
  ];

  it("keeps the Grok 4.7 benchmark on 22 September and both lineage points", () => {
    const [instrument] = instrumentsFor(rows, [attestation("xai", SEP_22)]);
    expect(instrument!.snapshot.asOf).toBe(Math.floor(Date.parse(SEP_22) / 1000));
    expect(instrument!.series.daily).toHaveLength(2);
    expect(instrument!.name).toContain("Grok 4.7");
    // Still withheld across the constituent boundary.
    expect(instrument!.snapshot.changePercent).toBeNull();
  });

  it("reads Verified Sep 22 without collapsing the two facts into one", () => {
    const [instrument] = instrumentsFor(rows, [attestation("xai", SEP_22)]);
    expect(instrument!.verifiedAt).toBe(Math.floor(Date.parse(SEP_22) / 1000));
    render(<MarketHeader market={ucpi()} instrument={instrument!} />);
    expect(screen.getByText(/^Verified Sep 22, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^Updated/)).toBeNull();
  });

  it("does not take its verification date from the benchmark, even when they agree", () => {
    // Verified a day later than the benchmark: the header must follow the
    // attestation, proving the coincidence above was not the source.
    const later = "2026-09-23T09:00:00.000Z";
    const [instrument] = instrumentsFor(rows, [attestation("xai", later)]);
    expect(instrument!.snapshot.asOf).toBe(Math.floor(Date.parse(SEP_22) / 1000));
    expect(instrument!.verifiedAt).toBe(Math.floor(Date.parse(later) / 1000));
  });
});

describe("4. a newer verification creates no price history", () => {
  it("adds no point, moves no value and changes no benchmark instant", () => {
    const rows = [frozen("google", "gemini-3.1-pro-preview", "Gemini 3.1 Pro Preview", "1.2", SEP_14_ALIBABA, 7)];
    const withoutEvents = benchmarkInstrumentsFromSeries(persistedBenchmarks(rows), benchmarkLineageFromPersisted(rows));
    const withEvents = instrumentsFor(rows, [attestation("google", SEP_22)]);

    expect(withEvents[0]!.series).toEqual(withoutEvents[0]!.series);
    expect(withEvents[0]!.snapshot).toEqual(withoutEvents[0]!.snapshot);
    expect(withEvents[0]!.availableRanges).toEqual(withoutEvents[0]!.availableRanges);
    // The only difference the attestation makes is the header's claim.
    expect(withoutEvents[0]!.verifiedAt).toBeUndefined();
    expect(withEvents[0]!.verifiedAt).toBe(Math.floor(Date.parse(SEP_22) / 1000));
  });
});

describe("5. products with no verification concept are untouched", () => {
  it("keeps Updated on a non-token market header", () => {
    const market = MARKETS[0]!;
    const instrument = defaultInstrument(market)!;
    expect(instrument.verifiedAt).toBeUndefined();
    render(<MarketHeader market={market} instrument={instrument} />);
    expect(screen.getByText(/^Updated /)).toBeInTheDocument();
    expect(screen.queryByText(/^Verified /)).toBeNull();
  });
});

describe("6. a missing attestation is never papered over", () => {
  const rows = [frozen("moonshot", "kimi-k3", "Kimi K3", "1.2", SEP_14_ALIBABA, 9)];

  it("falls back to Updated against the benchmark instant, not Verified", () => {
    const [instrument] = instrumentsFor(rows, []);
    expect(instrument!.verifiedAt).toBeUndefined();
    render(<MarketHeader market={ucpi()} instrument={instrument!} />);
    expect(screen.getByText(/^Updated Sep 14, 2026/)).toBeInTheDocument();
    expect(screen.queryByText(/^Verified/)).toBeNull();
  });

  it("ignores an attestation that names no benchmark, however recent", () => {
    // The fail-closed rule the watchdog uses, applied to the header by the same
    // selector: evidence that points at no state is evidence of nothing.
    const stray = attestation("moonshot", SEP_22, { benchmarkId: null });
    const [instrument] = instrumentsFor(rows, [stray]);
    expect(instrument!.verifiedAt).toBeUndefined();
    render(<MarketHeader market={ucpi()} instrument={instrument!} />);
    expect(screen.getByText(/^Updated Sep 14, 2026/)).toBeInTheDocument();
  });

  it("never borrows another provider's attestation", () => {
    const [instrument] = instrumentsFor(rows, [attestation("anthropic", SEP_22)]);
    expect(instrument!.verifiedAt).toBeUndefined();
  });

  it("takes the newest attestation when a provider has several", () => {
    const events = [attestation("moonshot", SEP_22), attestation("moonshot", SEP_14_ALIBABA)];
    const [instrument] = instrumentsFor(rows, events);
    expect(instrument!.verifiedAt).toBe(Math.floor(Date.parse(SEP_22) / 1000));
  });
});
