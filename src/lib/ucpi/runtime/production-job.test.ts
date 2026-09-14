import { describe, expect, it } from "vitest";

import { ENTITIES, LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC, normalizationContext, permitted, REGISTRY_TODAY, VERSIONS } from "@/lib/ucpi/fixtures";
import { getLatestPoint, getSeries, assertSafeToExpose } from "@/lib/ucpi/read/series";
import { CollectingSink } from "@/lib/ucpi/runtime/events";
import { InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { runCalculationPhase, runCollectionPhase, type SourceJob } from "@/lib/ucpi/runtime/production-job";
import { validateForPublication } from "@/lib/ucpi/runtime/publication-gate";
import { jsonResponse, lambdaInput, runpodInput, scriptedClient, sequentialIds, TestClock } from "@/lib/ucpi/runtime/test-support";

const BOTH_PERMITTED = [permitted("runpod-gpu-types"), permitted("lambda-instance-types")];
const lambdaDocumented = normalizationContext({ tenancyEvidence: new Map([["lambda", LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC]]) });

function jobs(clock: TestClock, over: { runpod?: Partial<SourceJob>; lambda?: Partial<SourceJob> } = {}): SourceJob[] {
  const rp = runpodInput({ clock: clock.now, sleep: clock.sleep });
  const lb = lambdaInput({ clock: clock.now, sleep: clock.sleep, context: lambdaDocumented });
  const strip = (x: object) => {
    const { mode: _m, calculationDate: _d, persistence: _p, events: _e, clock: _c, sleep: _s, idFactory: _i, ...rest } = x as Record<string, unknown>;
    void _m; void _d; void _p; void _e; void _c; void _s; void _i;
    return rest as SourceJob;
  };
  return [
    { ...strip(rp), ...over.runpod } as SourceJob,
    { ...strip(lb), ...over.lambda } as SourceJob,
  ];
}

async function collectAndCalculate(opts: { clock?: TestClock; sources?: SourceJob[]; registry?: typeof BOTH_PERMITTED; calculateAt?: string; runKind?: "production" | "simulation" | "correction"; persistence?: InMemoryPersistence; supersedes?: Map<string, string> } = {}) {
  const clock = opts.clock ?? new TestClock("2026-09-13T10:00:00Z");
  const persistence = opts.persistence ?? new InMemoryPersistence();
  const events = new CollectingSink();
  const ids = sequentialIds("job");
  const collection = await runCollectionPhase({ calculationDate: "2026-09-13", mode: "production", sources: opts.sources ?? jobs(clock), persistence, events, clock: clock.now, sleep: clock.sleep, idFactory: ids });
  clock.set(opts.calculateAt ?? "2026-09-14T00:02:00Z");
  const calculation = await runCalculationPhase({
    calculationDate: "2026-09-13",
    instrument: VERSIONS.instrument,
    versions: VERSIONS,
    entities: ENTITIES,
    registry: opts.registry ?? BOTH_PERMITTED,
    persistence,
    events,
    clock: clock.now,
    idFactory: ids,
    runKind: opts.runKind,
    seriesRegions: ["US"],
    supersedes: opts.supersedes,
    supersessionReason: opts.supersedes ? "input correction" : undefined,
  });
  return { collection, calculation, persistence, events, clock };
}

describe("production job", () => {
  it("collects both sources, calculates at the cutoff, and publishes an N=2 Minimum value on time", async () => {
    const { collection, calculation, persistence, events } = await collectAndCalculate();
    expect(collection.failed).toEqual([]);
    expect(collection.collected.map((c) => c.source)).toEqual(["runpod-gpu-types", "lambda-instance-types"]);
    const us = calculation.regional.find((r) => r.observation.canonicalRegionCode === "US")!;
    expect(us.status).toBe("published");
    expect(us.observation).toMatchObject({ outcome: "value", marketBreadth: "minimum", participantCount: 2, contributingSourceCount: 2 });
    expect(us.observation.priceLevel).toBeCloseTo(3.49, 10);
    expect(persistence.runs[0]).toMatchObject({ runKind: "production", cutoff: "2026-09-14T00:00:00.000Z", publicationDeadline: "2026-09-15T00:00:00.000Z" });
    expect(persistence.publications).toHaveLength(1);
    expect(persistence.publications[0]!.publicationStatus).toBe("published");
    expect(events.ofType("minimum_breadth")).toHaveLength(1);
    expect(events.ofType("publication_succeeded")).toHaveLength(1);
    expect(events.ofType("run_finished")[0]!.outcome).toBe("US:published");
  });

  it("isolates a provider failure: Lambda 401 leaves Runpod alone at N=1 and the day Unavailable", async () => {
    const clock = new TestClock("2026-09-13T10:00:00Z");
    const sources = jobs(clock, { lambda: { http: scriptedClient([jsonResponse({}, 401)]) } });
    const { collection, calculation, persistence } = await collectAndCalculate({ clock, sources });
    expect(collection.failed).toEqual([{ source: "lambda-instance-types", error: expect.stringContaining("HttpAuthError") }]);
    expect(collection.collected).toHaveLength(1);
    const us = calculation.regional[0]!;
    expect(us.status).toBe("unavailable");
    expect(us.observation).toMatchObject({ outcome: "unavailable", structuralCondition: "SINGLE_PARTICIPANT", participantCount: 1 });
    expect(persistence.publications).toHaveLength(0);
  });

  it("both providers failing yields NO_ELIGIBLE_PARTICIPANT for the configured series region", async () => {
    const clock = new TestClock("2026-09-13T10:00:00Z");
    const sources = jobs(clock, { runpod: { http: scriptedClient([jsonResponse({}, 500), jsonResponse({}, 500), jsonResponse({}, 500), jsonResponse({}, 500)]) }, lambda: { http: scriptedClient(["timeout", "timeout", "timeout", "timeout"]) } });
    const { collection, calculation } = await collectAndCalculate({ clock, sources });
    expect(collection.failed).toHaveLength(2);
    expect(calculation.regional[0]!.observation).toMatchObject({ outcome: "unavailable", structuralCondition: "NO_ELIGIBLE_PARTICIPANT", participantCount: 0 });
  });

  it("a blocked source in the registry is excluded even if its retrieval somehow exists", async () => {
    const { calculation } = await collectAndCalculate({ registry: [permitted("lambda-instance-types"), REGISTRY_TODAY.find((s) => s.slug === "runpod-gpu-types")!] });
    expect(calculation.pipeline.assessments.filter((a) => a.observationId.includes("rp-")).every((a) => a.exclusions.includes("COLLECTION_NOT_PERMITTED"))).toBe(true);
    expect(calculation.regional[0]!.observation.structuralCondition).toBe("SINGLE_PARTICIPANT");
  });

  it("refuses to calculate before the cutoff", async () => {
    const clock = new TestClock("2026-09-13T10:00:00Z");
    await expect(collectAndCalculate({ clock, calculateAt: "2026-09-13T23:00:00Z" })).rejects.toThrow(/cannot begin before the cutoff/);
  });

  it("marks a late release Delayed and never Published", async () => {
    const { calculation, persistence, events } = await collectAndCalculate({ calculateAt: "2026-09-15T06:00:00Z" });
    expect(calculation.regional[0]!.status).toBe("delayed");
    expect(persistence.publications[0]!.publicationStatus).toBe("delayed");
    expect(events.ofType("publication_delayed")).toHaveLength(1);
    expect(events.ofType("publication_succeeded")).toHaveLength(0);
  });

  it("a simulation run computes but can never publish", async () => {
    const { calculation, persistence } = await collectAndCalculate({ runKind: "simulation" });
    expect(calculation.regional[0]!.observation.outcome).toBe("value");
    expect(calculation.regional[0]!.status).toBe("blocked");
    expect(persistence.publications).toHaveLength(0);
    await expect(persistence.insertPublication({ id: "x", regionalObservationId: calculation.regional[0]!.observation.id, publishedAt: "2026-09-14T00:05:00Z", publicationStatus: "published", publisherIdentity: "t" })).rejects.toThrow(/simulation/);
  });

  it("a production run cannot be built from research or validation retrievals", async () => {
    const clock = new TestClock("2026-09-13T10:00:00Z");
    const persistence = new InMemoryPersistence();
    const events = new CollectingSink();
    await runCollectionPhase({ calculationDate: "2026-09-13", mode: "validation", sources: jobs(clock), persistence, events, clock: clock.now, sleep: clock.sleep, idFactory: sequentialIds("v") });
    expect(persistence.retrievals.every((r) => r.retrievalPurpose === "validation")).toBe(true);
    clock.set("2026-09-14T00:02:00Z");
    const calc = await runCalculationPhase({ calculationDate: "2026-09-13", instrument: VERSIONS.instrument, versions: VERSIONS, entities: ENTITIES, registry: BOTH_PERMITTED, persistence, events, clock: clock.now, idFactory: sequentialIds("c"), seriesRegions: ["US"] });
    expect(calc.pipeline.eligible).toHaveLength(0);
    expect(calc.regional[0]!.observation.structuralCondition).toBe("NO_ELIGIBLE_PARTICIPANT");
    expect(persistence.publications).toHaveLength(0);
  });

  it("a correction run supersedes the current observation and takes its place in the series", async () => {
    const first = await collectAndCalculate();
    const current = first.calculation.regional[0]!.observation;
    const second = await collectAndCalculate({ persistence: first.persistence, runKind: "correction", calculateAt: "2026-09-14T06:00:00Z", supersedes: new Map([["US", current.id]]), sources: jobs(new TestClock("2026-09-13T12:00:00Z")) });
    expect(first.persistence.supersessions).toEqual([{ id: current.id, byId: second.calculation.regional[0]!.observation.id, reason: "input correction", at: second.calculation.run.calculatedAt }]);
    expect(second.events.ofType("correction_run")).toHaveLength(1);
    const series = await getSeries(first.persistence, { instrument: VERSIONS.instrument, country: "US" });
    expect(series).toHaveLength(1);
    expect(series[0]!.calculatedAt).toBe(second.calculation.run.calculatedAt);
  });

  it("the read path exposes the contract and nothing else", async () => {
    const { persistence } = await collectAndCalculate();
    const point = await getLatestPoint(persistence, VERSIONS.instrument, "US");
    expect(point).toMatchObject({ status: "published", marketBreadth: "minimum", participantCount: 2, contributingSourceCount: 2, dispersion: null, methodologyVersion: "0.1.2-draft", instrumentSpecVersion: "0.1.4-draft" });
    expect(() => assertSafeToExpose(point!)).not.toThrow();
    const json = JSON.stringify(point);
    expect(json).not.toMatch(/2\.69|4\.29|runpod|lambda|Bearer|"participants"|representativePrice/);
    expect(await getSeries(persistence, { instrument: VERSIONS.instrument, country: "DE" })).toEqual([]);
  });
});

describe("publication gate", () => {
  it("rejects a value whose inputs lack production permission lineage, and passes a clean one", async () => {
    const { calculation, persistence } = await collectAndCalculate();
    const obs = calculation.regional[0]!.observation;
    const retrievals = persistence.retrievals;
    const clean = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: "{}", participantPrices: [2.69, 4.29] });
    expect(clean).toEqual({ ok: true, status: "published" });
    const dirty = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals.map((r) => ({ ...r, retrievalPurpose: "research" as const, permissionGrantId: null })), publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: "{}", participantPrices: [] });
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) expect(dirty.reasons.some((r) => r.startsWith("INPUT_NOT_PRODUCTION"))).toBe(true);
    const leaking = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: JSON.stringify({ level: 3.49, participants: [2.69] }), participantPrices: [2.69, 4.29] });
    expect(leaking.ok).toBe(false);
    if (!leaking.ok) expect(leaking.reasons).toContain("PARTICIPANT_PRICE_EXPOSED_AT_N2");
    const wrongVersion = validateForPublication({ regional: obs, run: { ...calculation.run, methodologyVersion: "0.9.9-draft" }, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: "{}", participantPrices: [] });
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.reasons).toContain("METHODOLOGY_VERSION_MISMATCH");
    const late = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-15T00:00:00Z"), exposedJson: "{}", participantPrices: [] });
    expect(late).toEqual({ ok: true, status: "delayed" });
    const sim = validateForPublication({ regional: obs, run: { ...calculation.run, runKind: "simulation" }, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: "{}", participantPrices: [] });
    expect(sim.ok).toBe(false);
  });
});
