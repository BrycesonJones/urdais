/**
 * One production news run, and the only place that defines what one is.
 *
 * Both callers — the operator command and the scheduled route — run this
 * function. Neither reimplements the pipeline, and neither can widen it: the
 * sources come from the registry, the mode is production, and there is no
 * parameter either caller could pass to change that. The route in particular
 * accepts no input at all, so an HTTP request cannot select a mode, a source,
 * or an endpoint.
 *
 * The run is category-agnostic on purpose. Today every enabled source is
 * Compute, so today it ingests Compute; when a later phase approves a Memory
 * feed, that feed joins this run by existing, and nothing here is edited.
 */

import { ingestNewsSources, retrieveFeed } from "@/lib/news/ingest";
import { enabledNewsSources } from "@/lib/news/sources";
import { loadStoredNewsIdentity, persistNewsRun, type NewsSqlExecutor } from "@/lib/news/sql";
import { InMemoryNewsStore } from "@/lib/news/store";
import type { NewsIngestRun, NewsSourceDefinition } from "@/lib/news/types";
import type { RetrievedFeed } from "@/lib/news/ingest";

export type ProductionRunResult = {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  retrievalsInserted: number;
  articlesInserted: number;
  run: NewsIngestRun;
};

export type ProductionRunOptions = {
  /** Restricted to one source for operator diagnostics. Never reachable from HTTP. */
  sources?: readonly NewsSourceDefinition[];
  retrieve?: (source: NewsSourceDefinition) => Promise<RetrievedFeed>;
  now?: () => Date;
};

/**
 * Retrieves every enabled source, normalizes and deduplicates, and writes what
 * is new. Safe to run repeatedly by construction: identity is deterministic and
 * the database holds the unique indexes, so a scheduler that fires twice — or
 * that Vercel delivers twice, which its own documentation says can happen —
 * writes nothing the first run already wrote.
 */
export async function runProductionNewsIngestion(
  sql: NewsSqlExecutor,
  options: ProductionRunOptions = {},
): Promise<ProductionRunResult> {
  const sources = options.sources ?? enabledNewsSources();
  const startedAt = (options.now?.() ?? new Date()).toISOString();

  // Seed with the identity already stored so the counts reported are what this
  // run wrote rather than what it offered. The unique indexes remain the
  // authority; this only keeps the report honest.
  const identity = await loadStoredNewsIdentity(sql, sources.map((source) => source.sourceInterfaceId));
  const store = new InMemoryNewsStore({ identity });

  const run = await ingestNewsSources({
    sources,
    mode: "production",
    store,
    retrieve: options.retrieve ?? ((source) => retrieveFeed(source, new Date())),
    now: options.now,
  });

  const written = await persistNewsRun(sql, { retrievals: store.retrievals, articles: store.all });
  const finishedAt = new Date().toISOString();

  return {
    startedAt,
    finishedAt,
    durationMs: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime()),
    sourcesAttempted: sources.length,
    sourcesSucceeded: run.sourcesSucceeded,
    sourcesFailed: run.sourcesFailed,
    retrievalsInserted: written.retrievalsInserted,
    articlesInserted: written.articlesInserted,
    run,
  };
}

/**
 * The structured line an operator or a log search needs to tell a broken feed
 * from a quiet one. Per-source counts and named diagnostics; no credential, no
 * connection string, no article body.
 */
export function productionRunSummary(result: ProductionRunResult) {
  return {
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.durationMs,
    sourcesAttempted: result.sourcesAttempted,
    sourcesSucceeded: result.sourcesSucceeded,
    sourcesFailed: result.sourcesFailed,
    retrievalsInserted: result.retrievalsInserted,
    articlesInserted: result.articlesInserted,
    sources: result.run.outcomes.map((outcome) =>
      outcome.ok
        ? {
            source: outcome.source,
            entriesParsed: outcome.report.entriesParsed,
            articlesInserted: outcome.report.articlesInserted,
            articlesAlreadyStored: outcome.report.articlesAlreadyStored,
            entriesRejected: outcome.report.entriesRejected,
            diagnostics: outcome.report.diagnostics,
          }
        : { source: outcome.source, failed: outcome.error },
    ),
  };
}
