/**
 * Derivation layer: canonical model observations to provider Token Price
 * series, under docs/methodology/token-price.md v1.0.
 *
 *   canonical model token observations
 *     -> eligible benchmark legs (standard tier, base context, default region)
 *     -> provider benchmark calculation (half input, half output)
 *     -> provider Token Price series
 *
 * Raw observations are never modified and the derived value is never stored
 * or presented as a provider quote: every point carries the methodology
 * version and the designated model that produced it.
 *
 * A point exists only on a date where both eligible legs were observed. A
 * retrieval that repeats the previous prices confirms the last point rather
 * than adding one, so the series never grows without a price change. Where a
 * constituent designation changes, values keep the designation in force on
 * their own date and percentage change is withheld across the boundary.
 */

import type { PublicTokenBenchmarkSeries } from "@/lib/tokens/read/api-contract";
import {
  constituentInForce,
  isEligibleLeg,
  TOKEN_PRICE_BENCHMARK_NAME,
  TOKEN_PRICE_METHODOLOGY_VERSION,
  TOKEN_PRICE_UNIT,
  benchmarkProviders,
  tokenBenchmarkPrice,
  type TokenBenchmarkConstituent,
  type TokenBenchmarkWithheld,
} from "@/lib/tokens/read/benchmark";
import { providerDisplayName } from "@/lib/tokens/read/labels";

export type BenchmarkPoint = {
  time: string;
  priceUsdPer1m: number;
  providerModelId: string;
  methodologyVersion: string;
};

export type ProviderBenchmark =
  | { providerSlug: string; providerName: string; status: "value"; series: PublicTokenBenchmarkSeries }
  | { providerSlug: string; providerName: string; status: "withheld"; reason: TokenBenchmarkWithheld; providerModelId: string | null };

function dayOf(iso: string): string {
  return iso.slice(0, 10);
}

function percentageChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10_000) / 10_000;
}

/** Latest price per observation day for one leg, at full precision. */
function legByDay(series: readonly { retrievedAt: string; priceUsdPer1m: number; history: readonly { time: string; priceUsdPer1m: number }[] }[]): Map<string, number> {
  const byDay = new Map<string, { time: string; price: number }>();
  for (const row of series) {
    for (const point of row.history) {
      const day = dayOf(point.time);
      const seen = byDay.get(day);
      if (seen === undefined || seen.time.localeCompare(point.time) <= 0) byDay.set(day, { time: point.time, price: point.priceUsdPer1m });
    }
  }
  return new Map([...byDay].map(([day, row]) => [day, row.price]));
}

function buildPoints(
  constituent: TokenBenchmarkConstituent,
  inputByDay: Map<string, number>,
  outputByDay: Map<string, number>,
): BenchmarkPoint[] {
  const days = [...inputByDay.keys()].filter((day) => outputByDay.has(day)).sort();
  const points: BenchmarkPoint[] = [];
  for (const day of days) {
    // A designation only produces values from its effective date onward.
    if (day < constituent.effectiveFrom) continue;
    const price = tokenBenchmarkPrice(inputByDay.get(day)!, outputByDay.get(day)!);
    const previous = points[points.length - 1];
    // A retrieval repeating the same prices confirms the last point; it is not a new observation.
    if (previous && previous.priceUsdPer1m === price && previous.providerModelId === constituent.providerModelId) continue;
    points.push({ time: `${day}T00:00:00.000Z`, priceUsdPer1m: price, providerModelId: constituent.providerModelId, methodologyVersion: constituent.methodologyVersion });
  }
  return points;
}

/**
 * One provider's benchmark from the canonical series a caller has already
 * filtered for visibility. `onDate` selects the designation in force.
 */
export function providerBenchmark(
  providerSlug: string,
  series: readonly import("@/lib/tokens/read/api-contract").PublicTokenSeries[],
  onDate: string,
): ProviderBenchmark {
  const providerName = providerDisplayName(providerSlug);
  const constituent = constituentInForce(providerSlug, onDate);
  if (!constituent) return { providerSlug, providerName, status: "withheld", reason: "NO_CONSTITUENT_DESIGNATED", providerModelId: null };

  const eligible = series.filter((row) => isEligibleLeg(row, constituent));
  const inputLegs = eligible.filter((row) => row.pricingDimension === "input");
  const outputLegs = eligible.filter((row) => row.pricingDimension === "output");
  if (inputLegs.length === 0) return { providerSlug, providerName, status: "withheld", reason: "INPUT_LEG_UNAVAILABLE", providerModelId: constituent.providerModelId };
  if (outputLegs.length === 0) return { providerSlug, providerName, status: "withheld", reason: "OUTPUT_LEG_UNAVAILABLE", providerModelId: constituent.providerModelId };

  const points = buildPoints(constituent, legByDay(inputLegs), legByDay(outputLegs));
  const latest = points[points.length - 1];
  if (!latest) return { providerSlug, providerName, status: "withheld", reason: "NO_OBSERVATION_DATE_WITH_BOTH_LEGS", providerModelId: constituent.providerModelId };

  const previous = points.length >= 2 ? points[points.length - 2] : undefined;
  // Percentage change compares the same constituent lineage only.
  const comparable =
    previous !== undefined &&
    previous.providerModelId === latest.providerModelId &&
    previous.methodologyVersion === latest.methodologyVersion;

  const displayName = inputLegs[0]!.displayName;
  return {
    providerSlug,
    providerName,
    status: "value",
    series: {
      seriesId: `token-price:${providerSlug}`,
      providerSlug,
      providerName,
      benchmarkName: TOKEN_PRICE_BENCHMARK_NAME,
      benchmarkModelId: constituent.providerModelId,
      benchmarkModelName: displayName,
      methodologyVersion: TOKEN_PRICE_METHODOLOGY_VERSION,
      priceUsdPer1m: latest.priceUsdPer1m,
      currency: "USD",
      unit: TOKEN_PRICE_UNIT,
      updatedAt: latest.time,
      percentageChange: comparable ? percentageChange(previous!.priceUsdPer1m, latest.priceUsdPer1m) : null,
      history: points.map((point) => ({ time: point.time, priceUsdPer1m: point.priceUsdPer1m })),
    },
  };
}

/** Every designated provider's benchmark, in provider order. */
export function providerBenchmarks(
  series: readonly import("@/lib/tokens/read/api-contract").PublicTokenSeries[],
  onDate: string = new Date().toISOString().slice(0, 10),
): ProviderBenchmark[] {
  return benchmarkProviders().map((provider) => providerBenchmark(provider, series, onDate));
}

/** Only the providers with a publishable value. */
export function publishableBenchmarks(
  series: readonly import("@/lib/tokens/read/api-contract").PublicTokenSeries[],
  onDate?: string,
): PublicTokenBenchmarkSeries[] {
  return providerBenchmarks(series, onDate).flatMap((row) => (row.status === "value" ? [row.series] : []));
}
