/**
 * The listed GPU family: registry integrity, SKU mapping and variant separation,
 * the family read model, and each target instrument's candidate from the saved
 * Price of Compute payloads of 2026-09-14T01:45Z under the GPU-family evidence
 * snapshot. The H100 regression lives beside it: the frozen snapshot reproduces
 * the persisted 0.1.1-draft candidate exactly.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LISTED_SCOPE_KEY } from "@/lib/ucpi/aggregation";
import { identifyPocSku, POC_SKU_IDENTITY, PRICE_OF_COMPUTE_ATTRIBUTION, PRICE_OF_COMPUTE_SLUG, priceOfComputeAdapter, type PocPricesResponse } from "@/lib/ucpi/adapters/price-of-compute";
import { POC_SELLER_EVIDENCE_2026_09_14, POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY, POC_SELLER_EVIDENCE_2026_09_15, pocSellerProfiles, type PocSellerEvidence } from "@/lib/ucpi/adapters/price-of-compute-profiles";
import { PUBLIC_SERIES_POINT_KEYS, toSeriesPoint, validatePublicResponseShape } from "@/lib/ucpi/api-contract";
import { runPipeline, type PipelineResult } from "@/lib/ucpi/collector";
import type { MarketEntity, Retrieval } from "@/lib/ucpi/domain";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import { normalizationContext, permitted, REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { instrumentPresentation, LISTED_FAMILY, LISTED_GPU_INSTRUMENTS, listedInstrument, listedInstrumentForSku } from "@/lib/ucpi/listed/instruments";
import { listListedMarkets } from "@/lib/ucpi/read/markets";
import { InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { validatePocPrices } from "@/lib/ucpi/runtime/schema-validation";

const RESEARCH = path.join(process.cwd(), "docs/research/price-of-compute");
const TS = "20260914T014547Z";
const payload = (file: string): PocPricesResponse => validatePocPrices(JSON.parse(readFileSync(path.join(RESEARCH, file), "utf8")));
const PAYLOADS = {
  // The preserved production retrieval of 2026-09-14T01:10Z: the payload the persisted H100 candidate was computed from.
  "UCPI-H100-SXM-LISTED": validatePocPrices((JSON.parse(readFileSync(path.join(RESEARCH, "production_retrieval_2026-09-14T0110Z.json"), "utf8")) as { response: unknown }).response),
  "UCPI-H200-SXM-LISTED": payload(`${TS}_api_v1_prices_h200-sxm.json`),
  "UCPI-B200-LISTED": payload(`${TS}_api_v1_prices_b200.json`),
  "UCPI-A100-SXM4-80GB-LISTED": payload(`${TS}_api_v1_prices_a100-sxm-80gb.json`),
  "UCPI-RTX-5090-LISTED": payload(`${TS}_api_v1_prices_rtx-5090.json`),
} as const;
const H200_NVL = payload(`${TS}_api_v1_prices_h200-nvl.json`);
const A100_40 = payload(`${TS}_api_v1_prices_a100-sxm-40gb.json`);

const SLUGS = [...new Set([...POC_SELLER_EVIDENCE_2026_09_14, ...POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY].map((e) => e.slug))];
const ENTITY_IDS = new Map(SLUGS.map((slug) => [slug, `ent-${slug}`]));
function entitiesFor(evidence: readonly PocSellerEvidence[]): { list: MarketEntity[]; map: ReadonlyMap<string, MarketEntity> } {
  const list = SLUGS.map((slug) => ({ id: `ent-${slug}`, slug, name: slug, legalName: evidence.find((e) => e.slug === slug)?.legalNameEvidenced ? `${slug} legal` : null, legalIdentifier: null, controllingEntityId: null, useRefusedEvidence: evidence.find((e) => e.slug === slug)?.useRefused ?? null }));
  return { list, map: new Map(list.map((e) => [e.id, e])) };
}
const REGISTRY = [...REGISTRY_TODAY, permitted(PRICE_OF_COMPUTE_SLUG)];
const retrievalFor = (id: string): Retrieval => ({ id, sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG, requestedAt: "2026-09-14T01:45:47Z", completedAt: "2026-09-14T01:45:48Z", responseStatus: 200, request: priceOfComputeAdapter.buildRequest({ baseUrl: "https://priceofcompute.com", sku: id }), enumerationAssessment: "complete", retrievalPurpose: "production", permissionGrantId: "grant-poc" });

/** Runs the family pipeline for one instrument on one payload under one evidence snapshot. */
function candidate(symbol: string, data: PocPricesResponse, evidence: readonly PocSellerEvidence[]): PipelineResult & { observations: ReturnType<typeof priceOfComputeAdapter.normalize>[] } {
  const instrument = listedInstrument(symbol)!;
  const profiles = pocSellerProfiles(ENTITY_IDS, evidence);
  const { list, map } = entitiesFor(evidence);
  const retrieval = retrievalFor(`ret-${symbol}`);
  const ctx = normalizationContext({ instrumentSpecVersion: instrument.specVersion, methodologyVersion: "0.1.2-draft", sellerProfiles: profiles, entities: map });
  const observations = priceOfComputeAdapter.parse(retrieval, data, profiles).map((r) => priceOfComputeAdapter.normalize(r, retrieval, ctx));
  const result = runPipeline({ instrument: symbol, calculationDate: "2026-09-14", methodologyVersion: "0.1.2-draft", instrumentSpecVersion: instrument.specVersion, observations, retrievals: [retrieval], entities: list, registry: REGISTRY, spec: LISTED_FAMILY.spec, regionScope: LISTED_FAMILY.regionScope, identity: instrument.identity });
  return { ...result, observations };
}
const sellers = (r: PipelineResult) => r.sellerObservations.map((s) => s.sellerEntityId.replace("ent-", "")).sort();
const exclusionsBySeller = (r: PipelineResult & { observations: { id: string; sellerEntityId: string; serviceTier: { tier_label?: string | null } | null }[] }, slug: string, tier = "on_demand") => {
  const o = r.observations.find((x) => x.sellerEntityId === `ent-${slug}` && x.serviceTier?.tier_label === tier)!;
  return r.assessments.find((a) => a.observationId === o.id)!.exclusions;
};

describe("listed GPU registry", () => {
  it("declares five instruments with distinct symbols, SKUs and identities", () => {
    expect(LISTED_GPU_INSTRUMENTS.map((i) => i.symbol)).toEqual(["UCPI-H100-SXM-LISTED", "UCPI-H200-SXM-LISTED", "UCPI-B200-LISTED", "UCPI-A100-SXM4-80GB-LISTED", "UCPI-RTX-5090-LISTED"]);
    const skus = LISTED_GPU_INSTRUMENTS.flatMap((i) => i.upstreamSkus[PRICE_OF_COMPUTE_SLUG] ?? []);
    expect(new Set(skus).size).toBe(skus.length);
    for (const i of LISTED_GPU_INSTRUMENTS) expect(i.symbol).toMatch(/^[A-Z0-9]+(-[A-Z0-9]+)*$/);
  });

  it("maps upstream SKUs to exactly one instrument and leaves variants and unsupported SKUs unmapped", () => {
    expect(listedInstrumentForSku(PRICE_OF_COMPUTE_SLUG, "H200-SXM")?.symbol).toBe("UCPI-H200-SXM-LISTED");
    expect(listedInstrumentForSku(PRICE_OF_COMPUTE_SLUG, "H200-NVL")).toBeUndefined();
    expect(listedInstrumentForSku(PRICE_OF_COMPUTE_SLUG, "A100-SXM-80GB")?.symbol).toBe("UCPI-A100-SXM4-80GB-LISTED");
    expect(listedInstrumentForSku(PRICE_OF_COMPUTE_SLUG, "A100-SXM-40GB")).toBeUndefined();
    expect(listedInstrumentForSku(PRICE_OF_COMPUTE_SLUG, "A100-PCIE-80GB")).toBeUndefined();
    expect(listedInstrumentForSku(PRICE_OF_COMPUTE_SLUG, "GB200")).toBeUndefined();
    expect(listedInstrumentForSku("some-other-source", "H100-SXM")).toBeUndefined();
  });

  it("vendor SKU identity separates form factors and memory classes; an unknown SKU is insufficient", () => {
    expect(POC_SKU_IDENTITY["H200-SXM"]).toEqual({ vendor: "NVIDIA", model: "H200", formFactor: "SXM", memoryGb: 141 });
    expect(POC_SKU_IDENTITY["H200-NVL"]!.formFactor).toBe("NVL");
    expect(POC_SKU_IDENTITY["A100-SXM-40GB"]!.memoryGb).toBe(40);
    expect(identifyPocSku("RTX-5090")).toMatchObject({ grade: "C", model: "RTX 5090", formFactor: "PCIe", memoryGb: 32 });
    expect(identifyPocSku("GB200-NVL72").grade).toBe("insufficient");
    expect(identifyPocSku("MI300X").grade).toBe("insufficient");
  });

  it("presents every instrument for the public surface without exposing constituents", () => {
    for (const i of LISTED_GPU_INSTRUMENTS) {
      const p = instrumentPresentation(i.symbol);
      expect(p).toMatchObject({ observationType: "listed", procurementMode: "on_demand" });
      expect(p.gpu.label).toBe(i.gpuLabel);
    }
    expect(instrumentPresentation("UCPI-H100-SXM").observationType).toBe("accessible");
    expect(() => instrumentPresentation("UCPI-NOPE")).toThrow();
  });
});

describe("H100 regression under the generalized family", () => {
  it("the frozen 2026-09-14 evidence snapshot reproduces the persisted 0.1.1-draft candidate: 3.74, N=4, Normal, Nebius excluded for legal identity", () => {
    const r = candidate("UCPI-H100-SXM-LISTED", PAYLOADS["UCPI-H100-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14);
    expect(sellers(r)).toEqual(["hyperstack", "lambda", "runpod", "voltagepark"]);
    const x = r.regional[0]!;
    expect(x).toMatchObject({ outcome: "value", participantCount: 4, marketBreadth: "normal", contributingSourceCount: 1, largestSourceParticipantShare: 1, regionScope: "listed_provider_wide", canonicalRegionCode: LISTED_SCOPE_KEY });
    expect(x.priceLevel).toBeCloseTo(3.74);
    expect(x.sourceAttributions).toEqual([PRICE_OF_COMPUTE_ATTRIBUTION]);
    expect(exclusionsBySeller(r, "nebius")).toEqual(["SELLER_LEGAL_IDENTITY_UNRESOLVED"]);
    expect(exclusionsBySeller(r, "datacrunch")).toEqual(expect.arrayContaining(["MINIMUM_TOPOLOGY_UNKNOWN", "SELLER_LEGAL_IDENTITY_UNRESOLVED"]));
  });

  it("under the GPU-family snapshot Verda is evidenced (DataCrunch Oy, 1x H100 SXM5) and would join as a fifth seller; the historical interpretation is not overwritten by this", () => {
    const r = candidate("UCPI-H100-SXM-LISTED", PAYLOADS["UCPI-H100-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
    expect(sellers(r)).toEqual(["datacrunch", "hyperstack", "lambda", "runpod", "voltagepark"]);
    expect(r.regional[0]!.priceLevel).toBeCloseTo(3.49);
    expect(r.regional[0]!.participantCount).toBe(5);
  });
});

describe("H200 SXM", () => {
  const r = candidate("UCPI-H200-SXM-LISTED", PAYLOADS["UCPI-H200-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
  it("two legal per-accelerator sellers (Verda, Runpod): Minimum breadth, even-N median 4.395, dispersion withheld", () => {
    expect(sellers(r)).toEqual(["datacrunch", "runpod"]);
    expect(r.regional[0]).toMatchObject({ outcome: "value", participantCount: 2, marketBreadth: "minimum", dispersionPublished: false, contributingSourceCount: 1, largestSourceParticipantShare: 1 });
    expect(r.regional[0]!.priceLevel).toBeCloseTo((4.2 + 4.59) / 2);
  });
  it("excludes CoreWeave as a whole node, Nebius for legal identity, Vast as an aggregate, and every spot and community row", () => {
    expect(exclusionsBySeller(r, "coreweave")).toContain("WHOLE_NODE_REQUIRED");
    // Nebius has neither an H200 topology nor a single contracting entity; both codes are named.
    expect(exclusionsBySeller(r, "nebius")).toEqual(expect.arrayContaining(["MINIMUM_TOPOLOGY_UNKNOWN", "SELLER_LEGAL_IDENTITY_UNRESOLVED"]));
    expect(exclusionsBySeller(r, "vast")).toContain("WRONG_SERVICE_PRODUCT");
    expect(exclusionsBySeller(r, "runpod", "community")).toContain("WRONG_PROCUREMENT_MODE");
    expect(exclusionsBySeller(r, "datacrunch", "spot")).toEqual(expect.arrayContaining(["WRONG_PROCUREMENT_MODE", "PREEMPTIBLE"]));
  });
  it("H200 NVL rows fail identity for the SXM instrument instead of being collapsed into it", () => {
    const nvl = candidate("UCPI-H200-SXM-LISTED", H200_NVL, POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
    expect(nvl.eligible).toHaveLength(0);
    expect(nvl.assessments.every((a) => a.exclusions.includes("WRONG_HARDWARE"))).toBe(true);
    expect(nvl.regional[0]).toMatchObject({ outcome: "unavailable", structuralCondition: "NO_ELIGIBLE_PARTICIPANT" });
  });
});

describe("B200", () => {
  const r = candidate("UCPI-B200-LISTED", PAYLOADS["UCPI-B200-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
  it("three legal per-accelerator sellers (Verda, Runpod, Lambda): Normal breadth, odd-N median 6.79", () => {
    expect(sellers(r)).toEqual(["datacrunch", "lambda", "runpod"]);
    expect(r.regional[0]).toMatchObject({ outcome: "value", priceLevel: 6.79, participantCount: 3, marketBreadth: "normal", dispersionPublished: true });
  });
  it("Massed Compute's node price divided by eight is excluded as a whole node; Lambda carries the quantity-tier diagnostic", () => {
    expect(exclusionsBySeller(r, "massedcompute")).toContain("WHOLE_NODE_REQUIRED");
    const lambda = r.observations.find((o) => o.sellerEntityId === "ent-lambda" && o.serviceTier?.tier_label === "on_demand")!;
    expect(r.assessments.find((a) => a.observationId === lambda.id)!.diagnostics).toContain("SELLER_PRICE_TIERED_BY_QUANTITY");
    expect(exclusionsBySeller(r, "coreweave")).toContain("WHOLE_NODE_REQUIRED");
  });
});

describe("A100 SXM4 80GB", () => {
  const r = candidate("UCPI-A100-SXM4-80GB-LISTED", PAYLOADS["UCPI-A100-SXM4-80GB-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
  it("three legal per-accelerator sellers (Runpod, Verda, Hyperstack): Normal breadth, median 1.736", () => {
    expect(sellers(r)).toEqual(["datacrunch", "hyperstack", "runpod"]);
    expect(r.regional[0]).toMatchObject({ outcome: "value", participantCount: 3, marketBreadth: "normal" });
    expect(r.regional[0]!.priceLevel).toBeCloseTo(1.736);
  });
  it("Lambda, Denvr and Azure are whole nodes for this instrument; Massed Compute lacks a contracting entity; the 40 GB class fails identity", () => {
    expect(exclusionsBySeller(r, "lambda")).toContain("WHOLE_NODE_REQUIRED");
    expect(exclusionsBySeller(r, "denvr")).toContain("WHOLE_NODE_REQUIRED");
    expect(exclusionsBySeller(r, "azure")).toContain("WHOLE_NODE_REQUIRED");
    expect(exclusionsBySeller(r, "massedcompute")).toEqual(["SELLER_LEGAL_IDENTITY_UNRESOLVED"]);
    const forty = candidate("UCPI-A100-SXM4-80GB-LISTED", A100_40, POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
    expect(forty.eligible).toHaveLength(0);
    expect(forty.assessments.every((a) => a.exclusions.includes("WRONG_HARDWARE"))).toBe(true);
  });
});

describe("RTX 5090", () => {
  const r = candidate("UCPI-RTX-5090-LISTED", PAYLOADS["UCPI-RTX-5090-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
  it("one legal full-device seller (Runpod): Unavailable, SINGLE_PARTICIPANT, no price", () => {
    expect(sellers(r)).toEqual(["runpod"]);
    expect(r.regional[0]).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT", priceLevel: null, participantCount: 1 });
    expect(exclusionsBySeller(r, "vast")).toContain("WRONG_SERVICE_PRODUCT");
  });
});

describe("the seller-refusal rule", () => {
  // Runpod refused Urdais the intended use in writing on 14 September 2026. Its listed price
  // still arrives through Price of Compute, whose own terms permit collection and data use.
  // The rule is that the aggregator's grant cannot supply what the seller withheld about its
  // own price, so the seller is excluded by every route.
  const before = candidate("UCPI-H100-SXM-LISTED", PAYLOADS["UCPI-H100-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
  const after = candidate("UCPI-H100-SXM-LISTED", PAYLOADS["UCPI-H100-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_15);

  it("admitted Runpod under the 14 September snapshot, and excludes it under the 15 September one", () => {
    expect(sellers(before)).toContain("runpod");
    expect(sellers(after)).not.toContain("runpod");
    expect(exclusionsBySeller(after, "runpod")).toContain("SELLER_USE_REFUSED");
    // Nothing else moved: the refusal is the only difference between the snapshots.
    expect(sellers(after)).toEqual(sellers(before).filter((x) => x !== "runpod"));
  });

  it("reproduces the first candidate under the snapshot it was interpreted under, and moves the value under the production one", () => {
    // The 14 September candidate was computed under the H100-only snapshot, before DataCrunch's
    // legal identity and topology were evidenced: four sellers, median 3.74, Runpod pivotal.
    const h100Only = candidate("UCPI-H100-SXM-LISTED", PAYLOADS["UCPI-H100-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14);
    expect(sellers(h100Only)).toEqual(["hyperstack", "lambda", "runpod", "voltagepark"]);
    expect(h100Only.regional[0]).toMatchObject({ outcome: "value", participantCount: 4 });
    expect(h100Only.regional[0]!.priceLevel).toBeCloseTo(3.74, 6);

    // The production snapshot evidences DataCrunch too, so the like-for-like comparison of the
    // refusal is against five sellers, not four.
    expect(before.regional[0]).toMatchObject({ outcome: "value", participantCount: 5 });
    expect(before.regional[0]!.priceLevel).toBeCloseTo(3.49, 6);

    // Excluding Runpod costs one participant and moves the value. Four sellers still constitute
    // a market under the structural rule, so the child continues to publish at Normal breadth.
    expect(after.regional[0]).toMatchObject({ outcome: "value", participantCount: 4, marketBreadth: "normal" });
    expect(after.regional[0]!.priceLevel).toBeCloseTo(3.62, 2);
    expect(after.regional[0]!.priceLevel).not.toBeCloseTo(before.regional[0]!.priceLevel!, 6);
  });

  it("the frozen 14 September snapshot is not edited by the rule, so the first candidate stays reproducible", () => {
    expect(POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY.find((e) => e.slug === "runpod")?.useRefused ?? null).toBeNull();
    expect(POC_SELLER_EVIDENCE_2026_09_15.find((e) => e.slug === "runpod")?.useRefused).toContain("2026-09-14");
  });

  it("a refused seller is excluded even where every other requirement is satisfied", () => {
    // Runpod's on-demand H100 row satisfies identity, topology, tenancy and legal identity;
    // it fails only the refusal, which is the whole point of a separate reason code.
    const ex = exclusionsBySeller(after, "runpod");
    expect(ex).toEqual(["SELLER_USE_REFUSED"]);
  });
});

describe("family read model", () => {
  it("lists every listed instrument, with a public point where a calculation exists and an explicit no-calculation state otherwise, never a placeholder price", async () => {
    const persistence = new InMemoryPersistence();

    // B200: a production run that was actually released. This is the only shape that
    // produces a public point.
    const b200 = candidate("UCPI-B200-LISTED", PAYLOADS["UCPI-B200-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY).regional[0]!;
    await persistence.insertRegionalObservation({ ...b200, id: "ro-b200", runId: "run-1", runKind: "production", calculatedAt: "2026-09-15T00:01:00Z", supersededById: null });
    await persistence.insertPublication({ id: "pub-b200", regionalObservationId: "ro-b200", publishedAt: "2026-09-15T00:02:00Z", publicationStatus: "published", publisherIdentity: "test" });

    // H200: calculated, never published. A simulation is the clearest case, and the
    // persistence layer refuses to publish one at all -- so if the read model showed it,
    // it would be showing a price that by construction can never be released.
    const h200 = candidate("UCPI-H200-SXM-LISTED", PAYLOADS["UCPI-H200-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY).regional[0]!;
    await persistence.insertRegionalObservation({ ...h200, id: "ro-h200", runId: "run-2", runKind: "simulation", calculatedAt: "2026-09-15T00:01:00Z", supersededById: null });
    expect(h200.outcome, "the H200 fixture must carry a price, or this proves nothing").toBe("value");
    await expect(persistence.insertPublication({ id: "pub-h200", regionalObservationId: "ro-h200", publishedAt: "2026-09-15T00:02:00Z", publicationStatus: "published", publisherIdentity: "test" })).rejects.toThrow(/simulation/);

    const rows = await listListedMarkets(persistence);
    expect(rows.map((r) => r.symbol)).toEqual(LISTED_GPU_INSTRUMENTS.map((i) => i.symbol));

    const listed = rows.find((r) => r.symbol === "UCPI-B200-LISTED")!;
    expect(listed.status).toBe("published");
    expect(listed.latest).toMatchObject({ priceLevel: 6.79, observationType: "listed", procurementMode: "on_demand", gpu: { label: "B200" }, displayName: "UCPI B200 Listed" });
    expect(Object.keys(listed.latest!).sort()).toEqual([...PUBLIC_SERIES_POINT_KEYS].sort());
    expect(validatePublicResponseShape(JSON.parse(JSON.stringify(listed.latest)))).toEqual([]);

    // The unpublished calculation is not a point, and carries no price onto the surface.
    const unpublished = rows.find((r) => r.symbol === "UCPI-H200-SXM-LISTED")!;
    expect(unpublished.status).toBe("no_calculation");
    expect(unpublished.latest).toBeNull();

    for (const r of rows.filter((x) => x.symbol !== "UCPI-B200-LISTED")) {
      expect(r.status).toBe("no_calculation");
      expect(r.latest).toBeNull();
    }
  });

  it("the H100 point carries the family presentation fields and no constituent", () => {
    const r = candidate("UCPI-H100-SXM-LISTED", PAYLOADS["UCPI-H100-SXM-LISTED"], POC_SELLER_EVIDENCE_2026_09_14);
    const point = toSeriesPoint(r.regional[0]!, { calculatedAt: "2026-09-15T00:01:00Z", publishedAt: null });
    expect(point).toMatchObject({ displayName: "UCPI H100 SXM Listed", gpu: { model: "H100", formFactor: "SXM", memoryGb: 80, label: "H100 SXM" }, observationType: "listed" });
    expect(validatePublicResponseShape(JSON.parse(JSON.stringify(point)))).toEqual([]);
  });
});

describe("malformed payloads", () => {
  it("a provider row missing its price is rejected by schema validation before any observation exists", () => {
    const bad = { ...PAYLOADS["UCPI-B200-LISTED"], providers: [{ provider: "runpod", pricing_type: "on_demand", region: null, observed_at: "2026-09-14T01:00:00Z" }] };
    expect(() => validatePocPrices(bad)).toThrow();
  });
  it("an unsupported vendor SKU produces observations that fail identity, never a participant", () => {
    const strange = { ...PAYLOADS["UCPI-B200-LISTED"], sku: "GB200-NVL72" };
    const r = candidate("UCPI-B200-LISTED", strange, POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY);
    expect(r.eligible).toHaveLength(0);
    expect(r.assessments.every((a) => a.exclusions.includes("WRONG_HARDWARE") || a.exclusions.includes("HARDWARE_VARIANT_UNRESOLVED"))).toBe(true);
    const ctx = { calculationDate: "2026-09-14", registry: new Map([[PRICE_OF_COMPUTE_SLUG, permitted(PRICE_OF_COMPUTE_SLUG)]]), entities: entitiesFor(POC_SELLER_EVIDENCE_2026_09_14_GPU_FAMILY).map, spec: "listed" as const, identity: listedInstrument("UCPI-B200-LISTED")!.identity };
    expect(assessEligibility(r.observations[0]!, ctx).p0).toBe(false);
  });
});
