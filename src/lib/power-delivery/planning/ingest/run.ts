/** Orchestration: retrieve, parse, persist — one source at a time, isolated from the others. */

import { httpArtifactFetcher, PLANNING_COLLECTOR, type ArtifactFetcher } from "@/lib/power-delivery/planning/ingest/artifact";
import { persistPlanningExtraction, type PlanningWriteResult } from "@/lib/power-delivery/planning/ingest/store";
import { planningAdapter, planningBlocker, INGESTIBLE_PLANNING_SOURCES } from "@/lib/power-delivery/planning/ingest/registry";
import type { PlanningAdapter, RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

export type PlanningRunOutcome =
  | ({ status: "ingested" } & PlanningWriteResult)
  | { status: "parsed"; source: string; scenarios: number; records: number; nativeVintageKey: string }
  | { status: "blocked"; source: string; kind: string; reason: string }
  | { status: "failed"; source: string; error: string };

export type PlanningRunReport = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  outcomes: PlanningRunOutcome[];
};

export async function collectArtifacts(
  adapter: PlanningAdapter,
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
export async function runPlanningSource(
  sql: PlanningSqlExecutor | null,
  source: string,
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean },
): Promise<PlanningRunOutcome> {
  const adapter = planningAdapter(source);
  if (adapter === null) {
    const blocker = planningBlocker(source);
    if (blocker !== null) return { status: "blocked", source, kind: blocker.kind, reason: blocker.reason };
    return { status: "failed", source, error: `unknown planning source ${source}` };
  }
  try {
    const artifacts = await collectArtifacts(adapter, options?.fetcher ?? httpArtifactFetcher());
    const extraction = adapter.parse(artifacts);
    if (options?.dryRun === true || sql === null) {
      return {
        status: "parsed", source, scenarios: extraction.scenarios.length,
        records: extraction.records.length, nativeVintageKey: extraction.vintage.nativeVintageKey,
      };
    }
    const written = await persistPlanningExtraction(sql, adapter, artifacts, extraction, PLANNING_COLLECTOR);
    return { status: "ingested", ...written };
  } catch (error) {
    return { status: "failed", source, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export async function runPlanningIngestion(
  sql: PlanningSqlExecutor | null,
  sources: readonly string[],
  options?: { fetcher?: ArtifactFetcher; dryRun?: boolean },
): Promise<PlanningRunReport> {
  const startedAt = new Date().toISOString();
  const outcomes: PlanningRunOutcome[] = [];
  for (const source of sources) outcomes.push(await runPlanningSource(sql, source, options));
  return {
    ok: outcomes.every((outcome) => outcome.status !== "failed"),
    startedAt,
    completedAt: new Date().toISOString(),
    outcomes,
  };
}

export { INGESTIBLE_PLANNING_SOURCES };
