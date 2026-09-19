/**
 * The capacity collector contract.
 *
 * A capacity adapter reads one source interface and returns capacity
 * observations, or returns nothing. It is deliberately a separate contract
 * from the UCPI price adapter rather than an extra method on it, because the
 * two answer different questions and a shared interface would make it natural
 * to derive one answer from the other's inputs.
 *
 * What an adapter may not do:
 *
 *   - invent a quantity a source did not state
 *   - treat a failed retrieval as zero available
 *   - treat presence in a price catalog as availability
 *   - emit an observation for an interface with no assessed capability
 *
 * The first three are prevented by construction: `extract` returns
 * measurements built by the normalize module, which has no constructor that
 * accepts a quantity without a source field, and a throwing or empty extract
 * yields an outcome of "unavailable" rather than a zero.
 */

import type {
  CapacityMeasurement,
  CapacityObservation,
  CapacityQuantityUnit,
  CapacityHardware,
} from "@/lib/capacity/domain";
import type { RawOffer, Retrieval } from "@/lib/ucpi/domain";

/** What one adapter extracts from one raw offer, before identity is attached. */
export type CapacityReading = {
  measurement: CapacityMeasurement;
  /** Required for any quantity: a number needs evidence behind it. */
  evidenceGrade: 1 | 2 | 3 | 4 | 5 | 6 | null;
  /** The source's own expression, preserved verbatim. */
  sourceNativeValue: string | null;
  /** The field it was read from. */
  sourceNativeField: string | null;
  hardware: CapacityHardware;
  sourceNativeRegion: string | null;
};

export type CapacityNormalizationContext = {
  methodologyVersion: string;
  collectorIdentity: string;
  /** Canonical entity ids, reused from the market-entity registry. */
  sellerEntityIdByProvider: ReadonlyMap<string, string>;
  regionMappings: ReadonlyMap<string, { canonicalRegionCode: string; evidence: string }>;
};

export type CapacityAdapter<TResponse> = {
  providerSlug: string;
  sourceInterfaceSlug: string;
  /** The unit this interface counts in, or null where it states no quantity at all. */
  quantityUnit: CapacityQuantityUnit | null;
  /**
   * Turn one response into raw offers. Shares the UCPI raw-offer shape so that
   * one retrieval can feed both pipelines without being read twice.
   */
  parse(retrieval: Retrieval, response: TResponse): RawOffer[];
  /**
   * Read the capacity signal out of one raw offer.
   *
   * Returns null where this offer carries no capacity signal — which is a
   * Tier 4 outcome, recorded as such, and never a zero.
   */
  extract(raw: RawOffer, retrieval: Retrieval): CapacityReading | null;
};

/** The outcome of one collection attempt. */
export type CollectionOutcome =
  | { status: "collected"; observations: readonly CapacityObservation[] }
  /**
   * The retrieval failed. This is emphatically not "capacity is zero": no
   * observation is written, and the source is reported as temporarily
   * unavailable so that the total's coverage falls rather than its value.
   */
  | { status: "unavailable"; reason: string }
  /** The interface is registered but Urdais may not use it for this purpose. */
  | { status: "not_permitted"; reason: string };

/**
 * Assemble observations from readings.
 *
 * Idempotent in the sense the ingestion architecture already uses: the
 * observation id is derived from the raw offer it descends from, so re-running
 * a collector over the same retrieval produces the same ids. A genuinely new
 * retrieval produces new ids and a new row, which is what makes the dataset a
 * time series rather than a mutable current state.
 */
export function buildObservations(
  readings: readonly { raw: RawOffer; reading: CapacityReading }[],
  retrieval: Retrieval,
  context: CapacityNormalizationContext,
  sourceUrl: string | null = null,
): readonly CapacityObservation[] {
  const observations: CapacityObservation[] = [];
  for (const { raw, reading } of readings) {
    const sellerEntityId = raw.nativeSellerId === null
      ? undefined
      : context.sellerEntityIdByProvider.get(raw.nativeSellerId);
    if (sellerEntityId === undefined) continue;

    const mapping = reading.sourceNativeRegion === null
      ? undefined
      : context.regionMappings.get(`${retrieval.sourceInterfaceSlug}|${reading.sourceNativeRegion}`);

    observations.push({
      id: `c:${raw.id}`,
      provenance: {
        rawOfferId: raw.id,
        retrievalId: raw.retrievalId,
        sourceInterfaceSlug: retrieval.sourceInterfaceSlug,
        methodologyVersion: context.methodologyVersion,
        collectorIdentity: context.collectorIdentity,
        sourceNativeValue: reading.sourceNativeValue,
        sourceNativeField: reading.sourceNativeField,
        sourceUrl,
      },
      sellerEntityId,
      operatorEntityId: null,
      marketplaceEntityId: null,
      // Operator where determinable, seller otherwise. The Phase 1 study found
      // no operator identity at any seller, so the fallback is the live path.
      capacitySourceEntityId: sellerEntityId,
      canonicalRegionCode: mapping?.canonicalRegionCode ?? null,
      sourceNativeRegion: reading.sourceNativeRegion,
      hardware: reading.hardware,
      serviceTier: null,
      measurement: reading.measurement,
      availabilityEvidenceGrade: reading.evidenceGrade,
      observedAt: raw.observedAt,
      sourceEffectiveAt: raw.sourceEffectiveAt,
      availabilityObservedAt: raw.availabilityObservedAt,
      retrievedAt: retrieval.completedAt ?? raw.observedAt,
      supersededById: null,
    });
  }
  return observations;
}
