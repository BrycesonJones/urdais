/**
 * Canonical listed-GPU market list: calculation series when they exist,
 * otherwise an explicit candidate or an identity-only pre-publication row.
 *
 * Switching source does not change the view shape. Inserting a regional
 * observation is enough for the same function to return isCandidate=false.
 * Candidates are never written to calculation_runs or regional_publications.
 */

import { validatePublicResponseShape, type UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import { LISTED_GPU_INSTRUMENTS } from "@/lib/ucpi/listed/instruments";
import { developmentListedCandidates } from "@/lib/ucpi/read/listed-candidates";
import { assertListedViewSafe, listedViewFromSeriesPoint, unpublishedListedView, type ListedMarketView } from "@/lib/ucpi/read/listed-view";
import { getSeries } from "@/lib/ucpi/read/series";
import { showListedCandidates } from "@/lib/ucpi/read/show-candidates";
import type { Persistence } from "@/lib/ucpi/runtime/persistence";

export type ListedMarketReadOptions = {
  persistence?: Pick<Persistence, "loadRegionalSeries">;
  /** Alternate series source (e.g. the SQL public-series query). Takes precedence over persistence. */
  loadSeries?: (symbol: string) => Promise<UcpiSeriesPoint[]>;
  /** When omitted, follows showListedCandidates(). */
  allowCandidates?: boolean;
  /** Override the development candidate source (tests). */
  candidates?: readonly ListedMarketView[];
};

export async function getListedMarketView(symbol: string, options: ListedMarketReadOptions = {}): Promise<ListedMarketView | null> {
  if (!LISTED_GPU_INSTRUMENTS.some((instrument) => instrument.symbol === symbol)) return null;
  const views = await listListedMarketViews(options);
  return views.find((view) => view.symbol === symbol) ?? null;
}

export async function listListedMarketViews(options: ListedMarketReadOptions = {}): Promise<ListedMarketView[]> {
  const allowCandidates = options.allowCandidates ?? showListedCandidates();
  const candidates = allowCandidates ? (options.candidates ?? developmentListedCandidates()) : [];
  const candidateBySymbol = new Map(candidates.map((view) => [view.symbol, view]));
  const out: ListedMarketView[] = [];

  for (const instrument of LISTED_GPU_INSTRUMENTS) {
    const points = options.loadSeries
      ? await options.loadSeries(instrument.symbol)
      : options.persistence
        ? await getSeries(options.persistence, { instrument: instrument.symbol })
        : [];
    const latest = points.length === 0 ? null : points[points.length - 1]!;
    if (latest !== null) {
      const reasons = validatePublicResponseShape(JSON.parse(JSON.stringify(latest)) as unknown);
      if (reasons.length > 0) throw new Error(`${instrument.symbol}: series point is not publishable: ${reasons.join(", ")}`);
      out.push(assertListedViewSafe(listedViewFromSeriesPoint(latest)));
      continue;
    }
    const candidate = candidateBySymbol.get(instrument.symbol);
    if (candidate) {
      out.push(assertListedViewSafe(candidate));
      continue;
    }
    out.push(assertListedViewSafe(unpublishedListedView(instrument.symbol)));
  }
  return out;
}

export async function getListedSeries(symbol: string, persistence: Pick<Persistence, "loadRegionalSeries">) {
  if (!LISTED_GPU_INSTRUMENTS.some((instrument) => instrument.symbol === symbol)) return null;
  const points = await getSeries(persistence, { instrument: symbol });
  for (const point of points) {
    const reasons = validatePublicResponseShape(JSON.parse(JSON.stringify(point)) as unknown);
    if (reasons.length > 0) throw new Error(`${symbol}: series point is not publishable: ${reasons.join(", ")}`);
  }
  return points;
}

export function resolveListedSymbol(id: string): string | null {
  const wanted = id.trim().toUpperCase();
  return LISTED_GPU_INSTRUMENTS.find((instrument) => instrument.symbol === wanted)?.symbol ?? null;
}
