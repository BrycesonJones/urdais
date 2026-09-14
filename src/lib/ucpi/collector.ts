/**
 * The collector abstraction and the pipeline orchestrator.
 *
 * A provider adapter does exactly three things: build a request, parse a
 * response into raw offers exactly as the source expressed them, and normalize
 * a raw offer under the child's rules. It never decides eligibility, never
 * aggregates, and never publishes. Everything after normalization is
 * provider-neutral and lives in eligibility.ts and aggregation.ts.
 *
 * No adapter performs a live request here. A runtime that does must first pass
 * the permission gate, and the database will refuse a production retrieval the
 * registry has not cleared regardless.
 */

import { calculationDateOf, isWithinWindow } from "@/lib/ucpi/calculation-window";
import { calculateRegion, collapseCapacitySources, LISTED_SCOPE_KEY, reduceSellers, type CapacitySourceObservation, type RegionalObservation, type SellerObservation } from "@/lib/ucpi/aggregation";
import type { EligibilityAssessment, MarketEntity, NormalizedObservation, RawOffer, RequestSpec, Retrieval } from "@/lib/ucpi/domain";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import type { PriorObservation } from "@/lib/ucpi/calculation-window";
import { assertProductionCollectionPermitted, type SourceRegistryState } from "@/lib/ucpi/permission-gate";

export type RegionMapping = {
  canonicalRegionCode: string;
  evidence: string;
};

export type TenancyEvidence = {
  grade: "explicit" | "documented";
  evidence: string;
};

/** Everything normalization needs that is not in the response: identities, mappings, versions, evidence. */
export type NormalizationContext = {
  instrumentSpecVersion: string;
  methodologyVersion: string;
  /** Seller entity id per provider slug. */
  sellerEntityIdByProvider: ReadonlyMap<string, string>;
  /** Canonical country per (source interface slug, native region value). A missing entry is REGION_UNRESOLVED, never a guess. */
  regionMappings: ReadonlyMap<string, RegionMapping>;
  /** Tenancy evidence per provider slug, where a statement exists. Absent means the adapter's own default, which may be ambiguous. */
  tenancyEvidence: ReadonlyMap<string, TenancyEvidence>;
  /** Market entities by id, so collection-time eligibility can apply the legal-identity rule. */
  entities: ReadonlyMap<string, MarketEntity>;
  /** For aggregator sources: what Urdais knows about each underlying seller from its own evidence, keyed by the source-native provider slug. */
  sellerProfiles?: ReadonlyMap<string, import("@/lib/ucpi/adapters/price-of-compute").PocSellerProfile>;
};

export function regionMappingKey(sourceInterfaceSlug: string, nativeRegion: string): string {
  return `${sourceInterfaceSlug}|${nativeRegion}`;
}

export interface ProviderAdapter<TRequestParams, TResponse, TCompanion = undefined> {
  readonly providerSlug: string;
  readonly sourceInterfaceSlug: string;
  /** A request specification with no secrets in it. */
  buildRequest(params: TRequestParams): RequestSpec;
  /** Raw offers exactly as the source expressed them; one per record. */
  parse(retrieval: Retrieval, response: TResponse, companion: TCompanion): RawOffer[];
  /** Urdais's interpretation of one raw offer under the child. */
  normalize(raw: RawOffer, retrieval: Retrieval, ctx: NormalizationContext): NormalizedObservation;
}

/**
 * Guards a live retrieval. This module does not perform the request; it hands
 * back the request specification only after the gate passes, so no caller can
 * reach a provider for production without the registry's permission.
 */
export function authorizeProductionRequest(request: RequestSpec, registry: SourceRegistryState): RequestSpec {
  assertProductionCollectionPermitted(registry);
  return request;
}

export type PipelineInput = {
  instrument: string;
  /** Which child's eligibility applies: the accessible-offer child (default) or the listed-price sibling. */
  spec?: import("@/lib/ucpi/eligibility").InstrumentSpec;
  /** Country series (default) or one region-unspecified listed series. */
  regionScope?: import("@/lib/ucpi/aggregation").RegionScope;
  calculationDate: string;
  methodologyVersion: string;
  instrumentSpecVersion: string;
  observations: readonly NormalizedObservation[];
  retrievals: readonly Retrieval[];
  entities: readonly MarketEntity[];
  registry: readonly SourceRegistryState[];
  /** Prior observation per country, for the percentage-change disposition. */
  priorByRegion?: ReadonlyMap<string, PriorObservation & { priceLevel?: number | null; participantIds?: readonly string[] }>;
  /** Countries the child publishes series for; each gets a regional observation even with no eligible participant. */
  seriesRegions?: readonly string[];
};

export type PipelineResult = {
  calculationDate: string;
  assessments: readonly EligibilityAssessment[];
  eligible: readonly NormalizedObservation[];
  sellerObservations: readonly SellerObservation[];
  capacitySources: readonly CapacitySourceObservation[];
  regional: readonly RegionalObservation[];
  /** Observations dropped because their retrieval did not complete inside the window, before eligibility ran. */
  outsideWindow: readonly string[];
};

/**
 * Normalized observations -> eligibility -> seller reduction -> capacity-source
 * collapse -> regional calculation, for one calculation date. Only observations
 * from retrievals that completed inside the date's window are considered; the
 * last complete reconfirmation per source is what the adapters should have
 * produced, and eligibility enforces freshness on each observation.
 */
export function runPipeline(input: PipelineInput): PipelineResult {
  const registry = new Map(input.registry.map((r) => [r.slug, r]));
  const entities = new Map(input.entities.map((e) => [e.id, e]));
  const retrievals = new Map(input.retrievals.map((r) => [r.id, r]));

  const inWindow: NormalizedObservation[] = [];
  const outsideWindow: string[] = [];
  for (const o of input.observations) {
    const r = retrievals.get(o.retrievalId);
    const completed = r?.completedAt ?? null;
    if (completed === null || !isWithinWindow(completed, input.calculationDate) || calculationDateOf(o.observedAt) !== input.calculationDate) {
      outsideWindow.push(o.id);
      continue;
    }
    inWindow.push(o);
  }

  const spec = input.spec ?? "accessible";
  const regionScope = input.regionScope ?? "country";
  const assessments = inWindow.map((o) => assessEligibility(o, { calculationDate: input.calculationDate, registry, entities, spec }));
  const eligibleIds = new Set(assessments.filter((a) => a.p2).map((a) => a.observationId));
  const eligible = inWindow.filter((o) => eligibleIds.has(o.id));

  const sellerObservations = reduceSellers(eligible, regionScope);
  const capacitySources = collapseCapacitySources(sellerObservations, entities);

  const regions =
    regionScope === "listed_provider_wide"
      ? [LISTED_SCOPE_KEY]
      : [...new Set([...eligible.map((o) => o.canonicalRegionCode!), ...(input.priorByRegion ? [...input.priorByRegion.keys()] : []), ...(input.seriesRegions ?? [])])].sort();
  const regional = regions.map((region) => {
    const prior = input.priorByRegion?.get(region) ?? null;
    return calculateRegion({
      instrument: input.instrument,
      canonicalRegionCode: region,
      calculationDate: input.calculationDate,
      methodologyVersion: input.methodologyVersion,
      instrumentSpecVersion: input.instrumentSpecVersion,
      participants: capacitySources.filter((c) => c.canonicalRegionCode === region),
      prior,
      priorParticipantIds: prior?.participantIds,
      regionScope,
    });
  });

  return { calculationDate: input.calculationDate, assessments, eligible, sellerObservations, capacitySources, regional, outsideWindow };
}
