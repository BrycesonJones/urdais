/**
 * A stand-in database for the UEPI read path's tests.
 *
 * It answers the two queries the loader issues and nothing else, from rows a test declares. An
 * unrecognised statement throws rather than returning an empty result, for the same reason
 * `fake-database.ts` does on the write side: a query this fake silently answers with `[]` is a
 * query whose behaviour no test actually checked, and "no rows" is indistinguishable from
 * "correctly gated" in exactly the assertions that matter here.
 *
 * The benchmark rows it serves default to production's own postures and rights determinations,
 * so a test that forgets to state them is testing the real gate rather than a permissive one.
 */

import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { UEPI_SERIES_IDS, type PublicationPosture, type UepiSeriesId } from "@/lib/uepi/types";
import type { RightsClassification, PermissionDisposition } from "@/lib/rights/publication";
import type { SqlExecutor } from "@/lib/uepi/store";

export type FakeBenchmarkRow = {
  seriesId: UepiSeriesId;
  publicationPosture?: PublicationPosture;
  rightsClassification?: RightsClassification | null;
  disposition?: PermissionDisposition;
  attributionRequired?: boolean;
  attributionText?: string | null;
  conditions?: string | null;
  unresolvedIssue?: string | null;
};

export type FakeDayRow = {
  seriesId: UepiSeriesId;
  operatingDate: string;
  /** A decimal string, as `numeric::text` returns it. Never a `number`. */
  value: string;
  observationCount?: number;
  expectedObservationCount?: number;
  releasedAt?: string;
  methodologyVersion?: string;
  specificationDigest?: string;
};

/** Production's determinations, so a test opts out of the real gate rather than into it. */
const PRODUCTION_RIGHTS: Record<UepiSeriesId, { classification: RightsClassification; attribution: string | null }> = {
  "uepi-ercot": {
    classification: "reusable_with_attribution_or_conditions",
    attribution: "Source: ERCOT. Urdais calculation; ERCOT does not guarantee the accuracy of derived compilations.",
  },
  "uepi-caiso": { classification: "ambiguous_requires_legal_review", attribution: "Source: California ISO (OASIS). Urdais calculation." },
  "uepi-nyiso": { classification: "ambiguous_requires_legal_review", attribution: "Source: NYISO. Urdais calculation." },
  "uepi-iso-ne": { classification: "ambiguous_requires_legal_review", attribution: "Source: ISO New England. Urdais calculation." },
  "uepi-pjm": { classification: "unsuitable_without_permission", attribution: null },
  "uepi-miso": { classification: "unsuitable_without_permission", attribution: null },
  "uepi-spp": { classification: "unsuitable_without_permission", attribution: null },
};

const SPECIFICATION_DIGEST_FIXTURE = "14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a";

function benchmarkRow(row: FakeBenchmarkRow): Record<string, unknown> {
  const benchmark = UEPI_BENCHMARKS[row.seriesId];
  const production = PRODUCTION_RIGHTS[row.seriesId];
  const classification =
    row.rightsClassification === undefined ? production.classification : row.rightsClassification;
  return {
    slug: benchmark.seriesId,
    display_name: `Urdais Energy & Power Index · ${benchmark.market} wholesale power benchmark`,
    market_symbol: benchmark.market,
    price_construct: benchmark.construct,
    benchmark_definition: benchmark.benchmarkDefinition,
    geographic_scope: benchmark.geographicScope,
    excluded_components: benchmark.excludes,
    operating_timezone: benchmark.operatingTimezone,
    hour_convention: benchmark.hourConvention,
    publication_posture: row.publicationPosture ?? benchmark.publicationPosture,
    source_name: `${benchmark.market} day-ahead price interface`,
    source_url: `https://example.invalid/${benchmark.gridOperatorSlug}`,
    source_slug: benchmark.sourceInterfaceSlug,
    rights_classification: classification,
    disposition: row.disposition ?? (classification === "unsuitable_without_permission" ? "prohibited" : "permitted"),
    attribution_required: row.attributionRequired ?? production.attribution !== null,
    attribution_text: row.attributionText === undefined ? production.attribution : row.attributionText,
    conditions: row.conditions ?? null,
    unresolved_issue:
      row.unresolvedIssue === undefined
        ? classification === "ambiguous_requires_legal_review"
          ? "The source's terms neither grant nor clearly forbid reuse of numeric prices."
          : null
        : row.unresolvedIssue,
  };
}

function dayRow(row: FakeDayRow): Record<string, unknown> {
  const expected = row.expectedObservationCount ?? 24;
  return {
    series_id: row.seriesId,
    operating_date: row.operatingDate,
    value_usd_per_mwh: row.value,
    observation_count: row.observationCount ?? expected,
    expected_observation_count: expected,
    released_at: row.releasedAt ?? `${row.operatingDate}T12:00:00.000Z`,
    specification_digest: row.specificationDigest ?? SPECIFICATION_DIGEST_FIXTURE,
    methodology_version: row.methodologyVersion ?? "1.0.0",
  };
}

/** Every benchmark at its production posture, which is what the loader sees in production. */
export const ALL_BENCHMARKS: FakeBenchmarkRow[] = UEPI_SERIES_IDS.map((seriesId) => ({ seriesId }));

export function fakeReadDatabase(
  benchmarks: readonly FakeBenchmarkRow[],
  days: readonly FakeDayRow[],
): SqlExecutor & { queries: string[] } {
  const queries: string[] = [];
  return {
    queries,
    async query(textQuery: string, params: readonly unknown[]) {
      queries.push(textQuery);
      if (textQuery.includes("reference.power_price_benchmarks b\n    join reference.source_interfaces")) {
        // `order by b.slug`, faithfully. The loader re-orders for presentation, and a fake that
        // handed rows back in declaration order would hide whether it does.
        return {
          rows: benchmarks
            .slice()
            .sort((a, b) => a.seriesId.localeCompare(b.seriesId))
            .map(benchmarkRow),
        };
      }
      if (textQuery.includes("pipeline.uepi_daily_values d")) {
        const wanted = new Set((params[0] as string[]) ?? []);
        return {
          rows: days
            .filter((row) => wanted.has(row.seriesId))
            .slice()
            .sort((a, b) =>
              a.seriesId === b.seriesId
                ? a.operatingDate.localeCompare(b.operatingDate)
                : a.seriesId.localeCompare(b.seriesId),
            )
            .map(dayRow),
        };
      }
      throw new Error(`the UEPI read fake was asked a query it does not model: ${textQuery.trim().slice(0, 80)}`);
    },
  };
}

/** A run of consecutive daily values, for range and availability tests. */
export function consecutiveDays(
  seriesId: UepiSeriesId,
  firstDate: string,
  values: readonly string[],
): FakeDayRow[] {
  const start = new Date(`${firstDate}T00:00:00Z`).getTime();
  return values.map((value, index) => ({
    seriesId,
    operatingDate: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}
