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
