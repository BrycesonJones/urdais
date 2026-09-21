/**
 * Identity collisions inside one artifact.
 *
 * Canonical identity is (market, native queue id). A publisher that serves the same queue id
 * twice in one response has made that identity ambiguous, and there is no honest way to pick a
 * winner: MISO serves J2656 twice with the same queue date, two different study cycles and
 * 180 MW against 0 MW. Choosing either would be Urdais asserting something MISO did not.
 *
 * So neither row becomes canonical. Both are still written as raw evidence, because the
 * publisher did serve them, and a deferral records the collision by name. The alternative —
 * failing the whole source — would discard 3,851 unambiguous requests over one bad id.
 */

import type { QueueExtraction } from "@/lib/interconnection-queue/ingest/types";

export type IdentityCollision = { nativeQueueId: string; rows: number };

export function resolveIdentityCollisions(extraction: QueueExtraction): IdentityCollision[] {
  const counts = new Map<string, number>();
  for (const record of extraction.records) {
    counts.set(record.nativeQueueId, (counts.get(record.nativeQueueId) ?? 0) + 1);
  }
  const collisions: IdentityCollision[] = [];
  for (const [nativeQueueId, rows] of counts) {
    if (rows > 1) collisions.push({ nativeQueueId, rows });
  }
  if (collisions.length === 0) return [];

  const colliding = new Set(collisions.map((collision) => collision.nativeQueueId));
  for (const record of extraction.records) {
    if (colliding.has(record.nativeQueueId)) record.canonical = false;
  }
  for (const collision of collisions) {
    const example = extraction.records.find((record) => record.nativeQueueId === collision.nativeQueueId);
    extraction.deferrals.push({
      nativeQueueId: collision.nativeQueueId,
      deferralKind: "unsupported_row",
      nativeValue: String(collision.rows),
      detail: `the source served queue id ${collision.nativeQueueId} ${collision.rows} times in one artifact; `
        + "raw evidence is retained for every row and no canonical request is created, because "
        + "choosing between them would assert something the publisher did not",
      locator: example?.locator ?? { extractionMethod: "json_object" },
    });
  }
  return collisions.sort((a, b) => (a.nativeQueueId < b.nativeQueueId ? -1 : 1));
}
