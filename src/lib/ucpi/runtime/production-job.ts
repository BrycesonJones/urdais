/**
 * The production job, in two phases that the family's calendar keeps apart:
 *
 *   collection phase, inside the window: preflight approved sources, collect
 *   each in isolation, persist retrieval, raw offers, observations and
 *   assessments. A provider failure is recorded and does not stop the others.
 *
 *   calculation phase, at or after the cutoff: load the date's production
 *   observations, run the pipeline, write the calculation run and its rows in
 *   one transaction, evaluate the publication gate, publish (or record Delayed),
 *   and emit a structured result.
 *
 * Nothing here schedules anything. A caller decides when each phase runs.
 */

import { LISTED_SCOPE_KEY, type RegionalObservation, type RegionScope } from "@/lib/ucpi/aggregation";
import { toSeriesPoint } from "@/lib/ucpi/api-contract";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import { runPipeline, type PipelineResult } from "@/lib/ucpi/collector";
import type { MarketEntity } from "@/lib/ucpi/domain";
import type { InstrumentSpec } from "@/lib/ucpi/eligibility";
import type { GpuIdentityRequirement } from "@/lib/ucpi/listed/instruments";
import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import type { RunMode } from "@/lib/ucpi/runtime/config";
import { collectSource, type SourceCollectionResult, type SourceRuntimeInput } from "@/lib/ucpi/runtime/collector-runtime";
import type { EventSink } from "@/lib/ucpi/runtime/events";
import type { Clock } from "@/lib/ucpi/runtime/http";
import type { CalculationRunRow, Persistence, StoredRegionalObservation } from "@/lib/ucpi/runtime/persistence";
import { validateForPublication, type ExpectedVersions } from "@/lib/ucpi/runtime/publication-gate";

export type SourceJob = Omit<SourceRuntimeInput<unknown, unknown, unknown>, "mode" | "calculationDate" | "persistence" | "events" | "clock" | "sleep" | "idFactory">;

export type CollectionPhaseResult = {
  calculationDate: string;
  collected: { source: string; result: SourceCollectionResult }[];
  failed: { source: string; error: string }[];
};

export async function runCollectionPhase(input: {
  calculationDate: string;
  mode: RunMode;
  sources: readonly SourceJob[];
  persistence: Persistence;
  events: EventSink;
  clock: Clock;
  sleep: (ms: number) => Promise<void>;
  idFactory: () => string;
}): Promise<CollectionPhaseResult> {
  const collected: CollectionPhaseResult["collected"] = [];
  const failed: CollectionPhaseResult["failed"] = [];
  for (const source of input.sources) {
    try {
      const result = await collectSource({ ...source, mode: input.mode, calculationDate: input.calculationDate, persistence: input.persistence, events: input.events, clock: input.clock, sleep: input.sleep, idFactory: input.idFactory });
      collected.push({ source: source.adapter.sourceInterfaceSlug, result });
    } catch (error) {
      failed.push({ source: source.adapter.sourceInterfaceSlug, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) });
    }
  }
  return { calculationDate: input.calculationDate, collected, failed };
}

export type CalculationPhaseResult = {
  run: CalculationRunRow;
  pipeline: PipelineResult;
  regional: { observation: StoredRegionalObservation; gate: ReturnType<typeof validateForPublication>; publishedAt: string | null; status: "published" | "delayed" | "unavailable" | "blocked" }[];
};

export async function runCalculationPhase(input: {
  calculationDate: string;
  instrument: string;
  /** The run's versions and where each stands in the registry. Only approved versions publish. */
  versions: ExpectedVersions;
  entities: readonly MarketEntity[];
  registry: readonly SourceRegistryState[];
  persistence: Persistence;
  events: EventSink;
  clock: Clock;
  idFactory: () => string;
  runKind?: "production" | "simulation" | "correction";
  calculatorIdentity?: string;
  /** For a correction run: the current regional observation ids being superseded, by country. */
  supersedes?: ReadonlyMap<string, string>;
  supersessionReason?: string;
  /** Countries the child publishes series for. */
  seriesRegions?: readonly string[];
  /** The specification assessing eligibility; accessible by default. */
  spec?: InstrumentSpec;
  /** Country series by default; the LISTED sibling publishes one provider-wide series. */
  regionScope?: RegionScope;
  /** The hardware the instrument measures; the founding H100 SXM child by default. */
  identity?: GpuIdentityRequirement;
}): Promise<CalculationPhaseResult> {
  const window = calculationWindow(input.calculationDate);
  const now = input.clock();
  if (now.getTime() < Date.parse(window.cutoff)) throw new Error(`calculation for ${input.calculationDate} cannot begin before the cutoff ${window.cutoff}`);

  const runKind = input.runKind ?? "production";
  const runId = input.idFactory();
  input.events.emit({ type: "run_started", runId, calculationDate: input.calculationDate, mode: runKind, sources: [] });
  if (runKind === "correction") {
    for (const [region, supersededId] of input.supersedes ?? []) {
      input.events.emit({ type: "correction_run", runId, calculationDate: input.calculationDate, supersedes: `${region}:${supersededId}`, reason: input.supersessionReason ?? "unspecified" });
    }
  }

  const { observations, retrievals } = await input.persistence.loadObservationsForDate(input.calculationDate);
  const regionScope = input.regionScope ?? "country";
  const regionsSeen = regionScope === "listed_provider_wide" ? [LISTED_SCOPE_KEY] : [...new Set([...observations.map((o) => o.canonicalRegionCode).filter((r): r is string => r !== null), ...(input.seriesRegions ?? [])])];
  const priorByRegion = new Map<string, Awaited<ReturnType<Persistence["loadPriorRegional"]>> & object>();
  for (const region of regionsSeen) {
    const prior = await input.persistence.loadPriorRegional(input.instrument, region, input.calculationDate);
    if (prior) priorByRegion.set(region, prior);
  }

  const pipeline = runPipeline({
    instrument: input.instrument,
    calculationDate: input.calculationDate,
    methodologyVersion: input.versions.methodologyVersion,
    instrumentSpecVersion: input.versions.instrumentSpecVersion,
    observations,
    retrievals,
    entities: input.entities,
    registry: input.registry,
    priorByRegion,
    seriesRegions: input.seriesRegions,
    spec: input.spec,
    regionScope,
    identity: input.identity,
  });

  const run: CalculationRunRow = {
    id: runId,
    instrument: input.instrument,
    instrumentSpecVersion: input.versions.instrumentSpecVersion,
    methodologyVersion: input.versions.methodologyVersion,
    calculationDate: input.calculationDate,
    windowStart: window.windowStart,
    cutoff: window.cutoff,
    publicationDeadline: window.publicationDeadline,
    calculatedAt: now.toISOString(),
    calculatorIdentity: input.calculatorIdentity ?? "ucpi-production-job",
    runKind,
    notes: null,
  };

  const stored: StoredRegionalObservation[] = pipeline.regional.map((r) => ({ ...r, id: input.idFactory(), runId, runKind, calculatedAt: run.calculatedAt, supersededById: null }));

  await input.persistence.transaction(async () => {
    await input.persistence.insertCalculationRun(run);
    if (runKind === "correction") {
      for (const row of stored) {
        const supersededId = input.supersedes?.get(row.canonicalRegionCode);
        if (supersededId) await input.persistence.supersedeRegionalObservation(supersededId, row.id, input.supersessionReason ?? "correction", run.calculatedAt);
      }
    }
    await input.persistence.insertSellerObservations(runId, pipeline.sellerObservations);
    await input.persistence.insertCapacitySources(runId, pipeline.capacitySources);
    for (const row of stored) await input.persistence.insertRegionalObservation(row);
  });

  const regional: CalculationPhaseResult["regional"] = [];
  for (const row of stored) {
    emitBreadth(row, input.events);
    if (row.outcome === "unavailable") {
      regional.push({ observation: row, gate: { ok: true, status: "published" }, publishedAt: null, status: "unavailable" });
      continue;
    }
    const publishAt = input.clock();
    const participantRetrievalIds = new Set(row.participants.flatMap((p) => p.memberSellerEntityIds).flatMap((seller) => observations.filter((o) => o.sellerEntityId === seller && (row.regionScope === "listed_provider_wide" || o.canonicalRegionCode === row.canonicalRegionCode)).map((o) => o.retrievalId)));
    const gate = validateForPublication({
      regional: row,
      run,
      expected: input.versions,
      inputRetrievals: retrievals.filter((r) => participantRetrievalIds.has(r.id)),
      publishAt,
      exposedJson: JSON.stringify(toSeriesPoint(row, { calculatedAt: run.calculatedAt, publishedAt: publishAt.toISOString() })),
    });
    if (!gate.ok) {
      input.events.emit({ type: "publication_blocked", region: row.canonicalRegionCode, calculationDate: row.calculationDate, reasons: gate.reasons });
      regional.push({ observation: row, gate, publishedAt: null, status: "blocked" });
      continue;
    }
    if (runKind === "simulation") {
      regional.push({ observation: row, gate, publishedAt: null, status: "blocked" });
      continue;
    }
    await input.persistence.insertPublication({ id: input.idFactory(), regionalObservationId: row.id, publishedAt: publishAt.toISOString(), publicationStatus: gate.status, publisherIdentity: run.calculatorIdentity });
    if (gate.status === "published") input.events.emit({ type: "publication_succeeded", region: row.canonicalRegionCode, calculationDate: row.calculationDate, publishedAt: publishAt.toISOString() });
    else input.events.emit({ type: "publication_delayed", region: row.canonicalRegionCode, calculationDate: row.calculationDate, deadline: row.publicationDeadline, publishedAt: publishAt.toISOString() });
    regional.push({ observation: row, gate, publishedAt: publishAt.toISOString(), status: gate.status });
  }

  input.events.emit({ type: "run_finished", runId, calculationDate: input.calculationDate, outcome: regional.map((r) => `${r.observation.canonicalRegionCode}:${r.status}`).join(",") || "no regions" });
  return { run, pipeline, regional };
}

function emitBreadth(row: RegionalObservation, events: EventSink): void {
  if (row.outcome === "unavailable") {
    events.emit({ type: "region_unavailable", region: row.canonicalRegionCode, calculationDate: row.calculationDate, condition: row.structuralCondition ?? "UNKNOWN", participantCount: row.participantCount });
  } else if (row.marketBreadth === "minimum") {
    events.emit({ type: "minimum_breadth", region: row.canonicalRegionCode, calculationDate: row.calculationDate, participantCount: row.participantCount });
  } else {
    events.emit({ type: "normal_breadth", region: row.canonicalRegionCode, calculationDate: row.calculationDate, participantCount: row.participantCount });
  }
}
