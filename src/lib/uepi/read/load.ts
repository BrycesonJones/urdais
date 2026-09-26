/**
 * Loading publishable UEPI values.
 *
 * The gate is in the query and then in the policy, and neither is a list of market names. A row
 * reaches the public model only when its benchmark's `publication_posture` is `publishable`, its
 * daily value is the current one for its operating date, and the methodology version it was
 * calculated under is approved and in force today; and then only when `mayPublishUepiValue`
 * allows it on the terms recorded for `public_derived_uepi_value_display`.
 *
 * Both gates are load-bearing and they answer different questions. The posture answers "has
 * Urdais built and decided to show this?"; the terms answer "may Urdais show it?". MISO and SPP
 * fail the terms. ISO-NE's terms are ambiguous -- which the platform publishes under
 * founder-accepted risk -- and it fails the posture instead, which is why hardcoding a list of
 * three public markets would have been the wrong implementation even though it would produce
 * today's answer: postures change, and a list does not.
 *
 * Nothing here upgrades a classification. The ambiguous determinations travel through to the
 * surface as the unresolved issue a reader is shown beside the value.
 */

import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { DERIVED_VALUE_PURPOSE, mayPublishUepiValue, uepiPublicationNotice } from "@/lib/uepi/rights";
import { limitationsFor } from "@/lib/uepi/read/limitations";
import {
  buildUepiReadModel,
  changeBetweenDays,
  displaySymbolFor,
  pointValue,
  unavailableChange,
  UEPI_METHODOLOGY_HREF,
  type UepiNotice,
  type UepiPoint,
  type UepiReadModel,
  type UepiSeriesView,
} from "@/lib/uepi/read/read-model";
import { UEPI_UNIT } from "@/lib/uepi/methodology";
import { isUepiSeriesId, UEPI_SERIES_IDS, type PublicationPosture, type UepiSeriesId } from "@/lib/uepi/types";
import type { SourceRightsState } from "@/lib/rights/publication";
import type { SqlExecutor } from "@/lib/uepi/store";

/** One benchmark's public metadata plus the determination in force for showing its values. */
export type PublishableSeriesRow = {
  seriesId: UepiSeriesId;
  market: string;
  name: string;
  priceConstruct: "delivered_price" | "system_energy_component";
  benchmarkDefinition: string;
  geographicScope: string;
  excludes: readonly string[];
  operatingTimezone: string;
  hourConvention: string;
  publicationPosture: PublicationPosture;
  sourceName: string;
  sourceUrl: string;
  rights: SourceRightsState | null;
};

/** One released operating day, with its value still an exact decimal string. */
export type ReleasedDayRow = {
  seriesId: UepiSeriesId;
  operatingDate: string;
  valueUsdPerMwh: string;
  observationCount: number;
  expectedObservationCount: number;
  releasedAt: string;
  methodologyVersion: string;
  specificationDigest: string;
};

const BENCHMARKS = `
  select b.slug,
         b.display_name,
         b.market_symbol,
         b.price_construct,
         b.benchmark_definition,
         b.geographic_scope,
         b.excluded_components,
         b.operating_timezone,
         b.hour_convention,
         b.publication_posture,
         si.name          as source_name,
         si.canonical_url as source_url,
         sup.rights_classification,
         sup.disposition,
         sup.attribution_required,
         sup.attribution_text,
         sup.conditions,
         sup.unresolved_issue,
         sup.terms_document_url,
         sup.reviewed_by,
         sup.reviewed_on,
         si.slug          as source_slug
    from reference.power_price_benchmarks b
    join reference.source_interfaces si on si.id = b.source_interface_id
    left join lateral (
           select p.*
             from reference.source_use_permissions p
            where p.source_interface_id = b.source_interface_id
              and p.purpose_code = $1
              and p.effective_from <= now()
              and (p.effective_to is null or p.effective_to > now())
            order by p.effective_from desc
            limit 1
         ) sup on true
   where b.effective_from <= now()
     and (b.effective_to is null or b.effective_to > now())
   order by b.slug
`;

/**
 * Released days for the given series.
 *
 * `superseded_by_id is null` is what makes this the current value rather than a revision
 * history: §G.5 revises by inserting and superseding, never by editing, so a day that was
 * corrected has two rows and exactly one of them is current.
 */
const RELEASED_DAYS = `
  select b.slug                                    as series_id,
         to_char(d.operating_date, 'YYYY-MM-DD')   as operating_date,
         d.value_usd_per_mwh::text                 as value_usd_per_mwh,
         d.observation_count,
         d.expected_observation_count,
         d.released_at,
         d.specification_digest,
         mv.version                                as methodology_version
    from pipeline.uepi_daily_values d
    join reference.power_price_benchmarks b on b.id = d.benchmark_id
    join reference.methodology_versions mv on mv.id = d.methodology_version_id
   where d.superseded_by_id is null
     and b.slug = any($1::text[])
     and mv.status = 'approved'
     and mv.effective_from is not null
     and mv.effective_from <= current_date
     and (mv.effective_to is null or mv.effective_to > current_date)
   order by b.slug, d.operating_date
`;

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function nullableText(value: unknown): string | null {
  return value == null ? null : String(value);
}

function rightsFrom(row: Record<string, unknown>): SourceRightsState | null {
  if (row.rights_classification == null) return null;
  return {
    sourceInterfaceSlug: text(row.source_slug),
    sourceName: text(row.source_name),
    purpose: DERIVED_VALUE_PURPOSE,
    rightsClassification: String(row.rights_classification) as SourceRightsState["rightsClassification"],
    disposition: String(row.disposition) as SourceRightsState["disposition"],
    attributionRequired: row.attribution_required === true,
    attributionText: nullableText(row.attribution_text),
    conditions: nullableText(row.conditions),
    unresolvedIssue: nullableText(row.unresolved_issue),
    termsDocumentUrl: nullableText(row.terms_document_url),
    reviewedBy: nullableText(row.reviewed_by),
    reviewedOn: nullableText(row.reviewed_on),
  };
}

/**
 * Every UEPI benchmark whose value may be shown publicly today, with its §I.2 metadata.
 *
 * Posture is read from the database rather than from the `UEPI_BENCHMARKS` mirror, deliberately.
 * The mirror exists so a drift between the approved definitions and the code is a failing test;
 * it is not a second authority, and a public gate that consults a constant would keep publishing
 * a series after an operator changed its posture in production.
 */
export async function loadPublishableSeries(sql: SqlExecutor): Promise<PublishableSeriesRow[]> {
  const { rows } = await sql.query(BENCHMARKS, [DERIVED_VALUE_PURPOSE]);
  const publishable: PublishableSeriesRow[] = [];
  for (const row of rows) {
    const slug = text(row.slug);
    if (!isUepiSeriesId(slug)) continue;
    const posture = String(row.publication_posture) as PublicationPosture;
    const rights = rightsFrom(row);
    const decision = mayPublishUepiValue({
      benchmark: { ...UEPI_BENCHMARKS[slug], publicationPosture: posture },
      rights,
      // The value has been released by Urdais; the question this asks is whether the source's
      // terms permit showing it. A released value is a published one.
      publicationState: "published",
      purpose: DERIVED_VALUE_PURPOSE,
    });
    if (!decision.allowed) continue;
    publishable.push({
      seriesId: slug,
      market: text(row.market_symbol),
      name: text(row.display_name),
      priceConstruct: String(row.price_construct) as PublishableSeriesRow["priceConstruct"],
      benchmarkDefinition: text(row.benchmark_definition),
      geographicScope: text(row.geographic_scope),
      excludes: Array.isArray(row.excluded_components) ? row.excluded_components.map(String) : [],
      operatingTimezone: text(row.operating_timezone),
      hourConvention: text(row.hour_convention),
      publicationPosture: posture,
      sourceName: text(row.source_name),
      sourceUrl: text(row.source_url),
      rights,
    });
  }
  // Presentation order, not the query's. `order by b.slug` is alphabetical, which would open the
  // UEPI page on CAISO; `UEPI_SERIES_IDS` is the product's own order, flagship first. ERCOT is
  // the headline benchmark because Urdais emphasises the Information Age power economy, where
  // large compute loads, grid constraints and rapid market change converge most strongly. That
  // is a product judgement and it belongs in code, which is where it already lived.
  const order = new Map(UEPI_SERIES_IDS.map((id, index) => [id, index]));
  return publishable.sort((left, right) => order.get(left.seriesId)! - order.get(right.seriesId)!);
}

export async function loadReleasedDays(
  sql: SqlExecutor,
  seriesIds: readonly UepiSeriesId[],
): Promise<Map<UepiSeriesId, ReleasedDayRow[]>> {
  const bySeries = new Map<UepiSeriesId, ReleasedDayRow[]>(seriesIds.map((id) => [id, []]));
  if (seriesIds.length === 0) return bySeries;
  const { rows } = await sql.query(RELEASED_DAYS, [[...seriesIds]]);
  for (const row of rows) {
    const slug = text(row.series_id);
    if (!isUepiSeriesId(slug)) continue;
    bySeries.get(slug)?.push({
      seriesId: slug,
      operatingDate: text(row.operating_date),
      valueUsdPerMwh: text(row.value_usd_per_mwh),
      observationCount: Number(row.observation_count),
      expectedObservationCount: Number(row.expected_observation_count),
      releasedAt: new Date(text(row.released_at)).toISOString(),
      methodologyVersion: text(row.methodology_version),
      specificationDigest: text(row.specification_digest),
    });
  }
  return bySeries;
}

/** The notice a surface must render beside a value. A blocked series never reaches here. */
export function noticeFor(row: PublishableSeriesRow): UepiNotice {
  const decision = mayPublishUepiValue({
    benchmark: { ...UEPI_BENCHMARKS[row.seriesId], publicationPosture: row.publicationPosture },
    rights: row.rights,
    publicationState: "published",
    purpose: DERIVED_VALUE_PURPOSE,
  });
  return uepiPublicationNotice(decision);
}

export function toPoint(day: ReleasedDayRow): UepiPoint {
  return {
    operatingDate: day.operatingDate,
    valueUsdPerMwh: pointValue(day.valueUsdPerMwh),
    observationCount: day.observationCount,
    expectedObservationCount: day.expectedObservationCount,
  };
}

/**
 * One series view.
 *
 * `includePoints` is false on the family route, which serves latest values and metadata: a
 * fourteen-month history for three markets is a payload nobody asked for, and the per-series
 * route exists to serve it.
 */
export function seriesViewFrom(
  row: PublishableSeriesRow,
  days: readonly ReleasedDayRow[],
  options: { includePoints: boolean },
): UepiSeriesView {
  const latestDay = days[days.length - 1];
  const previousDay = days[days.length - 2];
  // §D.4 row 13 and §E: a change needs a base in reach. The previous *released* day is the
  // day-over-day base, and where the day before the latest one did not release, the 1D
  // comparison is refused rather than quietly measured across the hole.
  const change1d =
    latestDay === undefined || previousDay === undefined
      ? unavailableChange(latestDay === undefined ? "no_released_value" : "no_base_observation")
      : consecutiveChange(previousDay, latestDay);

  return {
    seriesId: row.seriesId,
    market: row.market,
    displaySymbol: displaySymbolFor(row.seriesId),
    name: row.name,
    unit: UEPI_UNIT,
    priceConstruct: row.priceConstruct,
    benchmarkDefinition: row.benchmarkDefinition,
    excludes: row.excludes,
    geographicScope: row.geographicScope,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    sourceGranularity: "hourly",
    operatingTimezone: row.operatingTimezone,
    hourConvention: row.hourConvention,
    dailyAggregation: "arithmetic_mean_of_valid_hours",
    updateFrequency: "daily_one_value_per_operating_day",
    methodologyVersion: latestDay?.methodologyVersion ?? "",
    methodologyDigest: latestDay?.specificationDigest ?? "",
    methodologyHref: UEPI_METHODOLOGY_HREF,
    notice: noticeFor(row),
    knownLimitations: limitationsFor(row.seriesId),
    provenance: "production",
    latest: latestDay === undefined ? null : toPoint(latestDay),
    latestReleasedAt: latestDay?.releasedAt ?? null,
    change1d,
    points: options.includePoints ? days.map(toPoint) : [],
    unavailableReason: latestDay === undefined ? "no released value for this series" : null,
  };
}

/**
 * The day-over-day change, refused across a gap.
 *
 * Two consecutive rows in the table are not necessarily two consecutive days: ERCOT has no
 * 2026-03-07 because the source published none, and MISO has no 2026-05-19 because its hubs
 * disagreed beyond the §G.3 tolerance. Measuring "today" across either hole would label a
 * two-day move as a one-day move.
 */
function consecutiveChange(previous: ReleasedDayRow, latest: ReleasedDayRow) {
  const expected = new Date(`${latest.operatingDate}T00:00:00Z`).getTime() - 86_400_000;
  if (new Date(`${previous.operatingDate}T00:00:00Z`).getTime() !== expected) {
    return unavailableChange("no_base_observation");
  }
  return changeBetweenDays(previous, latest);
}

/** Every publishable series, latest value and metadata. The family route's payload. */
export async function loadUepiReadModel(
  sql: SqlExecutor,
  options: { includePoints?: boolean } = {},
): Promise<UepiReadModel> {
  const series = await loadPublishableSeries(sql);
  const days = await loadReleasedDays(sql, series.map((row) => row.seriesId));
  return buildUepiReadModel(
    series.map((row) =>
      seriesViewFrom(row, days.get(row.seriesId) ?? [], { includePoints: options.includePoints === true }),
    ),
  );
}

/**
 * One series with its full released history, or null where the id is not publicly served.
 *
 * Null covers two cases on purpose, and the route answers both the same way: an id that is not a
 * UEPI series at all, and one that is but is not published. Distinguishing them in the response
 * would tell a client that `uepi-miso` exists and carries data Urdais will not show, which is
 * precisely the fact the publication gate exists to withhold.
 */
export async function loadUepiSeries(
  sql: SqlExecutor,
  seriesId: string,
): Promise<UepiSeriesView | null> {
  if (!isUepiSeriesId(seriesId)) return null;
  const row = (await loadPublishableSeries(sql)).find((candidate) => candidate.seriesId === seriesId);
  if (row === undefined) return null;
  const days = (await loadReleasedDays(sql, [seriesId])).get(seriesId) ?? [];
  return seriesViewFrom(row, days, { includePoints: true });
}
