/**
 * The Price of Compute source against the saved 2026-09-14 payload: parsing,
 * normalization, the LISTED sibling's eligibility outcomes for every row, the
 * candidate value, and the child's refusal of the same observations.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { LISTED_SCOPE_KEY } from "@/lib/ucpi/aggregation";
import { identifyPocSku, mapPocPricingType, PRICE_OF_COMPUTE_ATTRIBUTION, PRICE_OF_COMPUTE_SLUG, priceOfComputeAdapter } from "@/lib/ucpi/adapters/price-of-compute";
import { POC_SELLER_EVIDENCE_2026_09_14, pocSellerProfiles } from "@/lib/ucpi/adapters/price-of-compute-profiles";
import { toSeriesPoint, validatePublicResponseShape } from "@/lib/ucpi/api-contract";
import { runPipeline } from "@/lib/ucpi/collector";
import type { MarketEntity, Retrieval } from "@/lib/ucpi/domain";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import { normalizationContext, permitted, REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { validatePocPrices } from "@/lib/ucpi/runtime/schema-validation";

const PAYLOAD = validatePocPrices(JSON.parse(readFileSync(path.join(process.cwd(), "docs/research/price-of-compute/api_v1_prices_h100-sxm.json"), "utf8")));

const ENTITY_IDS = new Map(POC_SELLER_EVIDENCE_2026_09_14.map((e) => [e.slug, `ent-${e.slug}`]));
// The frozen snapshot of the first candidate: H100 SXM topology only, Verda unevidenced.
const PROFILES = pocSellerProfiles(ENTITY_IDS, POC_SELLER_EVIDENCE_2026_09_14);
const ENTITIES: MarketEntity[] = [...ENTITY_IDS].map(([slug, id]) => ({ id, slug, name: slug, legalName: PROFILES.get(slug)?.legalNameEvidenced ? `${slug} legal` : null, legalIdentifier: null, controllingEntityId: null, useRefusedEvidence: PROFILES.get(slug)?.useRefused ?? null }));
const ENTITY_MAP: ReadonlyMap<string, MarketEntity> = new Map(ENTITIES.map((e) => [e.id, e]));
const LISTED_VERSIONS = { methodologyVersion: "0.1.2-draft", instrumentSpecVersion: "0.1.1-draft", instrument: "UCPI-H100-SXM-LISTED" };
const REGISTRY = [...REGISTRY_TODAY, permitted(PRICE_OF_COMPUTE_SLUG)];

const retrieval: Retrieval = {
  id: "ret-poc-1",
  sourceInterfaceSlug: PRICE_OF_COMPUTE_SLUG,
  requestedAt: "2026-09-14T00:44:35Z",
  completedAt: "2026-09-14T00:44:35Z",
  responseStatus: 200,
  request: priceOfComputeAdapter.buildRequest({ baseUrl: "https://priceofcompute.com", sku: "h100-sxm" }),
  enumerationAssessment: "complete",
  retrievalPurpose: "production",
  permissionGrantId: "grant-poc",
};

function normalizeAll() {
  const ctx = normalizationContext({ ...LISTED_VERSIONS, sellerProfiles: PROFILES, entities: ENTITY_MAP });
  const raws = priceOfComputeAdapter.parse(retrieval, PAYLOAD, PROFILES);
  return { raws, observations: raws.map((r) => priceOfComputeAdapter.normalize(r, retrieval, ctx)) };
}

describe("Price of Compute request and payload", () => {
  it("builds the documented keyless request for the SKU and asks for no header", () => {
    const req = priceOfComputeAdapter.buildRequest({ baseUrl: "https://priceofcompute.com/", sku: "h100-sxm" });
    expect(req).toMatchObject({ method: "GET", url: "https://priceofcompute.com/api/v1/prices/h100-sxm", requiredHeaders: [] });
  });

  it("the saved payload is the H100 SXM day 2026-09-13 with 16 provider rows, 11 on-demand, and carries the attribution in-band", () => {
    expect(PAYLOAD.sku).toBe("H100-SXM");
    expect(PAYLOAD.day).toBe("2026-09-13");
    expect(PAYLOAD.providers).toHaveLength(16);
    expect(PAYLOAD.providers.filter((p) => p.pricing_type === "on_demand")).toHaveLength(11);
    expect(PAYLOAD.attribution).toBe(PRICE_OF_COMPUTE_ATTRIBUTION);
    expect(PAYLOAD.providers.filter((p) => p.region === null)).toHaveLength(12);
  });

  it("one raw offer per provider row, keeping the vendor's observation time as source-effective and Urdais's as observed", () => {
    const { raws } = normalizeAll();
    expect(raws).toHaveLength(16);
    expect(raws.every((r) => r.observedAt === "2026-09-14T00:44:35Z")).toBe(true);
    expect(raws.every((r) => r.sourceEffectiveAt !== null && r.sourceEffectiveAt !== r.observedAt)).toBe(true);
    expect(raws.every((r) => r.nativeAvailabilityValue === null && r.nativeTenancyFields === null)).toBe(true);
  });

  it("maps pricing types without blending and reads identity from the canonical SKU at Grade C", () => {
    expect(mapPocPricingType("on_demand")).toBe("on_demand");
    expect(mapPocPricingType("spot")).toBe("interruptible");
    expect(mapPocPricingType("community")).toBe("interruptible");
    expect(mapPocPricingType("serverless")).toBe("unknown");
    expect(identifyPocSku("H100-SXM")).toMatchObject({ grade: "C", model: "H100", formFactor: "SXM", memoryGb: 80, fullDevice: true });
    expect(identifyPocSku("H100-PCIE").formFactor).toBe("PCIe");
    expect(identifyPocSku("H100").grade).toBe("insufficient");
  });
});

describe("normalization: nothing invented", () => {
  const { observations } = normalizeAll();

  it("every observation is a Grade 5 listed price with unknown availability, grade-6 source, unresolved tax basis and the attribution", () => {
    expect(observations.every((o) => o.observationType === "indicative_or_list_price" && o.availabilityEvidenceGrade === 5 && o.availabilityState === "unknown")).toBe(true);
    expect(observations.every((o) => o.sourceQualityGrade === 6 && o.taxBasis === "unresolved" && o.sourceAttribution === PRICE_OF_COMPUTE_ATTRIBUTION)).toBe(true);
  });

  it("no observation is placed in a country: the region field is null for most rows and no mapping exists for the rest", () => {
    expect(observations.every((o) => o.canonicalRegionCode === null)).toBe(true);
  });

  it("topology comes from Urdais seller evidence, not the vendor: node-only sellers are whole_node, unresearched sellers unknown", () => {
    const by = (slug: string, type = "on_demand") => observations.find((o) => o.sellerEntityId === `ent-${slug}` && o.procurementMode === mapPocPricingType(type))!;
    expect(by("voltagepark")).toMatchObject({ topologyClass: "per_accelerator_allocation", minimumGpuCount: 1, wholeNodeRequired: false });
    expect(by("coreweave")).toMatchObject({ topologyClass: "whole_node", minimumGpuCount: 8, wholeNodeRequired: true });
    expect(by("azure")).toMatchObject({ topologyClass: "whole_node", wholeNodeRequired: true });
    expect(by("massedcompute")).toMatchObject({ topologyClass: "unknown", minimumGpuCount: null, wholeNodeRequired: null });
  });

  it("the marketplace row is an aggregate, not a seller: service product other with the marketplace entity set", () => {
    const vast = observations.filter((o) => o.sellerEntityId === "ent-vast");
    expect(vast.length).toBeGreaterThan(0);
    expect(vast.every((o) => o.serviceProduct === "other" && o.marketplaceEntityId === "ent-vast")).toBe(true);
  });

  it("tenancy is never labelled documented without Urdais evidence; Lambda stays ambiguous", () => {
    const grades = new Map(observations.filter((o) => o.procurementMode === "on_demand").map((o) => [o.sellerEntityId, o.tenancyGrade]));
    expect(grades.get("ent-hyperstack")).toBe("unknown");
    expect(grades.get("ent-lambda")).toBe("ambiguous");
    expect(grades.get("ent-runpod")).toBe("documented");
  });

  it("an unknown provider slug becomes an unmapped pseudo-seller that can never participate", () => {
    const ctx = normalizationContext({ ...LISTED_VERSIONS, sellerProfiles: PROFILES, entities: ENTITY_MAP });
    const stranger = { ...PAYLOAD, providers: [{ provider: "newcloud", pricing_type: "on_demand", usd_per_gpu_hr: 1.5, region: null, observed_at: "2026-09-13T20:00:00Z" }] };
    const [raw] = priceOfComputeAdapter.parse(retrieval, stranger, PROFILES);
    const obs = priceOfComputeAdapter.normalize(raw!, retrieval, ctx);
    expect(obs.sellerEntityId).toBe("unmapped:newcloud");
    const a = assessEligibility(obs, { calculationDate: "2026-09-14", entities: ENTITY_MAP, registry: new Map([[PRICE_OF_COMPUTE_SLUG, permitted(PRICE_OF_COMPUTE_SLUG)]]), spec: "listed" });
    expect(a.p2).toBe(false);
    expect(a.exclusions).toContain("SOURCE_INSUFFICIENT");
  });
});

describe("UCPI-H100-SXM-LISTED eligibility, row by row", () => {
  const { observations } = normalizeAll();
  const registry = new Map([[PRICE_OF_COMPUTE_SLUG, permitted(PRICE_OF_COMPUTE_SLUG)]]);
  const assess = (slug: string, type: string) => {
    const o = observations.find((x) => x.sellerEntityId === `ent-${slug}` && x.serviceTier?.tier_label === type)!;
    return assessEligibility(o, { calculationDate: "2026-09-14", entities: ENTITY_MAP, registry, spec: "listed" });
  };

  it.each(["voltagepark", "runpod", "hyperstack", "lambda"])("%s on-demand is eligible without any availability, tenancy or geography gate", (slug) => {
    const a = assess(slug, "on_demand");
    expect(a.exclusions).toEqual([]);
    expect(a.p2).toBe(true);
  });

  it.each(["coreweave", "azure"])("%s on-demand is excluded as WHOLE_NODE_REQUIRED, not divided into a per-accelerator price", (slug) => {
    expect(assess(slug, "on_demand").exclusions).toContain("WHOLE_NODE_REQUIRED");
  });

  it.each(["massedcompute", "datacrunch", "denvr"])("%s on-demand is excluded under the frozen snapshot: no per-instrument topology and no evidenced contracting entity", (slug) => {
    const a = assess(slug, "on_demand");
    expect(a.p2).toBe(false);
    expect(a.exclusions).toEqual(expect.arrayContaining(["MINIMUM_TOPOLOGY_UNKNOWN", "SELLER_LEGAL_IDENTITY_UNRESOLVED"]));
  });

  it("Nebius is excluded as SELLER_LEGAL_IDENTITY_UNRESOLVED: no single contracting entity stands behind the listed price", () => {
    const a = assess("nebius", "on_demand");
    expect(a.p2).toBe(false);
    expect(a.exclusions).toEqual(["SELLER_LEGAL_IDENTITY_UNRESOLVED"]);
  });

  it("the Vast platform figure is excluded as a service-product mismatch", () => {
    expect(assess("vast", "on_demand").exclusions).toContain("WRONG_SERVICE_PRODUCT");
  });

  it.each([
    ["datacrunch", "spot"],
    ["azure", "spot"],
    ["coreweave", "spot"],
    ["vast", "spot"],
    ["runpod", "community"],
  ])("%s %s is excluded as a procurement-mode mismatch", (slug, type) => {
    expect(assess(slug, type).exclusions).toContain("WRONG_PROCUREMENT_MODE");
  });

  it("the same observations are refused by the accessible child on its own terms", () => {
    const o = observations.find((x) => x.sellerEntityId === "ent-voltagepark")!;
    const a = assessEligibility(o, { calculationDate: "2026-09-14", entities: ENTITY_MAP, registry, spec: "accessible" });
    expect(a.p2).toBe(false);
    // The child wants a current accessible offer in a country from a tenancy-resolved seller; the listed price is none of those.
    expect(a.exclusions).toEqual(expect.arrayContaining(["TENANCY_UNRESOLVED", "REGION_UNRESOLVED", "AVAILABILITY_UNKNOWN", "AVAILABILITY_EVIDENCE_INSUFFICIENT", "SOURCE_INSUFFICIENT"]));
  });

  it("a source that is not permitted produces no eligible observation whatever the payload says", () => {
    const blocked = new Map([[PRICE_OF_COMPUTE_SLUG, { ...permitted(PRICE_OF_COMPUTE_SLUG), productionAccessState: "production_blocked" as const }]]);
    const o = observations.find((x) => x.sellerEntityId === "ent-voltagepark")!;
    expect(assessEligibility(o, { calculationDate: "2026-09-14", entities: ENTITY_MAP, registry: blocked, spec: "listed" }).p2).toBe(false);
  });
});

describe("the first candidate print", () => {
  const { observations } = normalizeAll();
  const result = runPipeline({
    ...LISTED_VERSIONS,
    calculationDate: "2026-09-14",
    observations,
    retrievals: [retrieval],
    entities: ENTITIES,
    registry: REGISTRY,
    spec: "listed",
    regionScope: "listed_provider_wide",
  });

  it("four independent legal sellers survive and the even-N median is 3.74 at Normal breadth, through one technical source", () => {
    expect(result.sellerObservations.map((s) => s.sellerEntityId).sort()).toEqual(["ent-hyperstack", "ent-lambda", "ent-runpod", "ent-voltagepark"]);
    expect(result.sellerObservations.every((s) => s.canonicalRegionCode === LISTED_SCOPE_KEY)).toBe(true);
    expect(result.regional).toHaveLength(1);
    const r = result.regional[0]!;
    expect(r).toMatchObject({ outcome: "value", participantCount: 4, marketBreadth: "normal", contributingSourceCount: 1, largestSourceParticipantShare: 1, regionScope: "listed_provider_wide", canonicalRegionCode: LISTED_SCOPE_KEY });
    expect(r.priceLevel).toBeCloseTo((3.49 + 3.99) / 2);
    expect(r.sourceAttributions).toEqual([PRICE_OF_COMPUTE_ATTRIBUTION]);
    expect(r.dispersionPublished).toBe(true);
  });

  it("does not reproduce the vendor's own headline median", () => {
    expect(result.regional[0]!.priceLevel).not.toBe(PAYLOAD.prices.on_demand!.usd_per_gpu_hr);
  });

  it("each seller appears once: no double counting across pricing types or a later direct interface", () => {
    const ids = result.capacitySources.map((c) => c.capacitySourceEntityId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the public series point carries the scope, a null country and the attribution, and leaks no constituent", () => {
    const point = toSeriesPoint(result.regional[0]!, { calculatedAt: "2026-09-15T00:01:00Z", publishedAt: null });
    expect(point).toMatchObject({ regionScope: "listed_provider_wide", country: null, attributions: [PRICE_OF_COMPUTE_ATTRIBUTION] });
    expect(point.priceLevel).toBeCloseTo(3.74);
    expect(validatePublicResponseShape(JSON.parse(JSON.stringify(point)))).toEqual([]);
  });

  it("with only two per-accelerator sellers evidenced the print is Minimum breadth with dispersion withheld; with one it is Unavailable", () => {
    const two = pocSellerProfiles(ENTITY_IDS, POC_SELLER_EVIDENCE_2026_09_14.filter((e) => e.slug !== "runpod" && e.slug !== "lambda" && e.slug !== "nebius"));
    const ctx = normalizationContext({ ...LISTED_VERSIONS, sellerProfiles: two, entities: ENTITY_MAP });
    const obs = priceOfComputeAdapter.parse(retrieval, PAYLOAD, two).map((r) => priceOfComputeAdapter.normalize(r, retrieval, ctx));
    const r2 = runPipeline({ ...LISTED_VERSIONS, calculationDate: "2026-09-14", observations: obs, retrievals: [retrieval], entities: ENTITIES, registry: REGISTRY, spec: "listed", regionScope: "listed_provider_wide" }).regional[0]!;
    expect(r2).toMatchObject({ outcome: "value", participantCount: 2, marketBreadth: "minimum", dispersionPublished: false });
    expect(r2.priceLevel).toBeCloseTo((1.99 + 3.99) / 2);
    const one = pocSellerProfiles(ENTITY_IDS, POC_SELLER_EVIDENCE_2026_09_14.filter((e) => e.slug === "voltagepark"));
    const ctx1 = normalizationContext({ ...LISTED_VERSIONS, sellerProfiles: one, entities: ENTITY_MAP });
    const obs1 = priceOfComputeAdapter.parse(retrieval, PAYLOAD, one).map((r) => priceOfComputeAdapter.normalize(r, retrieval, ctx1));
    const r1 = runPipeline({ ...LISTED_VERSIONS, calculationDate: "2026-09-14", observations: obs1, retrievals: [retrieval], entities: ENTITIES, registry: REGISTRY, spec: "listed", regionScope: "listed_provider_wide" }).regional[0]!;
    expect(r1).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT" });
  });
});
