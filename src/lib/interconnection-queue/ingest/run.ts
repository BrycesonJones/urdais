/** Orchestration: retrieve, parse, persist — one source at a time, isolated from the others. */

import { QUEUE_COLLECTOR } from "@/lib/interconnection-queue/ingest/artifact";
import { resolveIdentityCollisions, type IdentityCollision } from "@/lib/interconnection-queue/ingest/collisions";
import { INGESTIBLE_QUEUE_SOURCES, queueAdapter } from "@/lib/interconnection-queue/ingest/registry";
import { persistQueueExtraction, type QueueWriteResult } from "@/lib/interconnection-queue/ingest/store";
import type { QueueAdapter } from "@/lib/interconnection-queue/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { httpArtifactFetcher, type ArtifactFetcher } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

export type QueueRunOutcome =
  | ({ status: "ingested" } & QueueWriteResult
      & { retrievalMs: number; parseMs: number; persistMs: number; identityCollisions: IdentityCollision[] })
  | {
      status: "parsed"; source: string; snapshotKey: string; sourcePublishedAt: string | null;
      records: number; canonicalRecords: number; quantities: number; resources: number;
      deferrals: number; identityCollisions: IdentityCollision[];
      lifecycle: Record<string, number>; retrievalMs: number; parseMs: number;
    }
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
export async function runQueueSource(
  sql: CapacitySqlExecutor | null,
  source: string,
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean; batchSize?: number; observedAt?: string },
): Promise<QueueRunOutcome> {
  const adapter = queueAdapter(source);
  if (adapter === null) return { status: "failed", source, error: `unknown queue source ${source}` };
  try {
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
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean; batchSize?: number; observedAt?: string },
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
