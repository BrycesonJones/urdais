import { describe, expect, it } from "vitest";

import { identifyLambdaInstance, lambdaAdapter } from "@/lib/ucpi/adapters/lambda";
import { identifyRunpodGpu, mapRunpodAvailability, runpodAdapter, RUNPOD_H100_SXM_GPU_TYPE_ID } from "@/lib/ucpi/adapters/runpod";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import {
  LAMBDA_INSTANCE_TYPES_FIXTURE,
  LAMBDA_REGIONS,
  LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC,
  makeRetrieval,
  normalizationContext,
  permitted,
  RUNPOD_CATALOG_FIXTURE,
  RUNPOD_DETAILS_FIXTURE,
  ENTITY_MAP,
} from "@/lib/ucpi/fixtures";

const D = "2026-09-13";

describe("Runpod adapter", () => {
  const request = runpodAdapter.buildRequest({ baseUrl: "https://example.invalid", countryCode: "US", cloud: "COMMUNITY" });
  const retrieval = makeRetrieval({ id: "rp-1", slug: "runpod-gpu-types", completedAt: "2026-09-13T10:00:01Z", request });

  it("builds the documented request without any secret in it", () => {
    expect(request.url).toBe("https://example.invalid/v2/catalog/gpus");
    expect(request.parameters).toEqual({ include: "AVAILABILITY", product: "POD", count: "1", cloud: "COMMUNITY", countryCodes: "US" });
    expect(request.requiredHeaders).toEqual(["Authorization"]);
    expect(JSON.stringify(request)).not.toMatch(/key|token|secret/i);
  });

  it("parses one raw offer per GPU type per datacenter for the requested cloud, keeping the payload", () => {
    const raws = runpodAdapter.parse(retrieval, RUNPOD_CATALOG_FIXTURE, RUNPOD_DETAILS_FIXTURE);
    expect(raws).toHaveLength(3);
    const sxm = raws.filter((r) => r.sourceNativeProductId === RUNPOD_H100_SXM_GPU_TYPE_ID);
    expect(sxm.map((r) => r.nativeRegion)).toEqual(["US-KS-2", "US-GA-1"]);
    expect(sxm[0]!.nativePrice).toBe(2.69);
    expect(sxm[0]!.nativeServiceTier).toBe("COMMUNITY");
    expect(sxm[0]!.nativeMinimumGpuCount).toBe(1);
    expect(sxm[0]!.rawPayload).toMatchObject({ cloud: "COMMUNITY" });
  });

  it("normalizes the H100 SXM type to a Grade A, Documented, Grade-3, per-accelerator observation in the filtered country", () => {
    const raws = runpodAdapter.parse(retrieval, RUNPOD_CATALOG_FIXTURE, RUNPOD_DETAILS_FIXTURE);
    const obs = runpodAdapter.normalize(raws[0]!, retrieval, normalizationContext());
    expect(obs).toMatchObject({
      gpuVendor: "NVIDIA",
      gpuModel: "H100",
      formFactor: "SXM",
      gpuMemoryGb: 80,
      hardwareIdentityGrade: "A",
      tenancyGrade: "documented",
      availabilityState: "available",
      availabilityEvidenceGrade: 3,
      canonicalRegionCode: "US",
      topologyClass: "per_accelerator_allocation",
      minimumGpuCount: 1,
      procurementMode: "on_demand",
      preemptible: false,
      taxBasis: "exclusive",
      normalizedPrice: 2.69,
      hostMemoryGbPerAccelerator: 125,
    });
    expect(obs.serviceTier).toMatchObject({ tier_label: "COMMUNITY", operator_class: "community_host" });
    const a = assessEligibility(obs, { calculationDate: D, entities: ENTITY_MAP, registry: new Map([["runpod-gpu-types", permitted("runpod-gpu-types")]]) });
    expect(a.p2).toBe(true);
    expect(a.diagnostics).toEqual(expect.arrayContaining(["OPERATOR_UNDETERMINED", "AVAILABILITY_GRADE_3", "SOURCE_EFFECTIVE_TIME_ABSENT"]));
  });

  it("maps LOW to Limited, which the child admits, and NONE to Sold out", () => {
    const raws = runpodAdapter.parse(retrieval, RUNPOD_CATALOG_FIXTURE, RUNPOD_DETAILS_FIXTURE);
    const georgia = runpodAdapter.normalize(raws[1]!, retrieval, normalizationContext());
    expect(georgia.availabilityState).toBe("limited");
    expect(mapRunpodAvailability("NONE")).toBe("sold_out");
    expect(mapRunpodAvailability("MEDIUM")).toBe("available");
    expect(mapRunpodAvailability(null)).toBe("unknown");
  });

  it("excludes the PCIe variant as a different instrument", () => {
    const raws = runpodAdapter.parse(retrieval, RUNPOD_CATALOG_FIXTURE, RUNPOD_DETAILS_FIXTURE);
    const pcie = runpodAdapter.normalize(raws[2]!, retrieval, normalizationContext());
    expect(pcie.formFactor).toBe("PCIe");
    const a = assessEligibility(pcie, { calculationDate: D, entities: ENTITY_MAP, registry: new Map([["runpod-gpu-types", permitted("runpod-gpu-types")]]) });
    expect(a.p0).toBe(false);
    expect(a.exclusions).toContain("WRONG_HARDWARE");
  });

  it("never maps a country from the identifier prefix: without a filter or mapping the region is unresolved", () => {
    const unfiltered = runpodAdapter.buildRequest({ baseUrl: "https://example.invalid", countryCode: "US,CA", cloud: "SECURE" });
    const r = makeRetrieval({ id: "rp-2", slug: "runpod-gpu-types", completedAt: "2026-09-13T10:00:01Z", request: unfiltered });
    const raws = runpodAdapter.parse(r, { gpus: [{ ...RUNPOD_CATALOG_FIXTURE.gpus[0]!, dataCenters: [{ id: "EU-RO-1", name: "EU Romania 1", availability: "HIGH" }] }] }, RUNPOD_DETAILS_FIXTURE);
    const obs = runpodAdapter.normalize(raws[0]!, r, normalizationContext());
    expect(obs.canonicalRegionCode).toBeNull();
  });

  it("identifies form factor from the display name, not the id alone", () => {
    expect(identifyRunpodGpu(RUNPOD_H100_SXM_GPU_TYPE_ID, "H100 SXM", 81920)).toMatchObject({ grade: "A", formFactor: "SXM", model: "H100" });
    expect(identifyRunpodGpu("NVIDIA H100 NVL", "H100 NVL", 96256)).toMatchObject({ formFactor: "NVL" });
    expect(identifyRunpodGpu("NVIDIA GeForce RTX 4090", "RTX 4090", 24576)).toMatchObject({ grade: "insufficient", model: "GeForce RTX 4090" });
  });
});

describe("Lambda adapter", () => {
  const request = lambdaAdapter.buildRequest({ baseUrl: "https://example.invalid" });
  const retrieval = makeRetrieval({ id: "lb-1", slug: "lambda-instance-types", completedAt: "2026-09-13T10:00:02Z", request });
  const raws = lambdaAdapter.parse(retrieval, LAMBDA_INSTANCE_TYPES_FIXTURE, LAMBDA_REGIONS);

  it("builds the documented request", () => {
    expect(request.url).toBe("https://example.invalid/api/v1/instance-types");
    expect(request.requiredHeaders).toEqual(["Authorization"]);
  });

  it("emits one raw offer per instance type per known region, expressing absence as well as presence", () => {
    expect(raws).toHaveLength(5 * LAMBDA_REGIONS.length);
    const oneX = raws.filter((r) => r.sourceNativeProductId === "gpu_1x_h100_sxm5");
    expect(oneX.filter((r) => r.nativeAvailabilityValue === "listed_in_regions_with_capacity_available").map((r) => r.nativeRegion)).toEqual(["us-east-1", "us-west-1"]);
    expect(oneX.find((r) => r.nativeRegion === "europe-central-1")!.nativeAvailabilityValue).toBe("absent_from_regions_with_capacity_available");
  });

  it("normalizes the 1x type to $4.29 per accelerator-hour, Grade A, in the mapped country, and the 8x type to $3.99", () => {
    const ctx = normalizationContext();
    const oneX = lambdaAdapter.normalize(raws.find((r) => r.sourceNativeProductId === "gpu_1x_h100_sxm5" && r.nativeRegion === "us-west-1")!, retrieval, ctx);
    expect(oneX).toMatchObject({ normalizedPrice: 4.29, gpuCount: 1, minimumGpuCount: 1, canonicalRegionCode: "US", hardwareIdentityGrade: "A", formFactor: "SXM", gpuMemoryGb: 80, availabilityState: "available", taxBasis: "exclusive" });
    expect(oneX.hostMemoryGbPerAccelerator).toBeCloseTo(225 * 1.073741824, 2);
    const eightX = lambdaAdapter.normalize(raws.find((r) => r.sourceNativeProductId === "gpu_8x_h100_sxm5" && r.nativeRegion === "us-west-1")!, retrieval, ctx);
    expect(eightX.normalizedPrice).toBeCloseTo(3.99, 10);
    expect(eightX.gpuCount).toBe(8);
    expect(eightX.topologyClass).toBe("per_accelerator_allocation");
  });

  it("is Ambiguous on tenancy by default and therefore excluded with TENANCY_UNRESOLVED, even when everything else qualifies", () => {
    const obs = lambdaAdapter.normalize(raws.find((r) => r.sourceNativeProductId === "gpu_1x_h100_sxm5" && r.nativeRegion === "us-west-1")!, retrieval, normalizationContext());
    expect(obs.tenancyGrade).toBe("ambiguous");
    const a = assessEligibility(obs, { calculationDate: D, entities: ENTITY_MAP, registry: new Map([["lambda-instance-types", permitted("lambda-instance-types")]]) });
    expect(a.p0).toBe(true);
    expect(a.p1).toBe(false);
    expect(a.exclusions).toEqual(["TENANCY_UNRESOLVED"]);
  });

  it("becomes eligible only when a tenancy statement is supplied as evidence", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const obs = lambdaAdapter.normalize(raws.find((r) => r.sourceNativeProductId === "gpu_1x_h100_sxm5" && r.nativeRegion === "us-west-1")!, retrieval, ctx);
    expect(obs.tenancyGrade).toBe("documented");
    const a = assessEligibility(obs, { calculationDate: D, entities: ENTITY_MAP, registry: new Map([["lambda-instance-types", permitted("lambda-instance-types")]]) });
    expect(a.p2).toBe(true);
  });

  it("marks a region absent from the capacity list as Sold out and therefore UNAVAILABLE", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const obs = lambdaAdapter.normalize(raws.find((r) => r.sourceNativeProductId === "gpu_1x_h100_sxm5" && r.nativeRegion === "europe-central-1")!, retrieval, ctx);
    expect(obs).toMatchObject({ availabilityState: "sold_out", canonicalRegionCode: "DE", observationType: "advertised_non_accessible_price" });
    const a = assessEligibility(obs, { calculationDate: D, entities: ENTITY_MAP, registry: new Map([["lambda-instance-types", permitted("lambda-instance-types")]]) });
    expect(a.exclusions).toContain("UNAVAILABLE");
  });

  it("excludes the GH200 type as wrong hardware", () => {
    const obs = lambdaAdapter.normalize(raws.find((r) => r.sourceNativeProductId === "gpu_1x_gh200")!, retrieval, normalizationContext());
    expect(identifyLambdaInstance("1x GH200 (96 GB)", "GH200 (96 GB)").model).toBe("GH200");
    const a = assessEligibility(obs, { calculationDate: D, entities: ENTITY_MAP, registry: new Map([["lambda-instance-types", permitted("lambda-instance-types")]]) });
    expect(a.exclusions).toContain("WRONG_HARDWARE");
  });
});
