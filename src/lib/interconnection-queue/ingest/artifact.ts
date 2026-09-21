/**
 * Identity for queue retrievals, raw records and canonical observations.
 *
 * Three different hashes, because they answer three different questions:
 *
 *   retrieval key    did we already fetch this exact artifact?
 *   record hash      did this exact source row already appear in this snapshot?
 *   observation hash is the publisher still saying the same thing about this request?
 *
 * The third is the one that keeps the table small. CAISO regenerates its workbook every day and
 * almost nothing changes; without content identity a year of retrievals would write 800,000
 * identical observations. With it, an unchanged day advances a snapshot pointer and writes nothing.
 */

import { createHash } from "node:crypto";

import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type { NormalizedQueueRecord } from "@/lib/interconnection-queue/ingest/types";

export const QUEUE_COLLECTOR = "urdais-interconnection-queue-v1" as const;

/** Bumped when an extraction changes meaning, so evidence records which reader produced it. */
export const QUEUE_EXTRACTION_VERSION = "urdais-interconnection-queue-extractor/1.0.0";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Stable JSON: object keys sorted, so key order in a source payload never changes a hash. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return entries.map(([key, item]) => [key, canonical(item)]);
  }
  return value;
}

export function queueRetrievalKey(source: string, artifact: RetrievedArtifact): string {
  return `interconnection-queue|${source}|${artifact.label}|${artifact.sha256}`;
}

/** Identity of one source row within one artifact. */
export function queueRecordHash(input: {
  artifactSha256: string;
  nativeQueueId: string;
  locator: Record<string, unknown>;
  payload: Record<string, unknown>;
}): string {
  return sha256(JSON.stringify([
    input.artifactSha256, input.nativeQueueId, canonical(input.locator), canonical(input.payload),
  ]));
}

/**
 * Content identity of a canonical observation.
 *
 * Every materially normalized field is in here, including every quantity and every resource. That
 * is the whole point: if any of it changes, the publisher has said something new and a new
 * observation is owed. Deliberately excluded are the locator and the raw payload, which can move
 * when a publisher reorders rows without changing a single fact about the project.
 */
export function observationHash(record: NormalizedQueueRecord): string {
  return sha256(JSON.stringify(canonical({
    nativeQueueId: record.nativeQueueId,
    nativeProjectName: record.nativeProjectName,
    nativeCustomer: record.nativeCustomer,
    nativeStatus: record.nativeStatus,
    nativeStatusDisplay: record.nativeStatusDisplay,
    lifecycleStage: record.lifecycleStage,
    requestClass: record.requestClass,
    requestedOn: record.requestedOn,
    proposedInServiceOn: record.proposedInServiceOn,
    revisedInServiceOn: record.revisedInServiceOn,
    actualInServiceOn: record.actualInServiceOn,
    agreementExecutedOn: record.agreementExecutedOn,
    withdrawnOn: record.withdrawnOn,
    nativeState: record.nativeState,
    nativeCounty: record.nativeCounty,
    nativeZone: record.nativeZone,
    nativePoi: record.nativePoi,
    nativeSubstation: record.nativeSubstation,
    nativeTransmissionOwner: record.nativeTransmissionOwner,
    sourcePartition: record.sourcePartition,
    quantities: [...record.quantities]
      .sort((a, b) => (a.nativeField < b.nativeField ? -1 : a.nativeField > b.nativeField ? 1
        : (a.resourceOrdinal ?? 0) - (b.resourceOrdinal ?? 0)))
      .map((q) => [q.nativeField, q.quantityKind, q.value, q.unit, q.resourceOrdinal, q.direction]),
    resources: [...record.resources]
      .sort((a, b) => a.componentOrdinal - b.componentOrdinal)
      .map((r) => [r.componentOrdinal, r.nativeTechnology, r.nativeFuel, r.technology, r.isSourceSeparated]),
  })));
}

/**
 * Snapshot identity. A source that versions itself contributes its own key; one that does not
 * contributes the content hash, so "a new observed source state" means exactly what it says.
 */
export function snapshotKey(nativeSnapshotKey: string | null, artifactSha256: string): string {
  return nativeSnapshotKey === null ? `content:${artifactSha256.slice(0, 16)}` : nativeSnapshotKey;
}
