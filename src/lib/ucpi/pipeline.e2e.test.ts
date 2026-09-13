/**
 * Fixture-based end-to-end simulation:
 * Runpod fixture + Lambda fixture -> raw -> normalized -> eligibility
 * -> seller reduction -> capacity-source collapse -> regional UCPI.
 * Every number is synthetic. No provider is contacted and nothing is published.
 */
import { describe, expect, it } from "vitest";

import { lambdaAdapter } from "@/lib/ucpi/adapters/lambda";
import { runpodAdapter } from "@/lib/ucpi/adapters/runpod";
import { toSeriesPoint } from "@/lib/ucpi/api-contract";
import { runPipeline, type NormalizationContext, type PipelineInput } from "@/lib/ucpi/collector";
import type { NormalizedObservation, Retrieval } from "@/lib/ucpi/domain";
import {
  ENTITIES,
  eligibleObservation,
  LAMBDA_INSTANCE_TYPES_FIXTURE,
  LAMBDA_REGIONS,
  LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC,
  makeRetrieval,
  normalizationContext,
  permitted,
  REGISTRY_TODAY,
  RUNPOD_CATALOG_FIXTURE,
  RUNPOD_DETAILS_FIXTURE,
  VERSIONS,
} from "@/lib/ucpi/fixtures";
import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";

const D = "2026-09-13";

function collect(ctx: NormalizationContext, opts: { runpodCompletedAt?: string | null; lambdaCompletedAt?: string | null } = {}) {
  const retrievals: Retrieval[] = [];
  const observations: NormalizedObservation[] = [];

  for (const cloud of ["SECURE", "COMMUNITY"] as const) {
    const req = runpodAdapter.buildRequest({ baseUrl: "https://example.invalid", countryCode: "US", cloud });
    const r = makeRetrieval({ id: `rp-${cloud}`, slug: "runpod-gpu-types", completedAt: opts.runpodCompletedAt === undefined ? "2026-09-13T10:00:01Z" : opts.runpodCompletedAt, request: req });
    retrievals.push(r);
    if (r.completedAt !== null) {
      for (const raw of runpodAdapter.parse(r, RUNPOD_CATALOG_FIXTURE, RUNPOD_DETAILS_FIXTURE)) observations.push(runpodAdapter.normalize(raw, r, ctx));
    }
  }
  const lreq = lambdaAdapter.buildRequest({ baseUrl: "https://example.invalid" });
  const lr = makeRetrieval({ id: "lb", slug: "lambda-instance-types", completedAt: opts.lambdaCompletedAt === undefined ? "2026-09-13T10:00:02Z" : opts.lambdaCompletedAt, request: lreq });
  retrievals.push(lr);
  if (lr.completedAt !== null) {
    for (const raw of lambdaAdapter.parse(lr, LAMBDA_INSTANCE_TYPES_FIXTURE, LAMBDA_REGIONS)) observations.push(lambdaAdapter.normalize(raw, lr, ctx));
  }
  return { retrievals, observations };
}

function run(registry: readonly SourceRegistryState[], collected: ReturnType<typeof collect>, extra: Partial<PipelineInput> = {}) {
  return runPipeline({
    instrument: VERSIONS.instrument,
    calculationDate: D,
    methodologyVersion: VERSIONS.methodologyVersion,
    instrumentSpecVersion: VERSIONS.instrumentSpecVersion,
    observations: collected.observations,
    retrievals: collected.retrievals,
    entities: ENTITIES,
    registry,
    ...extra,
  });
}

const BOTH_PERMITTED_SYNTHETIC = [permitted("runpod-gpu-types"), permitted("lambda-instance-types")];
const us = (r: ReturnType<typeof run>) => r.regional.find((x) => x.canonicalRegionCode === "US")!;

describe("end-to-end simulation", () => {
  it("Scenario 0: with the registry as it stands today, nothing is eligible and every region is Unavailable", () => {
    const r = run(REGISTRY_TODAY, collect(normalizationContext()));
    expect(r.eligible).toHaveLength(0);
    expect(r.assessments.every((a) => a.exclusions.includes("COLLECTION_NOT_PERMITTED"))).toBe(true);
    expect(r.regional).toHaveLength(0);
  });

  it("Scenario A: Runpod eligible, Lambda tenancy unresolved -> Lambda excluded, N=1, Unavailable", () => {
    const r = run(BOTH_PERMITTED_SYNTHETIC, collect(normalizationContext()));
    const lambda = r.assessments.filter((a) => a.observationId.includes(":lb:") || a.observationId.startsWith("n:lb"));
    expect(lambda.length).toBeGreaterThan(0);
    expect(lambda.every((a) => a.exclusions.includes("TENANCY_UNRESOLVED") || a.exclusions.includes("WRONG_HARDWARE"))).toBe(true);
    expect(r.capacitySources.map((c) => c.capacitySourceEntityId)).toEqual(["ent-runpod"]);
    expect(us(r)).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT", participantCount: 1, priceLevel: null });
  });

  it("Scenario B: Runpod eligible + synthetic Lambda tenancy Documented -> N=2, Published, Minimum, midpoint", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const r = run(BOTH_PERMITTED_SYNTHETIC, collect(ctx));
    // Runpod: Secure 3.49 and Community 2.69 at 1x are one seller; the minimum at 1x is 2.69.
    // Lambda: 1x 4.29 wins over 2x/4x/8x by canonical quantity.
    expect(r.sellerObservations.filter((s) => s.canonicalRegionCode === "US").map((s) => [s.sellerEntityId, s.representativePrice])).toEqual([
      ["ent-lambda", 4.29],
      ["ent-runpod", 2.69],
    ]);
    const region = us(r);
    expect(region).toMatchObject({ outcome: "value", marketBreadth: "minimum", participantCount: 2, contributingSourceCount: 2, largestSourceParticipantShare: 0.5, dispersionPublished: false });
    expect(region.priceLevel).toBeCloseTo(3.49, 10);
    const point = toSeriesPoint(region, { calculatedAt: "2026-09-14T00:01:00Z", publishedAt: "2026-09-14T00:05:00Z" });
    expect(point).toMatchObject({ status: "published", marketBreadth: "minimum", participantCount: 2, dispersion: null, percentageChange1d: null, changeDisposition: "withheld" });
    expect(point.priceLevel).toBeCloseTo(3.49, 10);
    expect(JSON.stringify(point)).not.toMatch(/2\.69|4\.29|runpod|lambda/i);
  });

  it("Scenario C: one provider's availability stale -> that provider excluded, N=1, Unavailable", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const collected = collect(ctx);
    // Lambda's availability evidence was last re-observed yesterday.
    collected.observations = collected.observations.map((o) => (o.sourceInterfaceSlug === "lambda-instance-types" ? { ...o, availabilityObservedAt: "2026-09-12T22:00:00Z" } : o));
    const r = run(BOTH_PERMITTED_SYNTHETIC, collected);
    expect(r.assessments.filter((a) => a.exclusions.includes("AVAILABILITY_STALE")).length).toBeGreaterThan(0);
    expect(us(r)).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT", participantCount: 1 });
  });

  it("Scenario D: both fresh, one provider permission-blocked -> blocked provider excluded, N=1, Unavailable", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const registry = [permitted("lambda-instance-types"), REGISTRY_TODAY.find((s) => s.slug === "runpod-gpu-types")!];
    const r = run(registry, collect(ctx));
    expect(r.assessments.filter((a) => a.observationId.includes("rp-")).every((a) => a.exclusions.includes("COLLECTION_NOT_PERMITTED"))).toBe(true);
    expect(r.capacitySources.map((c) => c.capacitySourceEntityId)).toEqual(["ent-lambda"]);
    expect(us(r)).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT" });
  });

  it("Scenario E: three synthetic independent sellers -> Normal breadth, true median", () => {
    const observations = [
      eligibleObservation({ id: "c", sellerEntityId: "ent-c", sourceInterfaceSlug: "iface-c", retrievalId: "r-c", normalizedPrice: 2.5 }),
      eligibleObservation({ id: "d", sellerEntityId: "ent-d", sourceInterfaceSlug: "iface-d", retrievalId: "r-d", normalizedPrice: 3.4 }),
      eligibleObservation({ id: "e", sellerEntityId: "ent-lambda", sourceInterfaceSlug: "iface-e", retrievalId: "r-e", normalizedPrice: 9.0 }),
    ];
    const retrievals = ["r-c", "r-d", "r-e"].map((id, i) => makeRetrieval({ id, slug: `iface-${["c", "d", "e"][i]}`, completedAt: "2026-09-13T09:00:00Z", request: { method: "GET", url: "https://example.invalid", parameters: {}, requiredHeaders: [] } }));
    const r = run(["iface-c", "iface-d", "iface-e"].map(permitted), { observations, retrievals });
    expect(us(r)).toMatchObject({ outcome: "value", marketBreadth: "normal", priceLevel: 3.4, participantCount: 3, contributingSourceCount: 3, dispersionPublished: true });
    expect(us(r).dispersion).not.toBeNull();
    // Moving the extreme does not move the median.
    observations[2] = { ...observations[2]!, normalizedPrice: 90 };
    expect(us(run(["iface-c", "iface-d", "iface-e"].map(permitted), { observations, retrievals })).priceLevel).toBe(3.4);
  });

  it("Scenario F: two technical interfaces exposing the same legal seller -> one participant, Unavailable", () => {
    const observations = [
      eligibleObservation({ id: "x1", sellerEntityId: "ent-c", sourceInterfaceSlug: "iface-1", retrievalId: "r-1", normalizedPrice: 2.9 }),
      eligibleObservation({ id: "x2", sellerEntityId: "ent-c", sourceInterfaceSlug: "iface-2", retrievalId: "r-2", normalizedPrice: 3.1 }),
    ];
    const retrievals = ["r-1", "r-2"].map((id, i) => makeRetrieval({ id, slug: `iface-${i + 1}`, completedAt: "2026-09-13T09:00:00Z", request: { method: "GET", url: "https://example.invalid", parameters: {}, requiredHeaders: [] } }));
    const r = run(["iface-1", "iface-2"].map(permitted), { observations, retrievals });
    expect(r.sellerObservations).toHaveLength(1);
    expect(r.sellerObservations[0]).toMatchObject({ representativePrice: 2.9, consideredCount: 2, sourceInterfaceSlugs: ["iface-1", "iface-2"] });
    expect(r.capacitySources).toHaveLength(1);
    expect(r.capacitySources[0]!.sourceInterfaceCount).toBe(2);
    expect(us(r)).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT", participantCount: 1 });
  });

  it("Scenario G: a retrieval that completed after the cutoff belongs to the next date and is not used", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const r = run(BOTH_PERMITTED_SYNTHETIC, collect(ctx, { lambdaCompletedAt: "2026-09-14T00:00:00Z" }));
    expect(r.outsideWindow.length).toBeGreaterThan(0);
    expect(us(r)).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT" });
  });

  it("Scenario H: a source unreachable all day leaves its participant out", () => {
    const ctx = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });
    const r = run(BOTH_PERMITTED_SYNTHETIC, collect(ctx, { runpodCompletedAt: null }));
    expect(r.capacitySources.map((c) => c.capacitySourceEntityId)).toEqual(["ent-lambda"]);
    expect(us(r)).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT" });
  });
});
