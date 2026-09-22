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
import {
  benchmarkLineageKey,
  benchmarkPointKey,
  TOKEN_BENCHMARK_WITHHELD,
  TOKEN_PRICE_BENCHMARK_NAME,
  TOKEN_PRICE_UNIT,
  methodologyInForce,
} from "@/lib/tokens/read/benchmark";
import { benchmarkPoints, type BenchmarkPoint } from "@/lib/tokens/read/benchmark-series";
import { providerDisplayName } from "@/lib/tokens/read/labels";
import type { TokenVisibilityMode } from "@/lib/tokens/read/publication";
import { legObservationIndex, listVisibleTokenSeries, type TokenReadCatalog } from "@/lib/tokens/read/series";

export type PersistedBenchmarkRow = {
  id: string;
  providerSlug: string;
  methodologyVersion: string;
  /** The designated constituent. Null only on a withholding for a provider with no designation. */
  benchmarkModelId: string | null;
  benchmarkModelName: string | null;
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

/**
 * A withholding, which names no model and carries no price.
 *
 * Separate from `INSERT_BENCHMARK_SQL` because that statement joins `reference.models` to
 * resolve the designated constituent, and a withheld provider may have no designation to
 * resolve -- DeepSeek has none, which is the reason it is withheld. Joining anyway would
 * either drop the row silently or require naming a model the methodology never designated.
 */
export const INSERT_WITHHOLDING_SQL = `
INSERT INTO pipeline.token_price_benchmarks (
  provider_id, methodology_version, benchmark_model_id, calculation_status, withheld_reason,
  price_usd_per_1m, input_observation_id, output_observation_id,
  input_price_usd_per_1m, output_price_usd_per_1m, input_observed_at, output_observed_at,
  calculated_at, calculator_identity
)
SELECT p.id, $2, null, 'withheld', $3, null, null, null, null, null, null, null, $4, $5
  FROM reference.providers p
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
  -- Left, not inner: a withholding names no model, and an inner join would write the
  -- decision and then hide it, which is the absence this is meant to end.
  LEFT JOIN reference.models m ON m.id = b.benchmark_model_id
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
    benchmarkModelId: row.provider_model_id === null || row.provider_model_id === undefined ? null : asString(row.provider_model_id),
    benchmarkModelName: row.display_name === null || row.display_name === undefined ? null : asString(row.display_name),
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

export type PersistableWithholding = {
  providerSlug: string;
  reason: string;
  methodologyVersion: string;
  /** The instant the decision is recorded against: the latest observation it was made about. */
  decidedAt: string;
};

/**
 * The withholdings that are decisions rather than gaps.
 *
 * The invariant, stated once: **evaluated and withheld is not the same as absent.** A
 * provider earns a durable withholding row when the register records one *and* Urdais has
 * actually collected its observations -- the register's `collected_not_publishable` state.
 * That is DeepSeek: twelve canonical observations, every one a peak or off-peak rate, and no
 * standard rate among them to publish.
 *
 * A provider whose withholding is `designated_publication_blocked` is deliberately excluded.
 * Mistral is the case: nothing is collected for it at all, so there is no evaluation to
 * record, and writing a decision would assert a review that never happened. The rule is not
 * "every withheld provider gets a row"; it is "every provider we looked at and declined to
 * publish gets a row".
 *
 * `decidedAt` is the newest observation the decision was made about, never the wall clock, so
 * re-running the freeze months later records the same instant rather than a fresh one.
 */
export function persistableWithholdings(catalog: TokenReadCatalog, onDate?: string): PersistableWithholding[] {
  const day = onDate ?? new Date().toISOString().slice(0, 10);
  const out: PersistableWithholding[] = [];
  for (const withholding of TOKEN_BENCHMARK_WITHHELD) {
    if (withholding.state !== "collected_not_publishable") continue;
    if (withholding.since > day) continue;
    const observations = catalog.observations.filter((row) => row.providerSlug === withholding.providerSlug);
    // No observations means nothing was evaluated, whatever the register says.
    if (observations.length === 0) continue;
    const decidedAt = observations
      .map((row) => row.retrievedAt)
      .sort((a, b) => a.localeCompare(b))[observations.length - 1]!;
    // No methodology in force is itself a different withholding (and a different reason
    // code); this one cannot be recorded without a version to record it under.
    const methodology = methodologyInForce(day);
    if (methodology === undefined) continue;
    out.push({
      providerSlug: withholding.providerSlug,
      reason: withholding.reason,
      methodologyVersion: methodology.version,
      decidedAt,
    });
  }
  return out;
}

/** The two leg observations a value rests on, as one key. */
function lineageKey(providerSlug: string, providerModelId: string | null, inputId: string | null, outputId: string | null): string {
  return [providerSlug, providerModelId ?? "", inputId ?? "", outputId ?? ""].join("|");
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
): Promise<{ inserted: number; withheld: number; points: BenchmarkPoint[]; conflicts: string[] }> {
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
  let withheld = 0;
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

    // A provider that was collected in full and deliberately not published gets its decision
    // written down beside the values. Without this the run reported the withholding only in
    // its own return value, which vanished when the process exited, and production could not
    // tell "reviewed and withheld" from "never processed" -- the two states the methodology
    // exists to keep apart.
    for (const withholding of persistableWithholdings(catalog, onDate)) {
      // Matched on provider and reason, deliberately not on methodology version.
      //
      // The version is in the row and in the unique index, so including it here
      // would let a new methodology version stack a second active withholding
      // for the same provider and the same reason -- two decisions on the record
      // where one was made. A withholding is a decision about what the provider
      // publishes, not about which edition of the rulebook was open at the time,
      // so re-versioning must no more add a withholding than it adds a point to
      // a published series. A genuinely different decision is a supersession.
      const seen = frozen.find(
        (row) =>
          row.calculationStatus === "withheld" &&
          row.providerSlug === withholding.providerSlug &&
          row.withheldReason === withholding.reason,
      );
      if (seen) continue;
      const result = await sql.query(INSERT_WITHHOLDING_SQL, [
        withholding.providerSlug,
        withholding.methodologyVersion,
        withholding.reason,
        withholding.decidedAt,
        calculatorIdentity,
      ]);
      if (result.rows.length > 0) withheld += 1;
    }
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
  return { inserted, withheld, points, conflicts };
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
    // Non-null on a value row by the value_shape constraint.
    benchmarkModelId: latest.benchmarkModelId!,
    benchmarkModelName: latest.benchmarkModelName!,
    methodologyVersion: latest.methodologyVersion,
    priceUsdPer1m: latest.priceUsdPer1m!,
    currency: "USD",
    unit: TOKEN_PRICE_UNIT,
    updatedAt: latest.calculatedAt,
    percentageChange: comparable ? percentageChange(previous!.priceUsdPer1m!, latest.priceUsdPer1m!) : null,
    history: points.map((row) => ({ time: row.calculatedAt, priceUsdPer1m: row.priceUsdPer1m! })),
  };
}

/**
 * Per-point lineage for frozen rows, addressed the way the chart addresses points.
 *
 * Only value rows appear: a withholding is not a point and has nothing to compare.
 */
export function benchmarkLineageFromPersisted(rows: readonly PersistedBenchmarkRow[]): Map<string, string> {
  const lineage = new Map<string, string>();
  for (const row of rows) {
    if (row.calculationStatus !== "value" || row.benchmarkModelId === null) continue;
    lineage.set(
      benchmarkPointKey(`token-price:${row.providerSlug}`, row.calculatedAt),
      benchmarkLineageKey(row.benchmarkModelId, row.methodologyVersion),
    );
  }
  return lineage;
}

/** Every provider with a frozen value, in provider order. */
export function persistedBenchmarks(rows: readonly PersistedBenchmarkRow[]): PublicTokenBenchmarkSeries[] {
  const providers = [...new Set(rows.map((row) => row.providerSlug))].sort((a, b) => a.localeCompare(b, "en"));
  return providers.flatMap((provider) => {
    const series = benchmarkSeriesFromPersisted(provider, rows);
    return series ? [series] : [];
  });
}
