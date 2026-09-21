/** Orchestration: retrieve, parse, persist — one source at a time, isolated from the others. */

import { QUEUE_COLLECTOR } from "@/lib/interconnection-queue/ingest/artifact";
import { resolveIdentityCollisions, type IdentityCollision } from "@/lib/interconnection-queue/ingest/collisions";
import { INGESTIBLE_QUEUE_SOURCES, queueAdapter } from "@/lib/interconnection-queue/ingest/registry";
import { persistQueueExtraction, type QueueWriteResult } from "@/lib/interconnection-queue/ingest/store";
import type { QueueAdapter } from "@/lib/interconnection-queue/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { httpArtifactFetcher, type ArtifactFetcher } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

export type ArchiveBackfillOutcome = {
  status: "backfilled";
  source: string;
  marketSlug: string;
  artifactsDiscovered: number;
  reportPeriods: number;
  corrections: number;
  artifactsParsed: number;
  artifactsDeferred: { label: string; reason: string }[];
  snapshotsCreated: number;
  snapshotsExisting: number;
  rawRecordsInserted: number;
  requestsInserted: number;
  observationsInserted: number;
  observationsConfirmed: number;
  quantitiesInserted: number;
  resourcesInserted: number;
  deferralsRecorded: number;
  historicalRange: { first: string | null; last: string | null };
  statements: number;
  retrievalMs: number;
  parseMs: number;
  persistMs: number;
};

export type QueueRunOutcome =
  | ({ status: "ingested" } & QueueWriteResult
      & { retrievalMs: number; parseMs: number; persistMs: number; identityCollisions: IdentityCollision[] })
  | {
      status: "parsed"; source: string; snapshotKey: string; sourcePublishedAt: string | null;
      records: number; canonicalRecords: number; quantities: number; resources: number;
      deferrals: number; identityCollisions: IdentityCollision[];
      lifecycle: Record<string, number>; retrievalMs: number; parseMs: number;
    }
  | ArchiveBackfillOutcome
  | { status: "failed"; source: string; error: string };

export type QueueRunReport = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  outcomes: QueueRunOutcome[];
};

export async function collectQueueArtifacts(
  adapter: QueueAdapter,
  fetcher: ArtifactFetcher,
): Promise<Map<string, RetrievedArtifact>> {
  const artifacts = new Map<string, RetrievedArtifact>();
  for (const ref of adapter.artifacts) artifacts.set(ref.label, await fetcher(ref));
  return artifacts;
}

/**
 * One source. A failure is contained: the write path runs in its own transaction, so a publisher
 * who has reorganised a feed leaves every other market exactly as it was.
 */
/**
 * Retrieve one artifact, with bounded retries.
 *
 * A 99-artifact archive walk over somebody else's public server has to be considerate: a failure
 * is retried a small number of times with a growing pause, and an artifact that still will not
 * come back is deferred by name rather than failing the whole backfill.
 */
async function retrieve(
  fetcher: ArtifactFetcher, ref: { label: string; url: string }, attempts = 3,
): Promise<RetrievedArtifact> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetcher(ref);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => { setTimeout(resolve, 500 * attempt); });
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Walk a publisher's archive, oldest release first.
 *
 * Order is the whole point: a correction published after the artifact it corrects must be
 * ingested after it, or the original would end up canonical for that report period. Each artifact
 * becomes its own snapshot, and an artifact that cannot be retrieved or parsed is deferred by name
 * rather than skipped silently.
 */
export async function runQueueArchive(
  sql: CapacitySqlExecutor | null,
  adapter: QueueAdapter,
  options: { fetcher: ArtifactFetcher; dryRun?: boolean; batchSize?: number; limit?: number },
): Promise<QueueRunOutcome> {
  const fetcher = options.fetcher;
  const retrievalStart = Date.now();
  const refs = await adapter.discover!(async (url) => fetcher({ label: "archive-index", url }));
  const selected = options.limit === undefined ? refs : refs.slice(-options.limit);
  const retrievalIndexMs = Date.now() - retrievalStart;

  const periods = new Set(refs.map((ref) => ref.reportPeriod).filter((period) => period !== null));
  const outcome: ArchiveBackfillOutcome = {
    status: "backfilled", source: adapter.key, marketSlug: adapter.marketSlug,
    artifactsDiscovered: refs.length, reportPeriods: periods.size,
    corrections: refs.filter((ref) => ref.isCorrection).length,
    artifactsParsed: 0, artifactsDeferred: [],
    snapshotsCreated: 0, snapshotsExisting: 0,
    rawRecordsInserted: 0, requestsInserted: 0, observationsInserted: 0, observationsConfirmed: 0,
    quantitiesInserted: 0, resourcesInserted: 0, deferralsRecorded: 0,
    historicalRange: {
      first: refs.map((ref) => ref.reportPeriod).filter((p): p is string => p !== null).sort()[0] ?? null,
      last: refs.map((ref) => ref.reportPeriod).filter((p): p is string => p !== null).sort().at(-1) ?? null,
    },
    statements: 0, retrievalMs: retrievalIndexMs, parseMs: 0, persistMs: 0,
  };

  for (const ref of selected) {
    let artifact: RetrievedArtifact;
    const fetchStart = Date.now();
    try {
      artifact = await retrieve(fetcher, { label: ref.label, url: ref.url });
    } catch (error) {
      outcome.artifactsDeferred.push({
        label: ref.label,
        reason: `unavailable: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    outcome.retrievalMs += Date.now() - fetchStart;

    const parseStart = Date.now();
    let extraction;
    try {
      extraction = adapter.parse(new Map([[ref.label, artifact]]), ref);
    } catch (error) {
      // A historical variant this reader cannot handle is recorded by name, never skipped.
      outcome.artifactsDeferred.push({
        label: ref.label,
        reason: `unparseable: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    resolveIdentityCollisions(extraction);
    outcome.parseMs += Date.now() - parseStart;
    outcome.artifactsParsed += 1;

    if (options.dryRun === true || sql === null) continue;

    const persistStart = Date.now();
    const written = await persistQueueExtraction(
      sql, { ...adapter, artifacts: [{ label: ref.label, url: ref.url }] }, new Map([[ref.label, artifact]]),
      extraction, QUEUE_COLLECTOR,
      { ...(options.batchSize === undefined ? {} : { batchSize: options.batchSize }),
        observedAt: ref.publishedAt ?? artifact.retrievedAt, ref },
    );
    outcome.persistMs += Date.now() - persistStart;
    if (written.snapshot === "created") outcome.snapshotsCreated += 1; else outcome.snapshotsExisting += 1;
    outcome.rawRecordsInserted += written.rawRecordsInserted;
    outcome.requestsInserted += written.requestsInserted;
    outcome.observationsInserted += written.observationsInserted;
    outcome.observationsConfirmed += written.observationsConfirmed;
    outcome.quantitiesInserted += written.quantitiesInserted;
    outcome.resourcesInserted += written.resourcesInserted;
    outcome.deferralsRecorded += written.deferralsRecorded;
    outcome.statements += written.statements;
  }

  return outcome;
}

export async function runQueueSource(
  sql: CapacitySqlExecutor | null,
  source: string,
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean; batchSize?: number; observedAt?: string;
    limit?: number },
): Promise<QueueRunOutcome> {
  const adapter = queueAdapter(source);
  if (adapter === null) return { status: "failed", source, error: `unknown queue source ${source}` };
  try {
    if (adapter.discover !== undefined) {
      return await runQueueArchive(sql, adapter, {
        fetcher: options?.fetcher ?? httpArtifactFetcher(),
        ...(options?.dryRun === undefined ? {} : { dryRun: options.dryRun }),
        ...(options?.batchSize === undefined ? {} : { batchSize: options.batchSize }),
        ...(options?.limit === undefined ? {} : { limit: options.limit }),
      });
    }
    const retrievalStart = Date.now();
    const artifacts = await collectQueueArtifacts(adapter, options?.fetcher ?? httpArtifactFetcher());
    const retrievalMs = Date.now() - retrievalStart;

    const parseStart = Date.now();
    const extraction = adapter.parse(artifacts);
    // A publisher that served one queue id twice has made that identity ambiguous. Raw evidence
    // is kept for every row; no canonical request is invented for the colliding ones.
    const identityCollisions = resolveIdentityCollisions(extraction);
    const parseMs = Date.now() - parseStart;

    if (options?.dryRun === true || sql === null) {
      const lifecycle: Record<string, number> = {};
      for (const record of extraction.records) {
        if (!record.canonical) continue;
        lifecycle[record.lifecycleStage] = (lifecycle[record.lifecycleStage] ?? 0) + 1;
      }
      return {
        status: "parsed", source,
        snapshotKey: extraction.snapshot.nativeSnapshotKey ?? "content-addressed",
        sourcePublishedAt: extraction.snapshot.sourcePublishedAt,
        records: extraction.records.length,
        canonicalRecords: extraction.records.filter((record) => record.canonical).length,
        quantities: extraction.records.reduce((total, record) => total + record.quantities.length, 0),
        resources: extraction.records.reduce((total, record) => total + record.resources.length, 0),
        deferrals: extraction.deferrals.length, identityCollisions,
        lifecycle, retrievalMs, parseMs,
      };
    }

    const persistStart = Date.now();
    const written = await persistQueueExtraction(
      sql, adapter, artifacts, extraction, QUEUE_COLLECTOR,
      {
        ...(options?.batchSize === undefined ? {} : { batchSize: options.batchSize }),
        ...(options?.observedAt === undefined ? {} : { observedAt: options.observedAt }),
      },
    );
    return { status: "ingested", ...written, identityCollisions,
      retrievalMs, parseMs, persistMs: Date.now() - persistStart };
  } catch (error) {
    return {
      status: "failed", source,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export async function runQueueIngestion(
  sql: CapacitySqlExecutor | null,
  sources: readonly string[],
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean; batchSize?: number; observedAt?: string;
    limit?: number },
): Promise<QueueRunReport> {
  const startedAt = new Date().toISOString();
  const outcomes: QueueRunOutcome[] = [];
  for (const source of sources) outcomes.push(await runQueueSource(sql, source, options));
  return {
    ok: outcomes.every((outcome) => outcome.status !== "failed"),
    startedAt,
    completedAt: new Date().toISOString(),
    outcomes,
  };
}

export { INGESTIBLE_QUEUE_SOURCES };
