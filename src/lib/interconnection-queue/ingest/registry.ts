/** The queue sources IQ-2 ingests, and nothing else. */

import { caisoQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/caiso";
import { ercotQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/ercot";
import { isoneQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/isone";
import { sppQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/spp";
import { nyisoQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/nyiso";
import { misoQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/miso";
import { pjmQueueAdapter } from "@/lib/interconnection-queue/ingest/adapters/pjm";
import { QUEUE_SOURCE_KEYS, type QueueAdapter, type QueueSourceKey }
  from "@/lib/interconnection-queue/ingest/types";

const ADAPTERS: Record<QueueSourceKey, QueueAdapter> = {
  pjm: pjmQueueAdapter,
  miso: misoQueueAdapter,
  caiso: caisoQueueAdapter,
  ercot: ercotQueueAdapter,
  nyiso: nyisoQueueAdapter,
  "iso-ne": isoneQueueAdapter,
  spp: sppQueueAdapter,
};

export const INGESTIBLE_QUEUE_SOURCES: readonly QueueSourceKey[] = QUEUE_SOURCE_KEYS;

export function queueAdapter(source: string): QueueAdapter | null {
  return (ADAPTERS as Record<string, QueueAdapter>)[source] ?? null;
}

export { ADAPTERS as QUEUE_ADAPTERS };
