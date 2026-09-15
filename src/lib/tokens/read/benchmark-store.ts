/**
 * Frozen Urdais Token Price observations.
 *
 * The derivation engine in benchmark-series.ts is the calculator. This module
 * is the record: once a calculation exists it is written to
 * `pipeline.token_price_benchmarks` with its full lineage, and from then on
 * the persisted rows are the authoritative history. A later correction,
 * migration or loss of a raw leg row cannot silently change a value Urdais
 * already calculated, because the value, the two leg prices it consumed, the
 * designated model and the methodology version are all frozen alongside it.
 *
 * Writes are idempotent: the same lineage under the same methodology version
 * is one row, enforced by a unique index, so running the calculator twice
 * adds nothing. Rows are never edited; a correction is a new row that
 * supersedes the old one.
 */

import type { PublicTokenBenchmarkSeries } from "@/lib/tokens/read/api-contract";
import { TOKEN_PRICE_BENCHMARK_NAME, TOKEN_PRICE_UNIT } from "@/lib/tokens/read/benchmark";
import { benchmarkPoints, type BenchmarkPoint } from "@/lib/tokens/read/benchmark-series";
import { providerDisplayName } from "@/lib/tokens/read/labels";
import type { TokenVisibilityMode } from "@/lib/tokens/read/publication";
import { legObservationIndex, listVisibleTokenSeries, type TokenReadCatalog } from "@/lib/tokens/read/series";

export type PersistedBenchmarkRow = {
  id: string;
  providerSlug: string;
  methodologyVersion: string;
  benchmarkModelId: string;
  benchmarkModelName: string;
  calculationStatus: "value" | "withheld";
  withheldReason: string | null;
  priceUsdPer1m: number | null;
  inputObservationId: string | null;
  outputObservationId: string | null;
  inputPriceUsdPer1m: number | null;
  outputPriceUsdPer1m: number | null;
  inputObservedAt: string | null;
  outputObservedAt: string | null;
  calculatedAt: string;
};

export type BenchmarkSqlExecutor = {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

export const INSERT_BENCHMARK_SQL = `
INSERT INTO pipeline.token_price_benchmarks (
  provider_id, methodology_version, benchmark_model_id, calculation_status, withheld_reason,
  price_usd_per_1m, input_observation_id, output_observation_id,
  input_price_usd_per_1m, output_price_usd_per_1m, input_observed_at, output_observed_at,
  calculated_at, calculator_identity
)
SELECT p.id, $2, m.id, $4, $5, $6, $7::uuid, $8::uuid, $9, $10, $11, $12, $13, $14
  FROM reference.providers p
  JOIN reference.models m ON m.provider_id = p.id AND m.provider_model_id = $3
 WHERE p.slug = $1
ON CONFLICT DO NOTHING
RETURNING id
`;

export const SELECT_BENCHMARKS_SQL = `
SELECT b.id, p.slug AS provider_slug, b.methodology_version, m.provider_model_id, m.display_name,
       b.calculation_status, b.withheld_reason, b.price_usd_per_1m,
       b.input_observation_id, b.output_observation_id,
       b.input_price_usd_per_1m, b.output_price_usd_per_1m,
       b.input_observed_at, b.output_observed_at, b.calculated_at
  FROM pipeline.token_price_benchmarks b
  JOIN reference.providers p ON p.id = b.provider_id
  JOIN reference.models m ON m.id = b.benchmark_model_id
 WHERE b.superseded_by_id IS NULL
 ORDER BY p.slug, b.calculated_at, b.id
`;

function asString(value: unknown): string {
  return typeof value === "string" ? value : String(value);
}

function asNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return asString(value);
}

export function benchmarkRowFromSql(row: Record<string, unknown>): PersistedBenchmarkRow {
  return {
    id: asString(row.id),
    providerSlug: asString(row.provider_slug),
    methodologyVersion: asString(row.methodology_version),
    benchmarkModelId: asString(row.provider_model_id),
    benchmarkModelName: asString(row.display_name),
    calculationStatus: row.calculation_status === "withheld" ? "withheld" : "value",
    withheldReason: row.withheld_reason === null || row.withheld_reason === undefined ? null : asString(row.withheld_reason),
    priceUsdPer1m: asNumber(row.price_usd_per_1m),
    inputObservationId: row.input_observation_id === null || row.input_observation_id === undefined ? null : asString(row.input_observation_id),
    outputObservationId: row.output_observation_id === null || row.output_observation_id === undefined ? null : asString(row.output_observation_id),
    inputPriceUsdPer1m: asNumber(row.input_price_usd_per_1m),
    outputPriceUsdPer1m: asNumber(row.output_price_usd_per_1m),
    inputObservedAt: asIso(row.input_observed_at),
    outputObservedAt: asIso(row.output_observed_at),
    calculatedAt: asIso(row.calculated_at) ?? "",
  };
}

export async function loadPersistedBenchmarks(sql: BenchmarkSqlExecutor): Promise<PersistedBenchmarkRow[]> {
  const result = await sql.query(SELECT_BENCHMARKS_SQL, []);
  return result.rows.map(benchmarkRowFromSql);
}

/** The two leg observations a value rests on, as one key. */
function lineageKey(providerSlug: string, providerModelId: string, inputId: string | null, outputId: string | null): string {
  return [providerSlug, providerModelId, inputId ?? "", outputId ?? ""].join("|");
}

/**
 * Freezes every calculation the engine produces that is not already recorded.
 *
 * Idempotent twice over. The unique lineage index makes a repeat insert a no-op
 * within one methodology version, and the guard below makes it a no-op across
 * versions as well.
 *
 * That second guard is not redundant. The index includes the methodology
 * version, so introducing a new version would let the identical two leg
 * observations be frozen a second time under the new label, and a reader would
 * see two points at one instant for one provider. A published series must not
 * gain a point because the rulebook was edited; it gains points when prices
 * move. A genuinely different value from the same legs is a correction, which
 * is a supersession decision and is reported here rather than written.
 */
export async function persistProviderBenchmarks(
  sql: BenchmarkSqlExecutor,
  catalog: TokenReadCatalog,
  mode: TokenVisibilityMode,
  onDate?: string,
  calculatorIdentity = "urdais-token-price",
): Promise<{ inserted: number; points: BenchmarkPoint[]; conflicts: string[] }> {
  // Lineage comes from the catalog, so every frozen row names the exact leg observations it consumed.
  const points = benchmarkPoints(listVisibleTokenSeries(catalog, mode), onDate, legObservationIndex(catalog, mode));
  const frozen = await loadPersistedBenchmarks(sql);
  const already = new Map<string, PersistedBenchmarkRow>();
  for (const row of frozen) {
    if (row.calculationStatus !== "value") continue;
    already.set(lineageKey(row.providerSlug, row.benchmarkModelId, row.inputObservationId, row.outputObservationId), row);
  }
  const conflicts: string[] = [];
  let inserted = 0;
  await sql.query("begin", []);
  try {
    for (const point of points) {
      const seen = already.get(lineageKey(point.providerSlug, point.providerModelId, point.inputObservationId, point.outputObservationId));
      if (seen) {
        if (seen.priceUsdPer1m !== point.priceUsdPer1m) {
          conflicts.push(
            `${point.providerSlug}: the same leg observations are already frozen at ${seen.priceUsdPer1m} under methodology ${seen.methodologyVersion}, but recalculate to ${point.priceUsdPer1m} under ${point.methodologyVersion}. That is a correction, which needs a supersession, and nothing was written.`,
          );
        }
        continue;
      }
      const result = await sql.query(INSERT_BENCHMARK_SQL, [
        point.providerSlug,
        point.methodologyVersion,
        point.providerModelId,
        "value",
        null,
        point.priceUsdPer1m,
        point.inputObservationId,
        point.outputObservationId,
        point.inputPriceUsdPer1m,
        point.outputPriceUsdPer1m,
        point.inputAt,
        point.outputAt,
        point.time,
        calculatorIdentity,
      ]);
      if (result.rows.length > 0) inserted += 1;
    }
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
  return { inserted, points, conflicts };
}

function percentageChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 10_000) / 10_000;
}

/**
 * The authoritative series for a provider, from frozen rows alone. Withheld
 * rows are part of the record but are not points: the value a reader sees is
 * the last successfully calculated one.
 */
export function benchmarkSeriesFromPersisted(
  providerSlug: string,
  rows: readonly PersistedBenchmarkRow[],
): PublicTokenBenchmarkSeries | null {
  const points = rows
    .filter((row) => row.providerSlug === providerSlug && row.calculationStatus === "value" && row.priceUsdPer1m !== null)
    .sort((a, b) => a.calculatedAt.localeCompare(b.calculatedAt) || a.id.localeCompare(b.id));
  const latest = points[points.length - 1];
  if (!latest) return null;
  const previous = points.length >= 2 ? points[points.length - 2] : undefined;
  const comparable =
    previous !== undefined &&
    previous.benchmarkModelId === latest.benchmarkModelId &&
    previous.methodologyVersion === latest.methodologyVersion;
  return {
    seriesId: `token-price:${providerSlug}`,
    providerSlug,
    providerName: providerDisplayName(providerSlug),
    benchmarkName: TOKEN_PRICE_BENCHMARK_NAME,
    benchmarkModelId: latest.benchmarkModelId,
    benchmarkModelName: latest.benchmarkModelName,
    methodologyVersion: latest.methodologyVersion,
    priceUsdPer1m: latest.priceUsdPer1m!,
    currency: "USD",
    unit: TOKEN_PRICE_UNIT,
    updatedAt: latest.calculatedAt,
    percentageChange: comparable ? percentageChange(previous!.priceUsdPer1m!, latest.priceUsdPer1m!) : null,
    history: points.map((row) => ({ time: row.calculatedAt, priceUsdPer1m: row.priceUsdPer1m! })),
  };
}

/** Every provider with a frozen value, in provider order. */
export function persistedBenchmarks(rows: readonly PersistedBenchmarkRow[]): PublicTokenBenchmarkSeries[] {
  const providers = [...new Set(rows.map((row) => row.providerSlug))].sort((a, b) => a.localeCompare(b, "en"));
  return providers.flatMap((provider) => {
    const series = benchmarkSeriesFromPersisted(provider, rows);
    return series ? [series] : [];
  });
}
