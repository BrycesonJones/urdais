/**
 * Deterministic provenance for a source row.
 *
 * Two retrievals of an unchanged month must produce the same hash, so that re-reading is a
 * no-op rather than a second vintage. The hash therefore covers the source identity and the
 * values, and deliberately excludes the retrieval time — otherwise every re-read would look
 * like a revision, and a revision would stop meaning anything.
 */

import { createHash } from "node:crypto";

import { identityKey } from "./identity";
import type { UmpiRawObservation, UmpiSourceIdentity } from "./types";

/** Canonical JSON: sorted keys, so key order in a source payload cannot change the digest. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
}

export function observationProvenanceHash(input: {
  identity: UmpiSourceIdentity;
  observation: UmpiRawObservation;
}): string {
  const { identity, observation } = input;
  return createHash("sha256")
    .update(canonical({ identity: identityKey(identity), observation }))
    .digest("hex");
}

/** A digest over a whole retrieved payload, for the run record. Order-sensitive by design. */
export function payloadDigest(rows: readonly unknown[]): string {
  return createHash("sha256").update(canonical(rows)).digest("hex");
}
