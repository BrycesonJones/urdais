/** Orchestration: retrieve, parse, persist — one source at a time, isolated from the others. */

import { CAPACITY_COLLECTOR } from "@/lib/power-delivery/capacity/ingest/artifact";
import { capacityAdapter, INGESTIBLE_CAPACITY_SOURCES } from "@/lib/power-delivery/capacity/ingest/registry";
import { persistCapacityExtraction, type CapacityWriteResult } from "@/lib/power-delivery/capacity/ingest/store";
import type { CapacityAdapter } from "@/lib/power-delivery/capacity/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { httpArtifactFetcher, type ArtifactFetcher } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

export type CapacityRunOutcome =
  | ({ status: "ingested" } & CapacityWriteResult)
  | {
      status: "parsed"; source: string; nativeVintageKey: string; scenarios: number; records: number;
      components: number; constraints: number; evidenceOnly: number;
    }
  | { status: "failed"; source: string; error: string };

export type CapacityRunReport = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  outcomes: CapacityRunOutcome[];
};

export async function collectCapacityArtifacts(
  adapter: CapacityAdapter,
  fetcher: ArtifactFetcher,
): Promise<Map<string, RetrievedArtifact>> {
  const artifacts = new Map<string, RetrievedArtifact>();
  for (const ref of adapter.artifacts) artifacts.set(ref.label, await fetcher(ref));
  return artifacts;
}

/**
 * One source. A failure here is contained: the write path runs in its own transaction, so a
 * publisher who has reorganised a workbook leaves every other market exactly as it was.
 */
export async function runCapacitySource(
  sql: CapacitySqlExecutor | null,
  source: string,
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean; batchSize?: number },
): Promise<CapacityRunOutcome> {
  const adapter = capacityAdapter(source);
  if (adapter === null) {
    return { status: "failed", source, error: `unknown capacity source ${source}` };
  }
  try {
    const artifacts = await collectCapacityArtifacts(adapter, options?.fetcher ?? httpArtifactFetcher());
    const extraction = adapter.parse(artifacts);
    if (options?.dryRun === true || sql === null) {
      const count = (kind: string) => extraction.records.filter((record) => record.target.kind === kind).length;
      return {
        status: "parsed", source, nativeVintageKey: extraction.vintage.nativeVintageKey,
        scenarios: extraction.scenarios.length, records: extraction.records.length,
        components: count("component"), constraints: count("constraint"), evidenceOnly: count("evidence_only"),
      };
    }
    const written = await persistCapacityExtraction(
      sql, adapter, artifacts, extraction, CAPACITY_COLLECTOR,
      options?.batchSize === undefined ? {} : { batchSize: options.batchSize },
    );
    return { status: "ingested", ...written };
  } catch (error) {
    return { status: "failed", source, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export async function runCapacityIngestion(
  sql: CapacitySqlExecutor | null,
  sources: readonly string[],
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean; batchSize?: number },
): Promise<CapacityRunReport> {
  const startedAt = new Date().toISOString();
  const outcomes: CapacityRunOutcome[] = [];
  for (const source of sources) outcomes.push(await runCapacitySource(sql, source, options));
  return {
    ok: outcomes.every((outcome) => outcome.status !== "failed"),
    startedAt,
    completedAt: new Date().toISOString(),
    outcomes,
  };
}

export { INGESTIBLE_CAPACITY_SOURCES };
