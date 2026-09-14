/**
 * The shape of a UCPI series point as a future API would return it. Defined
 * here, not routed anywhere. It carries no participant prices, no raw payloads
 * and no provider identities; at Minimum breadth dispersion is absent by
 * construction. Percentage change is the headline change signal, never a
 * currency difference.
 */

import type { RegionalObservation } from "@/lib/ucpi/aggregation";
import { publicationStatus } from "@/lib/ucpi/calculation-window";

export type UcpiSeriesPoint = {
  instrument: string;
  country: string;
  calculationDate: string;
  status: "published" | "delayed" | "unavailable";
  priceLevel: number | null;
  currency: "USD";
  unit: "accelerator_hour";
  percentageChange1d: number | null;
  changeDisposition: "published" | "annotated" | "withheld" | null;
  marketBreadth: "minimum" | "normal" | null;
  structuralCondition: "NO_ELIGIBLE_PARTICIPANT" | "SINGLE_PARTICIPANT" | null;
  participantCount: number;
  contributingSourceCount: number;
  largestSourceParticipantShare: number | null;
  dispersion: { p10: number; p50: number; p90: number; iqr: number } | null;
  reasonCodes: readonly string[];
  freshness: { windowStart: string; cutoff: string; allInputsWithinWindow: true };
  methodologyVersion: string;
  instrumentSpecVersion: string;
  calculatedAt: string;
  publishedAt: string | null;
};

/** Every key a public series point may carry, at the top level. Anything else is a schema violation. */
export const PUBLIC_SERIES_POINT_KEYS: readonly (keyof UcpiSeriesPoint)[] = [
  "instrument", "country", "calculationDate", "status", "priceLevel", "currency", "unit", "percentageChange1d", "changeDisposition",
  "marketBreadth", "structuralCondition", "participantCount", "contributingSourceCount", "largestSourceParticipantShare", "dispersion",
  "reasonCodes", "freshness", "methodologyVersion", "instrumentSpecVersion", "calculatedAt", "publishedAt",
];

const NESTED_KEYS: Readonly<Record<string, readonly string[]>> = {
  dispersion: ["p10", "p50", "p90", "iqr"],
  freshness: ["windowStart", "cutoff", "allInputsWithinWindow"],
};

/**
 * Fields that name a constituent, its price, its lineage or a secret. Forbidden
 * anywhere in a public response, at any depth and at any participant count.
 * The check is structural: a public aggregate is allowed to equal a constituent
 * price numerically, which happens whenever participants quote the same price.
 */
export const CONSTITUENT_FIELDS: readonly string[] = [
  "participants", "participant", "participantPrices", "representativePrice", "memberSellerEntityIds", "capacitySourceEntityId",
  "sellerEntityId", "operatorEntityId", "selectedObservationId", "candidates", "rawPayload", "responseBody", "retrievalId",
  "permissionGrantId", "authorization", "apiKey", "credential", "normalizedPrice", "nativePrice",
];

/** Returns reason codes; an empty array means the shape is publishable. */
export function validatePublicResponseShape(json: unknown): string[] {
  const reasons: string[] = [];
  if (typeof json !== "object" || json === null || Array.isArray(json)) return ["PUBLIC_RESPONSE_NOT_OBJECT"];
  const walk = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (typeof value !== "object" || value === null) return;
    for (const [key, v] of Object.entries(value)) {
      if (CONSTITUENT_FIELDS.includes(key)) reasons.push(`CONSTITUENT_FIELD_EXPOSED:${path ? `${path}.` : ""}${key}`);
      walk(v, path ? `${path}.${key}` : key);
    }
  };
  walk(json, "");
  const top = json as Record<string, unknown>;
  for (const key of Object.keys(top)) {
    if (!(PUBLIC_SERIES_POINT_KEYS as readonly string[]).includes(key)) reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:${key}`);
  }
  for (const key of PUBLIC_SERIES_POINT_KEYS) {
    if (!(key in top)) reasons.push(`PUBLIC_RESPONSE_MISSING_FIELD:${key}`);
  }
  for (const [parent, allowed] of Object.entries(NESTED_KEYS)) {
    const nested = top[parent];
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      for (const key of Object.keys(nested)) if (!allowed.includes(key)) reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:${parent}.${key}`);
    }
  }
  return [...new Set(reasons)];
}

export function toSeriesPoint(obs: RegionalObservation, run: { calculatedAt: string; publishedAt: string | null }): UcpiSeriesPoint {
  const status = publicationStatus({ calculationDate: obs.calculationDate, publishedAt: run.publishedAt, producible: obs.outcome === "value" });
  return {
    instrument: obs.instrument,
    country: obs.canonicalRegionCode,
    calculationDate: obs.calculationDate,
    status,
    priceLevel: obs.priceLevel,
    currency: obs.currency,
    unit: obs.unit,
    percentageChange1d: obs.percentageChange1d,
    changeDisposition: obs.changeDisposition,
    marketBreadth: obs.marketBreadth,
    structuralCondition: obs.structuralCondition,
    participantCount: obs.participantCount,
    contributingSourceCount: obs.contributingSourceCount,
    largestSourceParticipantShare: obs.largestSourceParticipantShare,
    dispersion: obs.dispersionPublished ? obs.dispersion : null,
    reasonCodes: obs.diagnostics,
    freshness: { windowStart: obs.windowStart, cutoff: obs.cutoff, allInputsWithinWindow: true },
    methodologyVersion: obs.methodologyVersion,
    instrumentSpecVersion: obs.instrumentSpecVersion,
    calculatedAt: run.calculatedAt,
    publishedAt: run.publishedAt,
  };
}
