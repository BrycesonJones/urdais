/**
 * Development/internal candidate source for listed GPU markets.
 *
 * Rebuilds the in-process candidate from the committed Price of Compute
 * retrievals and seller-evidence snapshots. It never inserts a calculation
 * run, a regional observation, or a publication. The H100 candidate is the
 * frozen 0.1.1-draft interpretation (four participants at 3.74); later GPUs
 * use the GPU-family evidence snapshot.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { PRICE_OF_COMPUTE_SLUG, priceOfComputeAdapter, type PocPricesResponse } from "@/lib/ucpi/adapters/price-of-compute";
import { POC_SELLER_EVIDENCE_2026_09_14, POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY, pocSellerProfiles, type PocSellerEvidence } from "@/lib/ucpi/adapters/price-of-compute-profiles";
import { runPipeline, type PipelineResult } from "@/lib/ucpi/collector";
import type { MarketEntity, Retrieval } from "@/lib/ucpi/domain";
import { normalizationContext, permitted, REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { instrumentPresentation, LISTED_FAMILY, LISTED_GPU_INSTRUMENTS, listedInstrument } from "@/lib/ucpi/listed/instruments";
import { listedViewFromPresentation, type ListedMarketView } from "@/lib/ucpi/read/listed-view";
import { validatePocPrices } from "@/lib/ucpi/runtime/schema-validation";

const RESEARCH = path.join(process.cwd(), "docs/research/price-of-compute");
const FAMILY_TS = "20260914T014547Z";
const CALCULATION_DATE = "2026-09-14";
const METHODOLOGY_VERSION = "0.1.2-draft";
const REGISTRY = [...REGISTRY_TODAY, permitted(PRICE_OF_COMPUTE_SLUG)];

type CandidateSource = {
  file: string;
  wrapped?: boolean;
  evidence: readonly PocSellerEvidence[];
  requestedAt: string;
};

/** Retrieval + evidence pairing that reproduces the persisted candidates. */
const SOURCE_BY_SYMBOL: Readonly<Record<string, CandidateSource>> = {
  "UCPI-H100-SXM-LISTED": {
    file: "production_retrieval_2026-09-14T0110Z.json",
    wrapped: true,
    evidence: POC_SELLER_EVIDENCE_2026_09_14,
    requestedAt: "2026-09-14T01:10:00Z",
  },
  "UCPI-H200-SXM-LISTED": {
    file: `${FAMILY_TS}_api_v1_prices_h200-sxm.json`,
    evidence: POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY,
    requestedAt: "2026-09-14T01:45:47Z",
  },
  "UCPI-B200-LISTED": {
    file: `${FAMILY_TS}_api_v1_prices_b200.json`,
    evidence: POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY,
    requestedAt: "2026-09-14T01:45:47Z",
  },
  "UCPI-A100-SXM4-80GB-LISTED": {
    file: `${FAMILY_TS}_api_v1_prices_a100-sxm-80gb.json`,
    evidence: POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY,
    requestedAt: "2026-09-14T01:45:47Z",
  },
  "UCPI-RTX-5090-LISTED": {
    file: `${FAMILY_TS}_api_v1_prices_rtx-5090.json`,
    evidence: POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY,
    requestedAt: "2026-09-14T01:45:47Z",
  },
};

function payloadFor(source: CandidateSource): PocPricesResponse {
  const raw = JSON.parse(readFileSync(path.join(RESEARCH, source.file), "utf8")) as { response?: unknown };
  return validatePocPrices(source.wrapped ? raw.response : raw);
}

function entitiesFor(evidence: readonly PocSellerEvidence[]): { list: MarketEntity[]; map: ReadonlyMap<string, MarketEntity> } {
  const slugs = [...new Set(evidence.map((e) => e.slug))];
  const list = slugs.map((slug) => ({
    id: `ent-${slug}`,
    slug,
    name: slug,
    legalName: evidence.find((e) => e.slug === slug)?.legalNameEvidenced ? `${slug} legal` : null,
    legalIdentifier: null,
    controllingEntityId: null,
  }));
  return { list, map: new Map(list.map((e) => [e.id, e])) };
}

function retrievalFor(symbol: string, requestedAt: string): Retrieval {
  return {
    id: `ret-${symbol}`,
    sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG,
    requestedAt,
    completedAt: requestedAt.replace(/:00Z$/, ":01Z").replace(/:47Z$/, ":48Z"),
    responseStatus: 200,
    request: priceOfComputeAdapter.buildRequest({ baseUrl: "https://priceofcompute.com", sku: symbol }),
    enumerationAssessment: "complete",
    retrievalPurpose: "production",
    permissionGrantId: "grant-poc",
  };
}

/** In-process listed candidate for one instrument; nothing is persisted. */
export function runListedCandidate(symbol: string): PipelineResult {
  const instrument = listedInstrument(symbol);
  const source = SOURCE_BY_SYMBOL[symbol];
  if (!instrument || !source) throw new Error(`no candidate source for ${symbol}`);
  const { list, map } = entitiesFor(source.evidence);
  const profiles = pocSellerProfiles(new Map(list.map((e) => [e.slug, e.id])), source.evidence);
  const retrieval = retrievalFor(symbol, source.requestedAt);
  const ctx = normalizationContext({
    instrumentSpecVersion: instrument.specVersion,
    methodologyVersion: METHODOLOGY_VERSION,
    sellerProfiles: profiles,
    entities: map,
  });
  const observations = priceOfComputeAdapter.parse(retrieval, payloadFor(source), profiles).map((raw) => priceOfComputeAdapter.normalize(raw, retrieval, ctx));
  return runPipeline({
    instrument: symbol,
    calculationDate: CALCULATION_DATE,
    methodologyVersion: METHODOLOGY_VERSION,
    instrumentSpecVersion: instrument.specVersion,
    observations,
    retrievals: [retrieval],
    entities: list,
    registry: REGISTRY,
    spec: LISTED_FAMILY.spec,
    regionScope: LISTED_FAMILY.regionScope,
    identity: instrument.identity,
  });
}

export function listedCandidateView(symbol: string): ListedMarketView {
  const result = runListedCandidate(symbol);
  const obs = result.regional[0];
  if (!obs) throw new Error(`${symbol}: candidate pipeline produced no regional observation`);
  return listedViewFromPresentation(instrumentPresentation(symbol), {
    price: obs.priceLevel,
    participantCount: obs.participantCount,
    breadth: obs.marketBreadth,
    technicalSourceCount: obs.contributingSourceCount,
    largestSourceShare: obs.largestSourceParticipantShare,
    asOfDate: obs.calculationDate,
    freshness: { windowStart: obs.windowStart, cutoff: obs.cutoff, allInputsWithinWindow: true },
    status: obs.outcome === "unavailable" ? "unavailable" : "candidate",
    methodologyVersion: obs.methodologyVersion,
    childSpecVersion: obs.instrumentSpecVersion,
    attributions: obs.sourceAttributions,
    oneDayPctChange: obs.percentageChange1d,
    structuralCondition: obs.structuralCondition,
    isCandidate: true,
    isPublished: false,
  });
}

let cached: readonly ListedMarketView[] | null = null;

/** All five listed GPU candidates, memoised for a process. */
export function developmentListedCandidates(): readonly ListedMarketView[] {
  return (cached ??= LISTED_GPU_INSTRUMENTS.map((instrument) => listedCandidateView(instrument.symbol)));
}
