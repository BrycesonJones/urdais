/**
 * Canonical public read model for listed GPU markets.
 *
 * One shape serves both the pre-publication candidate path and the
 * post-calculation publication path. The frontend never needs to know which
 * source produced a row except for the status badge (Candidate vs Delayed vs
 * Published vs Unavailable). Constituent prices, seller identities, raw
 * payloads, grants and secrets are not fields of this object and are refused
 * by the same structural walk the series-point contract uses.
 */

import { CONSTITUENT_FIELDS } from "@/lib/ucpi/api-contract";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import { LISTED_AVAILABILITY_CAVEAT, LISTED_FAMILY, LISTED_MINIMUM_PARTICIPANTS, listedInstrument } from "@/lib/ucpi/listed/instruments";
import type { InstrumentPresentation } from "@/lib/ucpi/listed/instruments";

export type ListedMarketStatus = "candidate" | "published" | "delayed" | "unavailable" | "no_calculation";

export type ListedAvailabilityState = "available" | "unavailable" | "pending";

export type ListedMarketView = {
  symbol: string;
  displayName: string;
  gpuLabel: string;
  price: number | null;
  currency: "USD";
  unit: "accelerator_hour";
  observationType: "listed";
  procurementMode: "on_demand";
  participantCount: number;
  breadth: "minimum" | "normal" | null;
  technicalSourceCount: number;
  largestSourceShare: number | null;
  asOfDate: string | null;
  freshness: { windowStart: string; cutoff: string; allInputsWithinWindow: true } | null;
  status: ListedMarketStatus;
  regionScope: "listed_provider_wide";
  methodologyVersion: string;
  childSpecVersion: string;
  attributions: readonly string[];
  oneDayPctChange: number | null;
  availabilityState: ListedAvailabilityState;
  isPublished: boolean;
  isCandidate: boolean;
  structuralCondition: "NO_ELIGIBLE_PARTICIPANT" | "SINGLE_PARTICIPANT" | null;
  minimumParticipants: number;
  familyMethodologySlug: string;
  childMethodologySlug: string;
  caveat: string;
};

export const PUBLIC_LISTED_MARKET_KEYS: readonly (keyof ListedMarketView)[] = [
  "symbol",
  "displayName",
  "gpuLabel",
  "price",
  "currency",
  "unit",
  "observationType",
  "procurementMode",
  "participantCount",
  "breadth",
  "technicalSourceCount",
  "largestSourceShare",
  "asOfDate",
  "freshness",
  "status",
  "regionScope",
  "methodologyVersion",
  "childSpecVersion",
  "attributions",
  "oneDayPctChange",
  "availabilityState",
  "isPublished",
  "isCandidate",
  "structuralCondition",
  "minimumParticipants",
  "familyMethodologySlug",
  "childMethodologySlug",
  "caveat",
];

const NESTED_KEYS: Readonly<Record<string, readonly string[]>> = {
  freshness: ["windowStart", "cutoff", "allInputsWithinWindow"],
};

/** Identity-only row when no calculation exists and candidates must not be shown. */
export function unpublishedListedView(symbol: string): ListedMarketView {
  const instrument = listedInstrument(symbol);
  if (!instrument) throw new Error(`unknown listed instrument ${symbol}`);
  return Object.freeze({
    symbol: instrument.symbol,
    displayName: instrument.displayName,
    gpuLabel: instrument.gpuLabel,
    price: null,
    currency: "USD",
    unit: "accelerator_hour",
    observationType: "listed",
    procurementMode: "on_demand",
    participantCount: 0,
    breadth: null,
    technicalSourceCount: 0,
    largestSourceShare: null,
    asOfDate: null,
    freshness: null,
    status: "no_calculation",
    regionScope: "listed_provider_wide",
    methodologyVersion: "0.1.2-draft",
    childSpecVersion: instrument.specVersion,
    attributions: [],
    oneDayPctChange: null,
    availabilityState: "pending",
    isPublished: false,
    isCandidate: false,
    structuralCondition: null,
    minimumParticipants: LISTED_MINIMUM_PARTICIPANTS,
    familyMethodologySlug: LISTED_FAMILY.docSlug,
    childMethodologySlug: instrument.docSlug,
    caveat: LISTED_AVAILABILITY_CAVEAT,
  });
}

export function listedViewFromSeriesPoint(point: UcpiSeriesPoint): ListedMarketView {
  const instrument = listedInstrument(point.instrument);
  if (!instrument) throw new Error(`unknown listed instrument ${point.instrument}`);
  const unavailable = point.status === "unavailable";
  const published = point.status === "published" && point.publishedAt !== null;
  const status: ListedMarketStatus = unavailable ? "unavailable" : published ? "published" : "delayed";
  return Object.freeze({
    symbol: instrument.symbol,
    displayName: point.displayName,
    gpuLabel: instrument.gpuLabel,
    price: point.priceLevel,
    currency: point.currency,
    unit: point.unit,
    observationType: "listed",
    procurementMode: "on_demand",
    participantCount: point.participantCount,
    breadth: point.marketBreadth,
    technicalSourceCount: point.contributingSourceCount,
    largestSourceShare: point.largestSourceParticipantShare,
    asOfDate: point.calculationDate,
    freshness: point.freshness,
    status,
    regionScope: "listed_provider_wide",
    methodologyVersion: point.methodologyVersion,
    childSpecVersion: point.instrumentSpecVersion,
    attributions: point.attributions,
    oneDayPctChange: point.percentageChange1d,
    availabilityState: unavailable ? "unavailable" : "available",
    isPublished: published,
    isCandidate: false,
    structuralCondition: point.structuralCondition,
    minimumParticipants: LISTED_MINIMUM_PARTICIPANTS,
    familyMethodologySlug: LISTED_FAMILY.docSlug,
    childMethodologySlug: instrument.docSlug,
    caveat: LISTED_AVAILABILITY_CAVEAT,
  });
}

export function listedViewFromPresentation(
  presentation: InstrumentPresentation,
  input: {
    price: number | null;
    participantCount: number;
    breadth: "minimum" | "normal" | null;
    technicalSourceCount: number;
    largestSourceShare: number | null;
    asOfDate: string;
    freshness: { windowStart: string; cutoff: string; allInputsWithinWindow: true };
    status: ListedMarketStatus;
    methodologyVersion: string;
    childSpecVersion: string;
    attributions: readonly string[];
    oneDayPctChange: number | null;
    structuralCondition: "NO_ELIGIBLE_PARTICIPANT" | "SINGLE_PARTICIPANT" | null;
    isCandidate: boolean;
    isPublished: boolean;
  },
): ListedMarketView {
  const instrument = listedInstrument(presentation.symbol);
  if (!instrument) throw new Error(`unknown listed instrument ${presentation.symbol}`);
  const unavailable = input.status === "unavailable";
  return Object.freeze({
    symbol: presentation.symbol,
    displayName: presentation.displayName,
    gpuLabel: instrument.gpuLabel,
    price: input.price,
    currency: "USD",
    unit: "accelerator_hour",
    observationType: "listed",
    procurementMode: "on_demand",
    participantCount: input.participantCount,
    breadth: input.breadth,
    technicalSourceCount: input.technicalSourceCount,
    largestSourceShare: input.largestSourceShare,
    asOfDate: input.asOfDate,
    freshness: input.freshness,
    status: input.status,
    regionScope: "listed_provider_wide",
    methodologyVersion: input.methodologyVersion,
    childSpecVersion: input.childSpecVersion,
    attributions: input.attributions,
    oneDayPctChange: input.oneDayPctChange,
    availabilityState: unavailable ? "unavailable" : input.price === null ? "pending" : "available",
    isPublished: input.isPublished,
    isCandidate: input.isCandidate,
    structuralCondition: input.structuralCondition,
    minimumParticipants: LISTED_MINIMUM_PARTICIPANTS,
    familyMethodologySlug: LISTED_FAMILY.docSlug,
    childMethodologySlug: instrument.docSlug,
    caveat: LISTED_AVAILABILITY_CAVEAT,
  });
}

/** Returns reason codes; an empty array means the view is safe to expose. */
export function validateListedMarketView(json: unknown): string[] {
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
    if (!(PUBLIC_LISTED_MARKET_KEYS as readonly string[]).includes(key)) reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:${key}`);
  }
  for (const key of PUBLIC_LISTED_MARKET_KEYS) {
    if (!(key in top)) reasons.push(`PUBLIC_RESPONSE_MISSING_FIELD:${key}`);
  }
  for (const [parent, allowed] of Object.entries(NESTED_KEYS)) {
    const nested = top[parent];
    if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
      for (const nestedKey of Object.keys(nested)) {
        if (!allowed.includes(nestedKey)) reasons.push(`PUBLIC_RESPONSE_UNKNOWN_FIELD:${parent}.${nestedKey}`);
      }
    }
  }
  if ("priceChange" in top || "absoluteChange" in top || "changeAmount" in top) {
    reasons.push("ABSOLUTE_CHANGE_EXPOSED");
  }
  if (top.isCandidate === true && top.isPublished === true) reasons.push("CANDIDATE_MARKED_PUBLISHED");
  return [...new Set(reasons)];
}

export function assertListedViewSafe(view: ListedMarketView): ListedMarketView {
  const reasons = validateListedMarketView(JSON.parse(JSON.stringify(view)) as unknown);
  if (reasons.length > 0) throw new Error(`${view.symbol}: listed view is not publishable: ${reasons.join(", ")}`);
  return view;
}
