/**
 * SQL read of listed public series points. Completes the post-cutoff switch:
 * the same ListedMarketView is produced from calculation_runs as from the
 * in-memory persistence used in tests. The query never selects constituent
 * prices, payloads, grants or seller identities.
 */

import { toSeriesPoint, type UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import { LISTED_SCOPE_KEY, type RegionalObservation } from "@/lib/ucpi/aggregation";
import type { SqlExecutor, SqlStatement } from "@/lib/ucpi/runtime/persistence";

export function listedPublicSeriesQuery(symbol: string): SqlStatement {
  return {
    text:
      "select i.symbol as instrument, mv.version as methodology_version, sv.version as instrument_spec_version, " +
      "o.calculation_date, o.canonical_region_code, o.region_scope, o.outcome, o.structural_condition, o.market_breadth, " +
      "o.price_level, o.currency, o.unit, o.participant_count, o.contributing_source_count, o.largest_source_participant_share, " +
      "o.dispersion_published, o.p10, o.p50, o.p90, o.iqr, o.percentage_change_1d, o.change_disposition, o.source_attributions, " +
      "r.window_start, r.cutoff, r.publication_deadline, r.calculated_at, p.published_at " +
      "from pipeline.regional_observations o " +
      "join pipeline.calculation_runs r on r.id = o.run_id " +
      "join reference.instruments i on i.id = o.instrument_id " +
      "join reference.instrument_spec_versions sv on sv.id = r.instrument_spec_version_id " +
      "join reference.methodology_versions mv on mv.id = r.methodology_version_id " +
      "left join pipeline.regional_publications p on p.regional_observation_id = o.id " +
      "where i.symbol = $1 and o.superseded_by_id is null " +
      "order by o.calculation_date",
    params: [symbol],
  };
}

type ListedSeriesRow = {
  instrument: string;
  methodology_version: string;
  instrument_spec_version: string;
  calculation_date: string;
  canonical_region_code: string | null;
  region_scope: "country" | "listed_provider_wide";
  outcome: "value" | "unavailable";
  structural_condition: "NO_ELIGIBLE_PARTICIPANT" | "SINGLE_PARTICIPANT" | null;
  market_breadth: "minimum" | "normal" | null;
  price_level: number | null;
  currency: "USD";
  unit: "accelerator_hour";
  participant_count: number;
  contributing_source_count: number;
  largest_source_participant_share: number | null;
  dispersion_published: boolean;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  iqr: number | null;
  percentage_change_1d: number | null;
  change_disposition: "published" | "annotated" | "withheld" | null;
  source_attributions: string[];
  window_start: string;
  cutoff: string;
  publication_deadline: string;
  calculated_at: string;
  published_at: string | null;
};

export function listedSeriesRowToPoint(row: ListedSeriesRow): UcpiSeriesPoint {
  const obs: RegionalObservation = {
    instrument: row.instrument,
    regionScope: row.region_scope,
    canonicalRegionCode: row.canonical_region_code ?? LISTED_SCOPE_KEY,
    calculationDate: String(row.calculation_date).slice(0, 10),
    windowStart: row.window_start,
    cutoff: row.cutoff,
    publicationDeadline: row.publication_deadline,
    methodologyVersion: row.methodology_version,
    instrumentSpecVersion: row.instrument_spec_version,
    outcome: row.outcome,
    structuralCondition: row.structural_condition,
    marketBreadth: row.market_breadth,
    priceLevel: row.price_level === null ? null : Number(row.price_level),
    currency: row.currency,
    unit: row.unit,
    participantCount: Number(row.participant_count),
    contributingSourceCount: Number(row.contributing_source_count),
    largestSourceParticipantShare: row.largest_source_participant_share === null ? null : Number(row.largest_source_participant_share),
    dispersionPublished: row.dispersion_published,
    dispersion:
      row.p10 !== null && row.p50 !== null && row.p90 !== null && row.iqr !== null
        ? { p10: Number(row.p10), p50: Number(row.p50), p90: Number(row.p90), iqr: Number(row.iqr) }
        : null,
    percentageChange1d: row.percentage_change_1d === null ? null : Number(row.percentage_change_1d),
    changeDisposition: row.change_disposition,
    diagnostics: [],
    participants: [],
    sourceAttributions: row.source_attributions ?? [],
  };
  return toSeriesPoint(obs, { calculatedAt: row.calculated_at, publishedAt: row.published_at });
}

export async function loadListedSeriesFromSql(sql: SqlExecutor, symbol: string): Promise<UcpiSeriesPoint[]> {
  const query = listedPublicSeriesQuery(symbol);
  const result = await sql.query(query.text, query.params);
  return result.rows.map((row) => listedSeriesRowToPoint(row as unknown as ListedSeriesRow));
}
