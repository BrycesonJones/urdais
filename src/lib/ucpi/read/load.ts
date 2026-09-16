/**
 * The production read path for the listed GPU children, shaped for the market
 * surface.
 *
 * It follows the token benchmarks' convention exactly, including the one that
 * matters most here: a family with nothing to show carries no instruments
 * rather than a placeholder. `MarketInstrumentDetail.snapshot.value` is a
 * number and not a nullable one, which is deliberate -- an instrument on this
 * surface is a thing with a value. A child that is Unavailable on the day has
 * no value to show and therefore is not an instrument; its state is real and
 * recorded, and where that state belongs on the page is a product question this
 * module does not answer by inventing a zero.
 *
 * Only published points become instruments. `getSeries` already refuses to
 * return a calculated-but-unreleased observation, and the check is repeated in
 * spirit here by reading `status`: nothing reaches the surface that the
 * publication gate did not release.
 */

import { getSeries } from "@/lib/ucpi/read/series";
import { LISTED_GPU_INSTRUMENTS, instrumentPresentation } from "@/lib/ucpi/listed/instruments";
import { PRICE_OF_COMPUTE_SLUG } from "@/lib/ucpi/adapters/price-of-compute";
import { DatabasePersistence } from "@/lib/ucpi/runtime/database-persistence";
import { loadApprovedLineage, loadRegistry } from "@/lib/ucpi/runtime/daily-run";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import type { ProcessEnvLike } from "@/lib/tokens/read/publication";
import { describeDatabaseError } from "@/lib/db/connection";
import { availableRanges } from "@/lib/market-ranges";
import { catalogEntry } from "@/data/market-catalog";
import { TIME_RANGES } from "@/types/market";
import type {
  IndexSeries,
  MarketDetail,
  MarketIndex,
  MarketInstrumentDetail,
  MarketSnapshot,
  TimeRange,
  TimeSeriesPoint,
} from "@/types/market";

/** The unit caption the listed children publish in. Never "market price": these are asking prices. */
export const LISTED_GPU_UNIT_CAPTION = "$/GPU-hour (listed)";

export type ListedChildState = {
  symbol: string;
  displayName: string;
  gpuLabel: string;
  specVersion: string;
  /** The latest released point, or null where the child has published nothing. */
  latest: UcpiSeriesPoint | null;
  points: readonly UcpiSeriesPoint[];
};

/**
 * Every listed child's released history. A child with no approved version, or none
 * published, comes back with an empty series rather than being omitted, so a caller can
 * distinguish "not published" from "not a child".
 */
export async function loadListedChildren(env: ProcessEnvLike = process.env): Promise<ListedChildState[]> {
  const url = resolveTokenDatabaseUrl(env, { allowLocalDefault: env.NODE_ENV === "development" });
  if (!url) return [];
  const sql = await tokenSqlExecutor(url);
  const lineages = await loadApprovedLineage(sql);
  const registry = await loadRegistry(sql, new Date());

  const out: ListedChildState[] = [];
  for (const instrument of LISTED_GPU_INSTRUMENTS) {
    const presentation = instrumentPresentation(instrument.symbol);
    const lineage = lineages.get(instrument.symbol);
    if (lineage === undefined) {
      out.push({ symbol: presentation.symbol, displayName: presentation.displayName, gpuLabel: presentation.gpu.label, specVersion: instrument.specVersion, latest: null, points: [] });
      continue;
    }
    const persistence = new DatabasePersistence(sql, {
      instrumentId: lineage.instrumentId,
      instrumentSpecVersionId: lineage.instrumentSpecVersionId,
      methodologyVersionId: lineage.methodologyVersionId,
      sourceInterfaceIdBySlug: new Map([[PRICE_OF_COMPUTE_SLUG, registry.sourceInterfaceId]]),
    });
    persistence.versions = { methodologyVersion: lineage.methodologyVersion, instrumentSpecVersion: lineage.instrumentSpecVersion };
    const points = await getSeries(persistence, { instrument: instrument.symbol });
    const published = points.filter((p) => p.status === "published" || p.status === "delayed");
    out.push({
      symbol: presentation.symbol,
      displayName: presentation.displayName,
      gpuLabel: presentation.gpu.label,
      specVersion: lineage.instrumentSpecVersion,
      latest: published.length === 0 ? null : published[published.length - 1]!,
      points,
    });
  }
  return out;
}

const DAY = 24 * 60 * 60;

/** A released point's instant, as the surface's unix seconds. */
function asOf(point: UcpiSeriesPoint): number {
  const stamp = point.publishedAt ?? point.calculatedAt ?? `${point.calculationDate}T00:00:00Z`;
  return Math.floor(Date.parse(stamp) / 1000);
}

/**
 * One instrument per child that has released a value.
 *
 * `changePercent` is the child's own one-day figure and nothing else. The methodology
 * withholds it against a prior date with no Published level, which is exactly the first
 * point's case, and it arrives here as null. It is never replaced with a zero, and no
 * absolute delta is derived: the surface models percentage movement only.
 */
export function listedInstrumentsFrom(children: readonly ListedChildState[]): MarketInstrumentDetail[] {
  const instruments: MarketInstrumentDetail[] = [];
  for (const child of children) {
    if (child.latest === null || child.latest.priceLevel === null) continue;
    const released = child.points.filter((p) => (p.status === "published" || p.status === "delayed") && p.priceLevel !== null);
    const daily = released.map((p) => ({ time: asOf(p), value: p.priceLevel! }));
    const series = { daily, intraday: [] };
    const latestAt = asOf(child.latest);
    instruments.push({
      id: child.symbol.toLowerCase(),
      shortLabel: child.gpuLabel,
      symbol: child.symbol,
      // The headline is rendered as `<market>-<benchmarkCode ?? symbol>`. Without this
      // the child's own symbol already carries the index prefix and the page reads
      // "UCPI-UCPI-H100-SXM-LISTED", which is what production was serving.
      benchmarkCode: child.gpuLabel,
      name: child.displayName,
      unit: LISTED_GPU_UNIT_CAPTION,
      // Released production values. The surface must not label these demo data.
      provenance: "production",
      snapshot: {
        value: child.latest.priceLevel,
        changePercent: child.latest.percentageChange1d,
        asOf: latestAt,
      },
      series,
      // The shared rule every other surface uses, rather than a span test of this family's
      // own. The span test claimed a month of history the moment seven days existed, never
      // offered 3M/6M/1Y however long the series grew, and called any two points a day apart
      // however far apart they actually were. Ranges now appear as history earns them.
      availableRanges: availableRanges(series, latestAt),
      comparisons: [],
    });
  }
  return instruments;
}

/**
 * Replaces the Compute family's instruments with the released listed children.
 *
 * Where nothing has been released the market is returned untouched, so the existing
 * content stays exactly as it is rather than being swapped for an empty shelf. That is the
 * same rule the token family follows, and it is why activating this path cannot blank a
 * working page.
 */
export function withListedComputeInstruments(market: MarketDetail, instruments: readonly MarketInstrumentDetail[]): MarketDetail {
  if (instruments.length === 0) return market;
  const first = instruments[0]!;
  return {
    ...market,
    defaultInstrumentId: first.id,
    families: market.families.map((family) =>
      family.id === "compute" ? { ...family, instruments: [...instruments], defaultInstrumentId: first.id } : family,
    ),
  };
}

/** The market with its Compute family served from production, where production has anything to serve. */
export async function hydrateMarketWithListedCompute(market: MarketDetail, env: ProcessEnvLike = process.env): Promise<MarketDetail> {
  if (!market.families.some((family) => family.id === "compute")) return market;
  return withListedComputeInstruments(market, listedInstrumentsFrom(await loadListedChildren(env)));
}

/**
 * The homepage UCPI panel, built from the same production instruments the market
 * surface shows.
 *
 * It is deliberately derived from `listedInstrumentsFrom` rather than from its own
 * query, so the landing page and the UCPI market page cannot disagree: the headline
 * here is the instrument `withListedComputeInstruments` makes the market's default,
 * which is the first listed child with a released value.
 *
 * The panel keeps the catalog's UCPI identity -- the heading and its link to the
 * detail page are the index's, not the child's -- while the value, timestamp, change
 * and series are the child's, and the unit caption says "listed" because that is what
 * the children publish.
 */
export type UcpiHeadline = {
  index: MarketIndex;
  snapshot: MarketSnapshot;
  series: IndexSeries;
};

/** How far back each selectable range reaches from the latest released point. */
const RANGE_SPAN_DAYS: Record<TimeRange, number | null> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 90,
  "1Y": 365,
  ALL: null,
};

/**
 * The released daily points, windowed per range.
 *
 * Every range is populated from the one daily series; none is synthesised and none is
 * padded. Which ranges a history is *long enough* to offer is a separate question this
 * does not answer -- the panel's range buttons are unchanged.
 */
function windowedSeries(daily: readonly TimeSeriesPoint[]): IndexSeries {
  const latest = daily.length === 0 ? 0 : daily[daily.length - 1]!.time;
  const out = {} as IndexSeries;
  for (const range of TIME_RANGES) {
    const span = RANGE_SPAN_DAYS[range];
    out[range] = span === null ? [...daily] : daily.filter((point) => point.time >= latest - span * DAY);
  }
  return out;
}

/** The headline panel for the released listed instruments, or null where none has a value. */
export function ucpiHeadlineFrom(instruments: readonly MarketInstrumentDetail[]): UcpiHeadline | null {
  const headline = instruments[0];
  if (headline === undefined) return null;
  const ucpi = catalogEntry("UCPI");
  return {
    index: { symbol: ucpi.symbol, name: ucpi.name, unit: headline.unit },
    snapshot: headline.snapshot,
    series: windowedSeries(headline.series.daily),
  };
}

/**
 * The production UCPI headline, or null when production has nothing to show.
 *
 * A database failure is null too, and deliberately: the caller's job is then to say so,
 * not to reach for the fixtures. Returning null rather than throwing keeps one
 * unreachable database from taking the whole homepage down with it.
 */
export async function loadUcpiHeadline(env: ProcessEnvLike = process.env): Promise<UcpiHeadline | null> {
  try {
    return ucpiHeadlineFrom(listedInstrumentsFrom(await loadListedChildren(env)));
  } catch (error) {
    console.warn(`ucpi headline: database unavailable (${describeDatabaseError(error)}); no production value`);
    return null;
  }
}
