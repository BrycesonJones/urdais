/** Retrieval and hashing, shared by every planning source. */

import { createHash } from "node:crypto";

import type { PlanningArtifactRef, RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

export const PLANNING_COLLECTOR = "urdais-power-delivery-planning-v1" as const;

/**
 * Publishers serve these files to browsers and several of them refuse a bare client. This is the
 * same request a person downloading the workbook makes, and it identifies Urdais.
 */
const USER_AGENT = "UrdaisPlanningCollector/1.0 (+https://urdais.com; power-delivery planning forecasts)";

export function sha256(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export type ArtifactFetcher = (ref: PlanningArtifactRef) => Promise<RetrievedArtifact>;

export function httpArtifactFetcher(options?: { timeoutMs?: number }): ArtifactFetcher {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  return async (ref) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(ref.url, {
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "*/*", ...(ref.headers ?? {}) },
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (!response.ok) {
        throw new Error(`${ref.label}: ${ref.url} returned HTTP ${response.status}`);
      }
      return {
        label: ref.label,
        url: ref.url,
        retrievedAt: new Date().toISOString(),
        status: response.status,
        contentType: response.headers.get("content-type"),
        byteLength: body.byteLength,
        sha256: sha256(body),
        body,
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Deterministic identity for one extracted value, so a rerun writes no second copy of it. */
export function planningRecordHash(input: {
  artifactSha256: string;
  nativeGeography: string;
  nativePeriod: string;
  nativeScenario: string | null;
  nativeValue: string;
  nativeUnit: string;
  locator: Record<string, unknown>;
}): string {
  const locator = Object.keys(input.locator)
    .sort()
    .map((key) => [key, input.locator[key]] as const)
    .filter(([, value]) => value !== undefined);
  return createHash("sha256")
    .update(JSON.stringify([
      input.artifactSha256, input.nativeGeography, input.nativePeriod, input.nativeScenario,
      input.nativeValue, input.nativeUnit, locator,
    ]))
    .digest("hex");
}

/**
 * One retrieval per artifact and content. Re-fetching a byte-identical file resolves to the
 * retrieval already recorded; a changed file is a new retrieval and, downstream, a correction.
 */
export function planningRetrievalKey(source: string, artifact: RetrievedArtifact): string {
  return `planning|${source}|${artifact.label}|${artifact.sha256}`;
}
