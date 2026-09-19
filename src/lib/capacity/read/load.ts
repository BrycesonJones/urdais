/**
 * Server-only loading of the Available Compute Capacity dataset.
 *
 * The load order matters and is the opposite of the usual one. Coverage is
 * read first, from the source-capability registry, and it is reported whether
 * or not any observation exists — because when the dataset is empty the
 * coverage *is* the answer, and "why is there nothing here" is a question the
 * surface has to answer from evidence rather than from silence.
 *
 * Production never falls back to a local database, and an unconfigured
 * deployment serves "not configured" rather than an empty dataset that would
 * look like a measured emptiness.
 */

import {
  aggregate,
  breakdownBy,
  byCapacitySource,
  byGpuType,
  byRegion,
  deduplicate,
} from "@/lib/capacity/aggregation";
import type {
  CapacityAvailabilityState,
  CapacityHardware,
  CapacityMeasurement,
  CapacityObservation,
  CapacityQuantityUnit,
  CapacitySignalCapability,
} from "@/lib/capacity/domain";
import { isEligibleSource } from "@/lib/capacity/domain";
import { DEFAULT_FRESHNESS_HORIZON_SECONDS, currentObservations } from "@/lib/capacity/freshness";
import {
  CAPACITY_DATASET_NAME,
  emptyCapacityReadModel,
  reasonText,
  type CapacityCoverage,
  type CapacityHistoryPoint,
  type CapacityReadModel,
  type CapacitySourceCoverage,
} from "@/lib/capacity/read/read-model";
import { CAPACITY_DISCLAIMERS, CAPACITY_METHODOLOGY } from "@/lib/capacity/domain";

export type SqlExecutor = {
  query(text: string, values: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
};

/** Every interface with an assessed capacity capability, joined to its permission state. */
export async function loadCapabilities(sql: SqlExecutor): Promise<readonly (CapacitySignalCapability & { providerName: string })[]> {
  const { rows } = await sql.query(
    `select si.slug                                as source_interface_slug,
            p.name                                 as provider_name,
            c.max_measurement_tier                 as max_tier,
            c.supports_exact_quantity              as supports_exact_quantity,
            c.supports_quantity_range              as supports_quantity_range,
            c.supports_availability_state          as supports_availability_state,
            c.supports_region                      as supports_region,
            c.supports_configuration               as supports_configuration,
            c.quantity_unit                        as quantity_unit,
            c.freshness_horizon_seconds            as freshness_horizon_seconds,
            c.assessment                           as assessment,
            si.terms_review_state                  as terms_review_state,
            si.production_access_state             as production_access_state,
            si.terms_review_state = 'permitted'            as terms_permitted,
            si.production_access_state = 'production_approved' as production_approved
       from reference.capacity_signal_capabilities c
       join reference.source_interfaces si on si.id = c.source_interface_id
       join reference.providers p on p.id = si.provider_id
      where si.is_active
      order by c.max_measurement_tier, si.slug`,
    [],
  );

  return rows.map((row) => ({
    sourceInterfaceSlug: String(row.source_interface_slug),
    providerName: String(row.provider_name),
    maxTier: Number(row.max_tier) as CapacitySignalCapability["maxTier"],
    supportsExactQuantity: Boolean(row.supports_exact_quantity),
    supportsQuantityRange: Boolean(row.supports_quantity_range),
    supportsAvailabilityState: Boolean(row.supports_availability_state),
    supportsRegion: Boolean(row.supports_region),
    supportsConfiguration: Boolean(row.supports_configuration),
    quantityUnit: row.quantity_unit === null ? null : (String(row.quantity_unit) as CapacitySignalCapability["quantityUnit"]),
    freshnessHorizonSeconds: row.freshness_horizon_seconds === null ? null : Number(row.freshness_horizon_seconds),
    assessment: String(row.assessment),
    termsPermitted: Boolean(row.terms_permitted),
    productionApproved: Boolean(row.production_approved),
    termsReviewState: String(row.terms_review_state),
    productionAccessState: String(row.production_access_state),
  }));
}

/** Live capacity observations — the ones no supersession points past. */
export async function loadObservations(sql: SqlExecutor): Promise<readonly CapacityObservation[]> {
  const { rows } = await sql.query(
    `select o.id::text                       as id,
            o.raw_offer_id::text             as raw_offer_id,
            ro.retrieval_id::text            as retrieval_id,
            si.slug                          as source_interface_slug,
            mv.version                       as methodology_version,
            o.collector_identity             as collector_identity,
            o.source_native_value            as source_native_value,
            o.source_native_field            as source_native_field,
            o.seller_entity_id::text         as seller_entity_id,
            o.operator_entity_id::text       as operator_entity_id,
            o.marketplace_entity_id::text    as marketplace_entity_id,
            o.capacity_source_entity_id::text as capacity_source_entity_id,
            o.canonical_region_code          as canonical_region_code,
            o.source_native_region           as source_native_region,
            o.normalized_gpu_type            as normalized_gpu_type,
            o.gpu_vendor                     as gpu_vendor,
            o.gpu_model                      as gpu_model,
            o.form_factor                    as form_factor,
            o.gpu_memory_gb                  as gpu_memory_gb,
            o.hardware_identity_grade        as hardware_identity_grade,
            o.gpus_per_unit                  as gpus_per_unit,
            o.service_tier                   as service_tier,
            o.measurement_type               as measurement_type,
            o.available_quantity             as available_quantity,
            o.quantity_min                   as quantity_min,
            o.quantity_max                   as quantity_max,
            o.quantity_unit                  as quantity_unit,
            o.availability_state             as availability_state,
            o.availability_evidence_grade    as availability_evidence_grade,
            o.observed_at                    as observed_at,
            o.source_effective_at            as source_effective_at,
            o.availability_observed_at       as availability_observed_at,
            o.retrieved_at                   as retrieved_at
       from pipeline.capacity_observations o
       join pipeline.raw_offers ro on ro.id = o.raw_offer_id
       join pipeline.source_retrievals sr on sr.id = ro.retrieval_id
       join reference.source_interfaces si on si.id = sr.source_interface_id
       join reference.methodology_versions mv on mv.id = o.methodology_version_id
      where o.superseded_by_id is null
      order by o.observed_at`,
    [],
  );

  return rows.map(toObservation);
}

/**
 * Rebuild the discriminated measurement from its stored columns.
 *
 * The database constraint guarantees which columns are populated for each
 * measurement type, so this reads them rather than re-deriving the tier. An
 * unrecognized type falls to `unknown` — Tier 4, no number — which is the safe
 * direction to fail in: a row this code cannot interpret contributes nothing
 * rather than contributing a wrong quantity.
 */
function toMeasurement(row: Record<string, unknown>): CapacityMeasurement {
  const unit = row.quantity_unit === null ? null : (String(row.quantity_unit) as CapacityQuantityUnit);
  const state =
    row.availability_state === null ? null : (String(row.availability_state) as CapacityAvailabilityState);

  switch (String(row.measurement_type)) {
    case "exact_quantity":
      if (unit === null) return { kind: "unknown" };
      return { kind: "exact_quantity", quantity: Number(row.available_quantity), unit, state };
    case "quantity_range":
      if (unit === null) return { kind: "unknown" };
      return {
        kind: "quantity_range",
        min: Number(row.quantity_min),
        max: Number(row.quantity_max),
        unit,
        state,
      };
    case "availability_state":
      if (state === null || state === "unknown") return { kind: "unknown" };
      return { kind: "availability_state", state };
    default:
      return { kind: "unknown" };
  }
}

function toObservation(row: Record<string, unknown>): CapacityObservation {
  const measurement = toMeasurement(row);

  return {
    id: String(row.id),
    provenance: {
      rawOfferId: String(row.raw_offer_id),
      retrievalId: String(row.retrieval_id),
      sourceInterfaceSlug: String(row.source_interface_slug),
      methodologyVersion: String(row.methodology_version),
      collectorIdentity: row.collector_identity === null ? "" : String(row.collector_identity),
      sourceNativeValue: row.source_native_value === null ? null : String(row.source_native_value),
      sourceNativeField: row.source_native_field === null ? null : String(row.source_native_field),
      sourceUrl: null,
    },
    sellerEntityId: String(row.seller_entity_id),
    operatorEntityId: row.operator_entity_id === null ? null : String(row.operator_entity_id),
    marketplaceEntityId: row.marketplace_entity_id === null ? null : String(row.marketplace_entity_id),
    capacitySourceEntityId: String(row.capacity_source_entity_id),
    canonicalRegionCode: row.canonical_region_code === null ? null : String(row.canonical_region_code),
    sourceNativeRegion: row.source_native_region === null ? null : String(row.source_native_region),
    hardware: {
      normalizedGpuType: row.normalized_gpu_type === null ? null : String(row.normalized_gpu_type),
      gpuVendor: row.gpu_vendor === null ? null : String(row.gpu_vendor),
      gpuModel: row.gpu_model === null ? null : String(row.gpu_model),
      formFactor: row.form_factor === null ? null : String(row.form_factor),
      gpuMemoryGb: row.gpu_memory_gb === null ? null : Number(row.gpu_memory_gb),
      identityGrade:
        row.hardware_identity_grade === null
          ? null
          : (String(row.hardware_identity_grade) as CapacityHardware["identityGrade"]),
      gpusPerUnit: row.gpus_per_unit === null ? null : Number(row.gpus_per_unit),
    },
    serviceTier: (row.service_tier as Record<string, unknown> | null) ?? null,
    measurement,
    availabilityEvidenceGrade:
      row.availability_evidence_grade === null
        ? null
        : (Number(row.availability_evidence_grade) as 1 | 2 | 3 | 4 | 5 | 6),
    observedAt: new Date(String(row.observed_at)).toISOString(),
    sourceEffectiveAt: row.source_effective_at === null ? null : new Date(String(row.source_effective_at)).toISOString(),
    availabilityObservedAt:
      row.availability_observed_at === null ? null : new Date(String(row.availability_observed_at)).toISOString(),
    retrievedAt: new Date(String(row.retrieved_at)).toISOString(),
    supersededById: null,
  };
}

/**
 * Plain-language reason a source contributes nothing, or null when it does.
 *
 * The distinction between a refusal and a pending review is preserved rather
 * than collapsed into "not permitted". One is a decision Urdais has been given
 * and cannot appeal by finding another endpoint; the other is a question nobody
 * has answered yet. Reporting them identically would overstate the barrier on
 * the sources closest to clearing.
 */
function blockedReason(capability: CapacitySignalCapability): string | null {
  if (capability.maxTier === 4) return "Publishes no availability signal; prices only.";
  if (capability.termsReviewState === "not_permitted") return "Terms reviewed; this use was refused.";
  if (capability.termsReviewState === "under_review") return "Terms under review; awaiting written confirmation.";
  if (!capability.termsPermitted) return "Terms not yet reviewed.";
  if (!capability.productionApproved) return "Permitted; awaiting production approval.";
  return null;
}

function buildCoverage(
  capabilities: readonly (CapacitySignalCapability & { providerName: string })[],
  observations: readonly CapacityObservation[],
): CapacityCoverage {
  const freshBySource = new Map<string, number>();
  for (const observation of observations) {
    const slug = observation.provenance.sourceInterfaceSlug;
    freshBySource.set(slug, (freshBySource.get(slug) ?? 0) + 1);
  }

  const sources: CapacitySourceCoverage[] = capabilities.map((capability) => ({
    sourceInterfaceSlug: capability.sourceInterfaceSlug,
    providerName: capability.providerName,
    maxTier: capability.maxTier,
    termsPermitted: capability.termsPermitted,
    productionApproved: capability.productionApproved,
    termsReviewState: capability.termsReviewState,
    eligible: isEligibleSource(capability),
    freshObservations: freshBySource.get(capability.sourceInterfaceSlug) ?? 0,
    blockedReason: blockedReason(capability),
  }));

  return {
    assessedSources: capabilities.length,
    eligibleSources: capabilities.filter(isEligibleSource).length,
    contributingSources: sources.filter((source) => source.freshObservations > 0).length,
    capacitySources: new Set(observations.map((o) => o.capacitySourceEntityId)).size,
    regions: new Set(observations.map((o) => o.canonicalRegionCode).filter((code) => code !== null)).size,
    gpuTypes: new Set(observations.map((o) => o.hardware.normalizedGpuType).filter((type) => type !== null)).size,
    sources,
  };
}

/** Daily history, built only from days that were actually observed. */
function buildHistory(observations: readonly CapacityObservation[]): readonly CapacityHistoryPoint[] {
  const byDay = new Map<string, CapacityObservation[]>();
  for (const observation of observations) {
    const date = observation.observedAt.slice(0, 10);
    const bucket = byDay.get(date);
    if (bucket === undefined) byDay.set(date, [observation]);
    else bucket.push(observation);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rows]) => {
      const result = aggregate(deduplicate(rows));
      return {
        date,
        // Null, not zero, on a day whose observations were all categorical.
        lower: result.total?.lower ?? null,
        upper: result.total?.upper ?? null,
        exact: result.total?.exact ?? false,
        categoricalObservations: result.categorical.observations,
        capacitySources: new Set(rows.map((row) => row.capacitySourceEntityId)).size,
      };
    });
}

/** Optional narrowing of the population. Each filter is exact-match on a canonical identifier. */
export type CapacityFilter = {
  gpu?: string | null;
  provider?: string | null;
  region?: string | null;
};

/**
 * Apply a filter to a population.
 *
 * A filter that matches nothing yields an empty population, which becomes an
 * explicit "no observations" rather than a zero — the same distinction the
 * unfiltered path makes, for the same reason.
 */
export function filterObservations(
  observations: readonly CapacityObservation[],
  filter: CapacityFilter,
): readonly CapacityObservation[] {
  return observations.filter((observation) => {
    if (filter.gpu && observation.hardware.normalizedGpuType !== filter.gpu) return false;
    if (filter.provider && observation.capacitySourceEntityId !== filter.provider) return false;
    if (filter.region && observation.canonicalRegionCode !== filter.region) return false;
    return true;
  });
}

/**
 * The read model, or an explicit unavailability.
 *
 * `now` is injected so that freshness is testable and so that a snapshot is
 * never a function of when a page happened to render.
 */
export function buildCapacityReadModel(
  capabilities: readonly (CapacitySignalCapability & { providerName: string })[],
  observations: readonly CapacityObservation[],
  now: Date,
  filter: CapacityFilter = {},
): CapacityReadModel {
  const eligibleSlugs = new Set(
    capabilities.filter(isEligibleSource).map((capability) => capability.sourceInterfaceSlug),
  );
  const horizons = new Map(
    capabilities.map((capability) => [
      capability.sourceInterfaceSlug,
      capability.freshnessHorizonSeconds ?? DEFAULT_FRESHNESS_HORIZON_SECONDS,
    ]),
  );

  // Eligibility before freshness: an observation from a source Urdais may not
  // use does not become usable by being recent.
  const eligible = filterObservations(
    observations.filter((observation) => eligibleSlugs.has(observation.provenance.sourceInterfaceSlug)),
    filter,
  );
  const fresh = deduplicate(currentObservations(eligible, now, horizons));
  const coverage = buildCoverage(capabilities, fresh);

  if (eligibleSlugs.size === 0) return emptyCapacityReadModel("no_eligible_source", coverage);
  if (fresh.length === 0) return emptyCapacityReadModel("no_fresh_observations", coverage);

  const result = aggregate(fresh);
  const history = buildHistory(eligible);

  return {
    dataset: "available-compute-capacity",
    name: CAPACITY_DATASET_NAME,
    methodology: {
      version: CAPACITY_METHODOLOGY.version,
      status: CAPACITY_METHODOLOGY.status,
      documentPath: CAPACITY_METHODOLOGY.documentPath,
      name: CAPACITY_METHODOLOGY.name,
    },
    disclaimers: CAPACITY_DISCLAIMERS,
    snapshot: {
      observedAt: fresh.reduce((latest, o) => (o.observedAt > latest ? o.observedAt : latest), fresh[0]!.observedAt),
      aggregate: result,
      byGpuType: breakdownBy(fresh, byGpuType),
      byRegion: breakdownBy(fresh, byRegion),
      byProvider: breakdownBy(fresh, byCapacitySource),
    },
    // Availability without a quantity is a real observation and is reported as
    // one; it is simply not a number, and the reason says so.
    unavailableReason: result.total === null ? "no_quantitative_coverage" : null,
    publicReason: result.total === null ? reasonText("no_quantitative_coverage") : "",
    coverage,
    history: { points: history, observedDays: history.length },
  };
}

export async function loadCapacityReadModel(
  sql: SqlExecutor,
  now: Date = new Date(),
  filter: CapacityFilter = {},
): Promise<CapacityReadModel> {
  const [capabilities, observations] = await Promise.all([loadCapabilities(sql), loadObservations(sql)]);
  return buildCapacityReadModel(capabilities, observations, now, filter);
}
