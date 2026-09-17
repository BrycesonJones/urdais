/**
 * Developer path for UGAI end-of-day equity closes.
 *
 *   npm run ugai:prices -- --venue XTAI --date 2026-09-16
 *   npm run ugai:prices -- --venue XTAI --date 2026-09-16 --code 2330
 *   npm run ugai:prices -- --venue XTAI --date 2026-09-16 --from-file fixture.json
 *
 * Deliberately a manual, bounded invocation and not a schedule. Phase 5.3 proves the
 * implementation against controlled runs; whether it may run unattended against production is
 * the next phase's question, and blurring the two would answer it by default.
 *
 * `--mode production` is refused here regardless of what the registry says. The rights gate in
 * the database is the authority on whether a production observation is admissible, and this
 * script is not the place to exercise it for the first time.
 */

import { readFileSync } from "node:fs";

import pg from "pg";

import { createTwseAdapter, TWSE_DAILY_SLUG, TWSE_VENUE_MIC } from "@/lib/ugai/prices/sources/twse";
import {
  canonicalise,
  loadSourceLineage,
  resolveListing,
  writeClose,
  type SqlExecutor,
} from "@/lib/ugai/prices/store";
import { PriceContractError } from "@/lib/ugai/prices/types";

function arg(name: string, fallback?: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = process.argv[index + 1];
  if (index === -1 || !value) {
    if (fallback !== undefined) return fallback;
    throw new Error(`--${name} is required`);
  }
  return value;
}

function optional(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

async function main(): Promise<void> {
  const venue = arg("venue");
  const date = arg("date");
  const only = optional("code");
  const fromFile = optional("from-file");

  if (process.argv.includes("--mode") && optional("mode") === "production") {
    throw new Error(
      "production ingestion is not available in Phase 5.3; production verification is a separate phase",
    );
  }
  if (venue !== TWSE_VENUE_MIC) {
    throw new Error(
      `no adapter for venue ${venue}. Implemented: ${TWSE_VENUE_MIC}. Nasdaq (XNAS/XNGS) has no rights-cleared public source.`,
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be an ISO calendar date");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const fetcher = fromFile
    ? async () => JSON.parse(readFileSync(fromFile, "utf8")) as unknown
    : async (url: string) => {
        const response = await fetch(url, {
          headers: { "User-Agent": "Urdais Research (research retrieval)" },
        });
        if (!response.ok) throw new PriceContractError(`${url} returned HTTP ${response.status}`);
        return (await response.json()) as unknown;
      };

  const adapter = createTwseAdapter(fetcher);
  const pool = new pg.Pool({ connectionString, max: 1 });
  const sql: SqlExecutor = {
    query: (text, params) => pool.query(text, params as unknown[]),
  };

  try {
    const lineage = await loadSourceLineage(sql, TWSE_DAILY_SLUG);
    const retrievedAt = new Date().toISOString();
    const parsed = await adapter.fetchCloses(date);
    const selected = only ? parsed.filter((c) => c.listingRef.localCode === only) : parsed;

    let written = 0;
    let unchanged = 0;
    let corrected = 0;
    let unresolved = 0;

    for (const close of selected) {
      const listingId = await resolveListing(
        sql,
        close.listingRef.venueMic,
        close.listingRef.localCode,
        close.tradingDate,
      );
      // The overwhelming majority of a venue's lines are not in the UGAI security master, and
      // that is the normal case rather than an error: the universe is a few dozen issuers and
      // the exchange lists thousands.
      if (!listingId) {
        unresolved += 1;
        continue;
      }
      const outcome = await writeClose(
        sql,
        canonicalise(close, listingId, lineage, TWSE_DAILY_SLUG, retrievedAt, "research"),
      );
      if (outcome === "inserted") written += 1;
      else if (outcome === "corrected") corrected += 1;
      else unchanged += 1;
    }

    process.stdout.write(
      `${venue} ${date}: ${written} inserted, ${corrected} corrected, ${unchanged} unchanged, ` +
        `${unresolved} source rows not in the security master (of ${selected.length} read)\n`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
