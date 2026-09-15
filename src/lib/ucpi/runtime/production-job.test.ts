import { describe, expect, it } from "vitest";

import { DRAFT_VERSIONS, ENTITIES, LAMBDA_TENANCY_DOCUMENTED_SYNTHETIC, normalizationContext, permitted, REGISTRY_TODAY, VERSIONS } from "@/lib/ucpi/fixtures";
import { getLatestPoint, getSeries, assertSafeToExpose } from "@/lib/ucpi/read/series";
import { CollectingSink } from "@/lib/ucpi/runtime/events";
import { InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { runCalculationPhase, runCollectionPhase, type SourceJob } from "@/lib/ucpi/runtime/production-job";
import { validateForPublication } from "@/lib/ucpi/runtime/publication-gate";
import { RUNPOD_CATALOG_FIXTURE } from "@/lib/ucpi/fixtures";
import { toSeriesPoint, validatePublicResponseShape } from "@/lib/ucpi/api-contract";
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

async function collectAndCalculate(opts: { clock?: TestClock; sources?: SourceJob[]; registry?: typeof BOTH_PERMITTED; calculateAt?: string; runKind?: "production" | "simulation" | "correction"; persistence?: InMemoryPersistence; supersedes?: Map<string, string>; versions?: typeof VERSIONS | typeof DRAFT_VERSIONS } = {}) {
  const clock = opts.clock ?? new TestClock("2026-09-13T10:00:00Z");
  const persistence = opts.persistence ?? new InMemoryPersistence();
  const events = new CollectingSink();
  const ids = sequentialIds("job");
  const collection = await runCollectionPhase({ calculationDate: "2026-09-13", mode: "production", sources: opts.sources ?? jobs(clock), persistence, events, clock: clock.now, sleep: clock.sleep, idFactory: ids });
  clock.set(opts.calculateAt ?? "2026-09-14T00:02:00Z");
  const calculation = await runCalculationPhase({
    calculationDate: "2026-09-13",
    instrument: (opts.versions ?? VERSIONS).instrument,
    versions: opts.versions ?? VERSIONS,
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
    const point = (publishedAt: string) => JSON.stringify(toSeriesPoint(obs, { calculatedAt: calculation.run.calculatedAt, publishedAt }));
    const clean = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: point("2026-09-14T00:05:00Z") });
    expect(clean).toEqual({ ok: true, status: "published" });
    const dirty = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals.map((r) => ({ ...r, retrievalPurpose: "research" as const, permissionGrantId: null })), publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: point("2026-09-14T00:05:00Z") });
    expect(dirty.ok).toBe(false);
    if (!dirty.ok) expect(dirty.reasons.some((r) => r.startsWith("INPUT_NOT_PRODUCTION"))).toBe(true);
    const wrongVersion = validateForPublication({ regional: obs, run: { ...calculation.run, methodologyVersion: "0.9.9-draft" }, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: point("2026-09-14T00:05:00Z") });
    expect(wrongVersion.ok).toBe(false);
    if (!wrongVersion.ok) expect(wrongVersion.reasons).toContain("METHODOLOGY_VERSION_MISMATCH");
    const late = validateForPublication({ regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-15T00:00:00Z"), exposedJson: point("2026-09-15T00:00:00Z") });
    expect(late).toEqual({ ok: true, status: "delayed" });
    const sim = validateForPublication({ regional: obs, run: { ...calculation.run, runKind: "simulation" }, expected: VERSIONS, inputRetrievals: retrievals, publishAt: new Date("2026-09-14T00:05:00Z"), exposedJson: point("2026-09-14T00:05:00Z") });
    expect(sim.ok).toBe(false);
  });

  it("refuses to publish a value whose methodology or specification version is still a draft", async () => {
    const { calculation, persistence } = await collectAndCalculate();
    const obs = calculation.regional[0]!.observation;
    const base = {
      regional: obs,
      run: calculation.run,
      inputRetrievals: persistence.retrievals,
      publishAt: new Date("2026-09-14T00:05:00Z"),
      exposedJson: JSON.stringify(toSeriesPoint(obs, { calculatedAt: calculation.run.calculatedAt, publishedAt: "2026-09-14T00:05:00Z" })),
    };

    // The registry as it actually stands. Both UCPI and the LISTED specification
    // require approved versions before a first publication.
    const drafts = validateForPublication({ ...base, expected: DRAFT_VERSIONS });
    expect(drafts.ok).toBe(false);
    if (!drafts.ok) {
      expect(drafts.reasons).toContain("METHODOLOGY_VERSION_NOT_APPROVED:draft");
      expect(drafts.reasons).toContain("SPEC_VERSION_NOT_APPROVED:draft");
    }

    // Either half alone is enough to refuse: an approved child under a draft family does not publish.
    const familyDraft = validateForPublication({ ...base, expected: { ...VERSIONS, methodologyVersionStatus: "draft" } });
    expect(familyDraft.ok).toBe(false);
    if (!familyDraft.ok) {
      expect(familyDraft.reasons).toContain("METHODOLOGY_VERSION_NOT_APPROVED:draft");
      expect(familyDraft.reasons).not.toContain("SPEC_VERSION_NOT_APPROVED:approved");
    }

    const childDraft = validateForPublication({ ...base, expected: { ...VERSIONS, instrumentSpecVersionStatus: "draft" } });
    expect(childDraft.ok).toBe(false);
    if (!childDraft.ok) expect(childDraft.reasons).toContain("SPEC_VERSION_NOT_APPROVED:draft");

    // Superseded and retired are not approved either, and the reason names which state it was.
    const superseded = validateForPublication({ ...base, expected: { ...VERSIONS, instrumentSpecVersionStatus: "superseded" } });
    expect(superseded.ok).toBe(false);
    if (!superseded.ok) expect(superseded.reasons).toContain("SPEC_VERSION_NOT_APPROVED:superseded");

    // Only approved publishes, and the approved fixture still does, so the refusal is
    // the approval state and nothing else about this run.
    expect(validateForPublication({ ...base, expected: VERSIONS })).toEqual({ ok: true, status: "published" });
  });

  it("records the calculation but publishes nothing when the versions are drafts: a candidate is not a publication", async () => {
    const persistence = new InMemoryPersistence();
    const { calculation } = await collectAndCalculate({ persistence, versions: DRAFT_VERSIONS });

    // The run and its regional observation are recorded. That is what a labelled candidate is.
    expect(persistence.runs).toHaveLength(1);
    expect(calculation.regional).not.toHaveLength(0);
    const value = calculation.regional.find((r) => r.observation.outcome === "value");
    expect(value, "the fixture should produce a value, so that the block is about approval").toBeDefined();

    // Nothing was released, and the reason is named.
    expect(value!.status).toBe("blocked");
    expect(value!.publishedAt).toBeNull();
    expect(value!.gate.ok).toBe(false);
    if (!value!.gate.ok) expect(value!.gate.reasons).toContain("SPEC_VERSION_NOT_APPROVED:draft");
    expect(persistence.publications).toHaveLength(0);

    // And nothing reaches the public series.
    expect(await getSeries(persistence, { instrument: DRAFT_VERSIONS.instrument, country: "US" })).toEqual([]);
  });

  it("regression: an explicit participant or member price field in the public response blocks publication, whatever its value", async () => {
    const { calculation, persistence } = await collectAndCalculate();
    const obs = calculation.regional[0]!.observation;
    const base = { regional: obs, run: calculation.run, expected: VERSIONS, inputRetrievals: persistence.retrievals, publishAt: new Date("2026-09-14T00:05:00Z") };
    const good = JSON.parse(JSON.stringify(toSeriesPoint(obs, { calculatedAt: calculation.run.calculatedAt, publishedAt: "2026-09-14T00:05:00Z" }))) as Record<string, unknown>;

    const withParticipants = validateForPublication({ ...base, exposedJson: JSON.stringify({ ...good, participants: [{ capacitySourceEntityId: "ent-runpod", representativePrice: 2.69 }] }) });
    expect(withParticipants.ok).toBe(false);
    if (!withParticipants.ok) expect(withParticipants.reasons).toEqual(expect.arrayContaining(["CONSTITUENT_FIELD_EXPOSED:participants", "CONSTITUENT_FIELD_EXPOSED:participants[0].representativePrice", "PUBLIC_RESPONSE_UNKNOWN_FIELD:participants"]));

    const nestedPrice = validateForPublication({ ...base, exposedJson: JSON.stringify({ ...good, freshness: { ...(good.freshness as object), memberSellerEntityIds: ["ent-runpod"] } }) });
    expect(nestedPrice.ok).toBe(false);
    if (!nestedPrice.ok) expect(nestedPrice.reasons).toContain("CONSTITUENT_FIELD_EXPOSED:freshness.memberSellerEntityIds");

    const unknownField = validateForPublication({ ...base, exposedJson: JSON.stringify({ ...good, sellerPrices: [2.69, 4.29] }) });
    expect(unknownField.ok).toBe(false);
    if (!unknownField.ok) expect(unknownField.reasons).toContain("PUBLIC_RESPONSE_UNKNOWN_FIELD:sellerPrices");

    const notJson = validateForPublication({ ...base, exposedJson: "not json" });
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.reasons).toContain("PUBLIC_RESPONSE_NOT_OBJECT");
  });

  it("regression: two participants quoting the same price publish at N=2, the aggregate equalling both, with no constituent fields", async () => {
    const clock = new TestClock("2026-09-13T10:00:00Z");
    // Runpod's Community tier priced identically to Lambda's 1x, so the midpoint equals every participant price.
    const equal = { ...RUNPOD_CATALOG_FIXTURE, gpus: RUNPOD_CATALOG_FIXTURE.gpus.map((g) => ({ ...g, price: { ...g.price, community: 4.29, secure: 4.29 } })) };
    const sources = jobs(clock, { runpod: { http: scriptedClient([jsonResponse(equal)]) } });
    const { calculation, persistence } = await collectAndCalculate({ clock, sources });
    const us = calculation.regional[0]!;
    expect(us.observation.participants.map((p) => p.representativePrice)).toEqual([4.29, 4.29]);
    expect(us.observation.priceLevel).toBeCloseTo(4.29, 10);
    expect(us.status).toBe("published");
    expect(us.gate).toEqual({ ok: true, status: "published" });
    expect(persistence.publications).toHaveLength(1);
    const point = await getLatestPoint(persistence, VERSIONS.instrument, "US");
    expect(point!.priceLevel).toBeCloseTo(4.29, 10);
    expect(validatePublicResponseShape(JSON.parse(JSON.stringify(point)))).toEqual([]);
    expect(Object.keys(point!)).not.toEqual(expect.arrayContaining(["participants", "representativePrice"]));
  });
});
