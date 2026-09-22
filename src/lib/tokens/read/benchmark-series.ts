/**
 * Derivation layer: canonical model observations to provider Token Price
 * series, under docs/methodology/token-price.md.
 *
 *   canonical model token observations
 *     -> eligible benchmark legs (standard tier, base context, default region)
 *     -> calculation events (newest input state, newest output state)
 *     -> provider Token Price series
 *
 * Raw observations are never modified, and the derived value is never stored
 * or presented as a provider quote: every point carries the designated model
 * and the methodology version that produced it.
 *
 * History is assembled one designation segment at a time. Each segment uses
 * the model designated for that period and the methodology version in force
 * on each event's own date, so a later designation or a later methodology
 * version cannot change a value computed earlier. The segments are then
 * concatenated in time order to give the provider's published history.
 *
 * A calculation event is an eligible leg observation. At each event the
 * benchmark is computed from the newest eligible input and the newest
 * eligible output known as of that event, because a provider's legs change
 * independently and ingestion records a row only when a price changes. The
 * point's timestamp is the later of the two leg observations used, so it is
 * always a real source time and never a rounded date boundary.
 */

import type { PublicTokenBenchmarkSeries, PublicTokenSeries } from "@/lib/tokens/read/api-contract";
import {
  TOKEN_PRICE_BENCHMARK_NAME,
  TOKEN_PRICE_UNIT,
  benchmarkLineageKey,
  benchmarkPointKey,
  benchmarkProviders,
  constituentInForce,
  constituentSegments,
  isEligibleLeg,
  methodologyInForce,
  tokenBenchmarkPrice,
  type TokenBenchmarkConstituent,
  type TokenBenchmarkWithheld,
} from "@/lib/tokens/read/benchmark";
import { providerDisplayName } from "@/lib/tokens/read/labels";

export type BenchmarkPoint = {
  providerSlug: string;
  /** The later of the two leg observation times used. A real source timestamp. */
  time: string;
  priceUsdPer1m: number;
  providerModelId: string;
  benchmarkModelName: string;
  methodologyVersion: string;
  /** The leg observations that produced it, for lineage and verification. */
  inputAt: string;
  outputAt: string;
  inputPriceUsdPer1m: number;
  outputPriceUsdPer1m: number;
  /** Canonical observation ids when a lineage index was supplied; null otherwise. */
  inputObservationId: string | null;
  outputObservationId: string | null;
};

export type BenchmarkCurrentStatus =
  | { ok: true; providerModelId: string }
  | { ok: false; reason: TokenBenchmarkWithheld; providerModelId: string | null };

export type ProviderBenchmark = {
  providerSlug: string;
  providerName: string;
  /** The last successfully calculated value, from whichever designation produced it. Null when none ever was. */
  series: PublicTokenBenchmarkSeries | null;
  /** Whether the designation in force today can be calculated. Independent of the value above. */
  current: BenchmarkCurrentStatus;
};

type LegPoint = { time: string; price: number; observationId: string | null };

/** `seriesId|time` to canonical observation id, so a frozen point names its legs. */
export type LegLineageIndex = ReadonlyMap<string, string>;

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function percentageChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10_000) / 10_000;
}

/** Every observation of one leg, in time order, deduplicated by timestamp. */
function legPoints(series: readonly PublicTokenSeries[], lineage?: LegLineageIndex): LegPoint[] {
  const byTime = new Map<string, LegPoint>();
  for (const row of series) {
    for (const point of row.history) {
      byTime.set(point.time, {
        time: point.time,
        price: point.priceUsdPer1m,
        observationId: lineage?.get(`${row.seriesId}|${point.time}`) ?? null,
      });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time.localeCompare(b.time));
}

/** The newest leg value at or before a moment; undefined when the leg was not yet known. */
function stateAt(points: readonly LegPoint[], at: string): LegPoint | undefined {
  let found: LegPoint | undefined;
  for (const point of points) {
    if (point.time.localeCompare(at) > 0) break;
    found = point;
  }
  return found;
}

/**
 * One designation's points. Events are the eligible leg observations inside
 * the segment; each is computed from the state of both legs at that moment,
 * under the methodology version in force on that event's date.
 */
function segmentPoints(
  constituent: TokenBenchmarkConstituent,
  from: string,
  until: string | null,
  inputs: readonly LegPoint[],
  outputs: readonly LegPoint[],
  benchmarkModelName: string,
  providerSlug: string,
): BenchmarkPoint[] {
  const events = [...new Set([...inputs, ...outputs].map((point) => point.time))]
    .filter((time) => dayOf(time) >= from && (until === null || dayOf(time) < until))
    .sort();

  const points: BenchmarkPoint[] = [];
  for (const at of events) {
    const input = stateAt(inputs, at);
    const output = stateAt(outputs, at);
    if (input === undefined || output === undefined) continue;
    const methodology = methodologyInForce(dayOf(at));
    if (methodology === undefined) continue;
    const price = tokenBenchmarkPrice(input.price, output.price, methodology);
    const previous = points[points.length - 1];
    // Identical state under the same model and version confirms the last point rather than adding one.
    if (
      previous &&
      previous.priceUsdPer1m === price &&
      previous.providerModelId === constituent.providerModelId &&
      previous.methodologyVersion === methodology.version
    ) {
      continue;
    }
    points.push({
      providerSlug,
      // The later of the two legs used is the moment both supported this value.
      time: input.time.localeCompare(output.time) >= 0 ? input.time : output.time,
      priceUsdPer1m: price,
      providerModelId: constituent.providerModelId,
      benchmarkModelName,
      methodologyVersion: methodology.version,
      inputAt: input.time,
      outputAt: output.time,
      inputPriceUsdPer1m: input.price,
      outputPriceUsdPer1m: output.price,
      inputObservationId: input.observationId,
      outputObservationId: output.observationId,
    });
  }
  return points;
}

function legsFor(series: readonly PublicTokenSeries[], constituent: TokenBenchmarkConstituent, lineage?: LegLineageIndex) {
  const eligible = series.filter((row) => isEligibleLeg(row, constituent));
  return {
    inputs: legPoints(eligible.filter((row) => row.pricingDimension === "input"), lineage),
    outputs: legPoints(eligible.filter((row) => row.pricingDimension === "output"), lineage),
    displayName: eligible[0]?.displayName ?? constituent.providerModelId,
  };
}

/** Whether the designation in force today has what it needs. Reported separately from the last good value. */
function currentStatus(providerSlug: string, series: readonly PublicTokenSeries[], onDate: string): BenchmarkCurrentStatus {
  const constituent = constituentInForce(providerSlug, onDate);
  if (!constituent) return { ok: false, reason: "NO_CONSTITUENT_DESIGNATED", providerModelId: null };
  if (methodologyInForce(onDate) === undefined) return { ok: false, reason: "NO_METHODOLOGY_VERSION_IN_FORCE", providerModelId: constituent.providerModelId };
  const { inputs, outputs } = legsFor(series, constituent);
  if (inputs.length === 0) return { ok: false, reason: "INPUT_LEG_UNAVAILABLE", providerModelId: constituent.providerModelId };
  if (outputs.length === 0) return { ok: false, reason: "OUTPUT_LEG_UNAVAILABLE", providerModelId: constituent.providerModelId };
  const latestEvent = [...inputs, ...outputs].map((point) => point.time).sort().pop()!;
  if (stateAt(inputs, latestEvent) === undefined || stateAt(outputs, latestEvent) === undefined) {
    return { ok: false, reason: "NO_CALCULATION_EVENT_WITH_BOTH_LEGS", providerModelId: constituent.providerModelId };
  }
  return { ok: true, providerModelId: constituent.providerModelId };
}

/**
 * One provider's benchmark from canonical series a caller has already
 * filtered for visibility. History spans every designation; `current`
 * reports whether today's designation can be calculated, so a newly
 * effective designation that lacks legs never erases the last good value.
 */
export function providerBenchmark(
  providerSlug: string,
  series: readonly PublicTokenSeries[],
  onDate: string,
  lineage?: LegLineageIndex,
): ProviderBenchmark {
  const providerName = providerDisplayName(providerSlug);
  const current = currentStatus(providerSlug, series, onDate);

  const points: BenchmarkPoint[] = [];
  for (const segment of constituentSegments(providerSlug)) {
    if (segment.from > onDate) continue;
    const { inputs, outputs, displayName } = legsFor(series, segment.constituent, lineage);
    const until = segment.until === null ? null : segment.until;
    points.push(...segmentPoints(segment.constituent, segment.from, until, inputs, outputs, displayName, providerSlug));
  }
  points.sort((a, b) => a.time.localeCompare(b.time));

  const latest = points[points.length - 1];
  if (!latest) return { providerSlug, providerName, series: null, current };

  const previous = points.length >= 2 ? points[points.length - 2] : undefined;
  // Percentage change compares the same constituent lineage and methodology version only.
  const comparable =
    previous !== undefined &&
    previous.providerModelId === latest.providerModelId &&
    previous.methodologyVersion === latest.methodologyVersion;

  return {
    providerSlug,
    providerName,
    current,
    series: {
      seriesId: `token-price:${providerSlug}`,
      providerSlug,
      providerName,
      benchmarkName: TOKEN_PRICE_BENCHMARK_NAME,
      benchmarkModelId: latest.providerModelId,
      benchmarkModelName: latest.benchmarkModelName,
      methodologyVersion: latest.methodologyVersion,
      priceUsdPer1m: latest.priceUsdPer1m,
      currency: "USD",
      unit: TOKEN_PRICE_UNIT,
      updatedAt: latest.time,
      percentageChange: comparable ? percentageChange(previous!.priceUsdPer1m, latest.priceUsdPer1m) : null,
      history: points.map((point) => ({ time: point.time, priceUsdPer1m: point.priceUsdPer1m })),
    },
  };
}

export function providerBenchmarks(
  series: readonly PublicTokenSeries[],
  onDate: string = new Date().toISOString().slice(0, 10),
  lineage?: LegLineageIndex,
): ProviderBenchmark[] {
  return benchmarkProviders().map((provider) => providerBenchmark(provider, series, onDate, lineage));
}

/**
 * Every calculation point across every provider, with lineage. This is what a
 * freeze writes; the engine stays the calculator and the frozen rows become
 * the authoritative history.
 */
export function benchmarkPoints(
  series: readonly PublicTokenSeries[],
  onDate: string = new Date().toISOString().slice(0, 10),
  lineage?: LegLineageIndex,
): BenchmarkPoint[] {
  const points: BenchmarkPoint[] = [];
  for (const provider of benchmarkProviders()) {
    for (const segment of constituentSegments(provider)) {
      if (segment.from > onDate) continue;
      const { inputs, outputs, displayName } = legsFor(series, segment.constituent, lineage);
      points.push(...segmentPoints(segment.constituent, segment.from, segment.until, inputs, outputs, displayName, provider));
    }
  }
  return points.sort((a, b) => a.time.localeCompare(b.time) || a.providerSlug.localeCompare(b.providerSlug, "en"));
}

/** Providers with a value to show, which is the last successfully calculated one. */
/** Per-point lineage for calculated points, addressed the way the chart addresses points. */
export function benchmarkLineageFromPoints(points: readonly BenchmarkPoint[]): Map<string, string> {
  const lineage = new Map<string, string>();
  for (const point of points) {
    lineage.set(
      benchmarkPointKey(`token-price:${point.providerSlug}`, point.time),
      benchmarkLineageKey(point.providerModelId, point.methodologyVersion),
    );
  }
  return lineage;
}

export function publishableBenchmarks(series: readonly PublicTokenSeries[], onDate?: string): PublicTokenBenchmarkSeries[] {
  return providerBenchmarks(series, onDate).flatMap((row) => (row.series ? [row.series] : []));
}

/** Full detail per provider, for verification output: value plus current calculability. */
export function benchmarkReport(series: readonly PublicTokenSeries[], onDate?: string): ProviderBenchmark[] {
  return providerBenchmarks(series, onDate);
}
