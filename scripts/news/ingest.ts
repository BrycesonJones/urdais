/**
 * The news ingestion entry point.
 *
 *   npm run news:ingest -- --mode research                      (fixtures, no network)
 *   npm run news:ingest -- --mode research --live               (live GET, nothing published)
 *   DATABASE_URL=... npm run news:ingest -- --mode production --live --write
 *
 * Phase 1A schedules nothing. Recurring ingestion belongs to whatever runs the
 * deployed application, and Urdais has no deployed application yet, so adding a
 * scheduler now would mean adding an infrastructure platform for news alone.
 * The boundary is this command: a scheduler's only job is to invoke it on an
 * interval and read its exit code. It is safe to run repeatedly — a second run
 * over an unchanged feed writes nothing — which is the property a scheduler
 * needs and the reason one is not required to prove the architecture.
 *
 * Output is one JSON object: per-source counts, the diagnostics behind them,
 * and the failures. No secret is printed; the database URL is never echoed.
 */

import { loadFeedFixture } from "@/lib/news/fixtures";
import { ingestNewsSources, retrieveFeed, type RetrievedFeed } from "@/lib/news/ingest";
import { newsSourcesForCategory, NEWS_SOURCES, newsSource } from "@/lib/news/sources";
import { InMemoryNewsStore } from "@/lib/news/store";
import { loadStoredNewsIdentity, persistNewsRun } from "@/lib/news/sql";
import type { NewsIngestMode, NewsSourceDefinition } from "@/lib/news/types";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  return value;
}

function fixtureArtifact(source: NewsSourceDefinition): RetrievedFeed {
  const fixture = loadFeedFixture(source.slug);
  return {
    body: fixture.body,
    contentType: fixture.contentType,
    url: fixture.sourceUrl,
    requestedAt: fixture.retrievedAt,
    retrievedAt: fixture.retrievedAt,
    status: 200,
  };
}

async function main(): Promise<void> {
  const mode = option("mode", "research") as NewsIngestMode;
  if (mode !== "research" && mode !== "production") throw new Error("--mode must be research or production");
  const live = flag("live");
  const write = flag("write");

  const only = process.argv.includes("--source") ? option("source") : null;
  const sources = only ? [newsSource(only)] : newsSourcesForCategory("compute");
  if (sources.length === 0) throw new Error("no approved sources are enabled");
  if (mode === "production" && !live) {
    throw new Error("production ingestion reads the live feed; pass --live (fixtures are research evidence)");
  }

  const databaseUrl = write ? (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim() : "";
  if (write && databaseUrl === "") throw new Error("--write needs DATABASE_URL");

  const sql = write ? await createTokenSqlExecutor(databaseUrl) : null;
  try {
    // Seed the run with what is already stored so the counts it reports are
    // what it wrote, not what it offered. The unique indexes are still the
    // authority; this only keeps the report honest.
    const identity = sql
      ? await loadStoredNewsIdentity(sql, sources.map((source) => source.sourceInterfaceId))
      : [];
    const store = new InMemoryNewsStore({ identity });

    const run = await ingestNewsSources({
      sources,
      mode,
      store,
      retrieve: (source) => (live ? retrieveFeed(source, new Date()) : Promise.resolve(fixtureArtifact(source))),
    });

    const written = sql
      ? await persistNewsRun(sql, { retrievals: store.retrievals, articles: store.all })
      : null;

    console.log(
      JSON.stringify(
        {
          mode,
          acquisition: live ? "live" : "fixture",
          persisted: written !== null,
          startedAt: run.startedAt,
          sourcesSucceeded: run.sourcesSucceeded,
          sourcesFailed: run.sourcesFailed,
          articlesInserted: written ? written.articlesInserted : run.articlesInserted,
          retrievalsInserted: written?.retrievalsInserted ?? null,
          sources: run.outcomes.map((outcome) =>
            outcome.ok
              ? {
                  source: outcome.source,
                  feed: NEWS_SOURCES[outcome.source].feedUrl,
                  entriesParsed: outcome.report.entriesParsed,
                  articlesInserted: outcome.report.articlesInserted,
                  articlesAlreadyStored: outcome.report.articlesAlreadyStored,
                  entriesRejected: outcome.report.entriesRejected,
                  diagnostics: outcome.report.diagnostics,
                }
              : { source: outcome.source, failed: outcome.error },
          ),
        },
        null,
        2,
      ),
    );

    // A run in which every source failed is a failed run, and the exit code
    // says so, because a scheduler reads exit codes and not prose.
    if (run.sourcesSucceeded === 0) process.exitCode = 1;
  } finally {
    await sql?.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
