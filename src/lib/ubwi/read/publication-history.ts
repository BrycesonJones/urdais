/**
 * The whole frozen UBWI production history, for the chart.
 *
 * This is deliberately a second loader rather than a widened headline loader. The
 * headline in ./publication-store.ts needs the latest point and its immediate
 * predecessor and nothing else, and it must stay that cheap: it runs on every homepage
 * render. The chart needs every point, in order, with the version each was published
 * under. Two questions, two queries.
 *
 * What counts as public history, and why:
 *
 *   - `frozen_at is not null`. A row without a freeze is a publication the process did
 *     not finish. It was never released and it is not history.
 *   - `superseded_by_id is null`. Corrections in this schema are supersessions, never
 *     edits (see `allow_only_supersession` in the schema migration), and the repo's
 *     canonical current-set rule throughout -- `ubwi_publications_current_idx`, the token
 *     benchmarks, the normalized observations -- is the non-superseded row. A superseded
 *     point is a withdrawn statement; the chart draws what Urdais currently publishes.
 *   - Ascending by `published_at`, tie-broken by `frozen_at` and then `id`, so the same
 *     history always yields the same series and the chart never depends on scan order.
 *
 * Nothing here interpolates, fills, resamples or back-fills. A day on which the pipeline
 * refused to publish is a day with no point, and the series simply steps over it.
 */

import type { DetailedSeries, TimeSeriesPoint } from "@/types/market";

/** One frozen production publication, as the chart consumes it. */
export type FrozenUbwiPoint = {
  /** The canonical UBWI chronology. See the note on `ubwiSeriesPoints` below. */
  publishedAt: string;
  valuePercent: number;
  methodologyVersion: string;
  residualModelVersion: string;
};

type Row = Record<string, unknown>;

/**
 * Map database rows to history points, dropping any row whose value is not a finite
 * number. A row that cannot be read as a level is not silently plotted at zero.
 */
export function ubwiHistoryFromRows(rows: readonly Row[]): FrozenUbwiPoint[] {
  const points: FrozenUbwiPoint[] = [];
  for (const row of rows) {
    // Belt and braces with the `frozen_at is not null` predicate: a caller that hands
    // this function unfiltered rows still gets only published points back.
    if (row.frozen_at === null || row.frozen_at === undefined) continue;
    if (row.superseded_by_id !== null && row.superseded_by_id !== undefined) continue;
    // `Number(null)` is 0, and a null level plotted at zero would be a fabricated point
    // rather than a missing one. Absence is checked before the conversion, not after.
    if (row.published_value_percent === null || row.published_value_percent === undefined) continue;
    const valuePercent = Number(row.published_value_percent);
    if (!Number.isFinite(valuePercent)) continue;
    const publishedAt = new Date(String(row.published_at));
    if (Number.isNaN(publishedAt.getTime())) continue;
    points.push({
      publishedAt: publishedAt.toISOString(),
      valuePercent,
      methodologyVersion: String(row.methodology_version),
      residualModelVersion: String(row.residual_model_version),
    });
  }
  return points;
}

/**
 * Every frozen, non-superseded UBWI publication, oldest first.
 *
 * Returns an empty history rather than null when there is nothing published, and an
 * empty history when no database is reachable: the chart's absence is the honest
 * rendering of both, and neither may become an invented point.
 */
export async function loadFrozenUbwiHistory(
  env: NodeJS.ProcessEnv = process.env,
): Promise<FrozenUbwiPoint[]> {
  try {
    const { resolveTokenDatabaseUrl, tokenSqlExecutor } = await import(
      "@/lib/tokens/read/database"
    );
    const url = resolveTokenDatabaseUrl(env, { allowLocalDefault: false });
    if (!url) return [];

    // The executor is process-wide and shared; it is borrowed here, never closed.
    const sql = await tokenSqlExecutor(url);
    const { rows } = await sql.query(
      `select published_at, frozen_at, superseded_by_id, published_value_percent,
              methodology_version, residual_model_version
         from pipeline.ubwi_publications
        where frozen_at is not null and superseded_by_id is null
        order by published_at asc, frozen_at asc, id asc`,
      [],
    );
    return ubwiHistoryFromRows(rows);
  } catch (error) {
    // An empty history and an unreachable database both draw no chart, so the reason
    // has to reach the log or it is lost entirely.
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`ubwi: history unavailable (${detail}); the chart will not render`);
    return [];
  }
}

/**
 * The trailing run of points that share the latest point's methodology and residual-model
 * versions.
 *
 * Today every real point is methodology 1.2.0 / residual model 1.0.0 and this returns the
 * whole history unchanged. It exists for the day that stops being true. The headline
 * change already refuses to measure across a definition boundary; a chart that quietly
 * drew both regimes as one line would make the same claim the headline declines to make,
 * only in a shape that is harder to argue with.
 *
 * The rule chosen for V1 is the conservative one: the chart defaults to the current
 * regime. Showing earlier regimes behind a boundary marker is a legitimate future design,
 * and nothing here forecloses it -- `loadFrozenUbwiHistory` still returns the whole
 * history, versions attached, for whatever presents it.
 */
export function ubwiCurrentRegimePoints(history: readonly FrozenUbwiPoint[]): FrozenUbwiPoint[] {
  if (history.length === 0) return [];
  const latest = history[history.length - 1]!;
  let start = history.length - 1;
  while (
    start > 0 &&
    history[start - 1]!.methodologyVersion === latest.methodologyVersion &&
    history[start - 1]!.residualModelVersion === latest.residualModelVersion
  ) {
    start -= 1;
  }
  return history.slice(start);
}

/**
 * History as chart points.
 *
 * `time` is the publication instant in Unix seconds and `value` is the published UBWI
 * level in percent. Part of the point of this function is what it does *not* choose:
 * the x-axis is `published_at`, the timestamp the read model, the homepage row and the
 * "Updated" line already use, and not the Chainlink round's `updatedAt`, not the
 * calculation time, and not the scheduled observation date. Those three are all recorded
 * -- on the Chainlink observation, on the calculation, and as the UTC date of
 * `published_at` respectively -- and they are all different instants. Mixing them on one
 * axis would make the chronology unreadable.
 */
export function ubwiSeriesPoints(history: readonly FrozenUbwiPoint[]): TimeSeriesPoint[] {
  return history.map((point) => ({
    time: Math.floor(new Date(point.publishedAt).getTime() / 1000),
    value: point.valuePercent,
  }));
}

/**
 * The history in the product's chart shape.
 *
 * `intraday` is empty and stays empty. UBWI publishes once per UTC day; there are no
 * intraday UBWI observations, so there is no intraday series. Copying the daily points
 * into it to light up the intraday range buttons would be manufacturing observations
 * that were never made, which is the one thing this index must never do. The low-frequency
 * range helpers in @/lib/market-ranges read the daily points for every range instead.
 */
export function ubwiDetailedSeries(history: readonly FrozenUbwiPoint[]): DetailedSeries {
  return { daily: ubwiSeriesPoints(history), intraday: [] };
}
