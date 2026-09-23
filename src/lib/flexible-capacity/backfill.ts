/**
 * Historical EIA-930 backfill.
 *
 * Flexible Capacity needs years of hourly demand where the scheduled job collects a rolling three
 * days. This module supplies the history and deliberately supplies nothing else: every chunk goes
 * through `runPowerIngestion`, which is the same reviewed retrieval, parsing, provenance,
 * supersession and ledger path the production cron uses. There is no second ingestion route, no
 * second representation of hourly demand, and no Flexible Capacity table holding load.
 *
 * Why chunks rather than one long window.
 *
 * `fetchEia930` pages until it has the whole window and returns every page, response bodies
 * included, in memory at once. A calendar year is roughly 123,000 rows across ~25 pages; asking
 * for it in one call would hold all of that at once and lose the whole year to a single failure at
 * hour 8,000. Chunking bounds memory to one page, makes each chunk independently retryable, and
 * turns resumption into "run the same range again" -- an already-recorded chunk is recognised by
 * its retrieval idempotency key and returns without touching an observation.
 *
 * Chunk size is arithmetic, not taste. The EIA page length is 5,000 rows and a request covers
 * seven balancing authorities x two metrics = 14 rows per UTC hour, so a chunk of N days is
 * 336N rows and stays inside one page while N <= 14. The default of 7 leaves an ample margin and
 * makes a year 52 chunks, which is a sensible granularity to restart at.
 *
 * Both metrics come back because `buildEia930Parameters` facets D and DF in one query. Requesting
 * actual demand alone would mean a second request shape, a second idempotency-key space over the
 * same hours, and a divergence between what the backfill and the cron collect. Carrying the
 * day-ahead forecast is much the cheaper of the two.
 */

import { runPowerIngestion, type PowerRunResult } from "@/lib/power-delivery/run";
import type { PowerSqlExecutor } from "@/lib/power-delivery/store";

/** Rows an EIA request yields per UTC hour: seven balancing authorities x {D, DF}. */
export const ROWS_PER_UTC_HOUR = 14;

/** `EIA_PAGE_LENGTH` is 5,000; 14 days x 24 h x 14 rows = 4,704 is the largest single-page chunk. */
export const MAX_CHUNK_DAYS = 14;

export const DEFAULT_CHUNK_DAYS = 7;

const HOUR_MS = 3_600_000;

export class BackfillArgumentError extends Error {
  constructor(detail: string) {
    super(`EIA backfill arguments are invalid: ${detail}`);
    this.name = "BackfillArgumentError";
  }
}

/** One request window. Both bounds are inclusive UTC hours, as the EIA API defines them. */
export type BackfillChunk = {
  readonly start: string;
  readonly end: string;
  readonly hours: number;
};

function parseUtcHour(value: string, field: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(value)) {
    throw new BackfillArgumentError(`${field} must be a UTC hour (YYYY-MM-DDTHH), received '${value}'`);
  }
  const parsed = Date.parse(`${value}:00:00Z`);
  if (Number.isNaN(parsed)) throw new BackfillArgumentError(`${field} is not a real UTC hour: ${value}`);
  return parsed;
}

const utcHour = (ms: number): string => new Date(ms).toISOString().slice(0, 13);

/**
 * Cut an inclusive UTC-hour range into consecutive chunks. Chunks tile the range exactly: no hour
 * appears in two chunks and none is skipped, so the union of every chunk is the requested range.
 */
export function planBackfillChunks(
  start: string, end: string, chunkDays: number = DEFAULT_CHUNK_DAYS,
): BackfillChunk[] {
  const from = parseUtcHour(start, "start");
  const to = parseUtcHour(end, "end");
  if (to < from) throw new BackfillArgumentError("end must not precede start");
  if (!Number.isInteger(chunkDays) || chunkDays < 1 || chunkDays > MAX_CHUNK_DAYS) {
    throw new BackfillArgumentError(
      `chunkDays must be an integer between 1 and ${MAX_CHUNK_DAYS}; ${chunkDays * 24 * ROWS_PER_UTC_HOUR} rows would not fit one EIA page`);
  }
  const chunkHours = chunkDays * 24;
  const chunks: BackfillChunk[] = [];
  for (let cursor = from; cursor <= to; cursor += chunkHours * HOUR_MS) {
    const last = Math.min(cursor + (chunkHours - 1) * HOUR_MS, to);
    chunks.push({ start: utcHour(cursor), end: utcHour(last), hours: (last - cursor) / HOUR_MS + 1 });
  }
  return chunks;
}

export type BackfillChunkOutcome = {
  readonly chunk: BackfillChunk;
  readonly ok: boolean;
  readonly outcome: PowerRunResult["outcome"];
  readonly retrievals: number;
  readonly rawRecords: number;
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly unavailable: number;
  readonly errors: readonly string[];
};

export type BackfillReport = {
  readonly ok: boolean;
  readonly requestedStart: string;
  readonly requestedEnd: string;
  readonly chunkDays: number;
  readonly chunksPlanned: number;
  readonly chunksAttempted: number;
  readonly chunksSucceeded: number;
  readonly chunksFailed: number;
  readonly retrievals: number;
  readonly rawRecords: number;
  readonly inserted: number;
  readonly revised: number;
  readonly unchanged: number;
  readonly unavailable: number;
  readonly elapsedMs: number;
  readonly failures: readonly { readonly chunk: BackfillChunk; readonly errors: readonly string[] }[];
};

export type BackfillOptions = {
  readonly chunkDays?: number;
  /** Stop at the first failing chunk instead of continuing. Default false. */
  readonly stopOnError?: boolean;
  /** Progress callback, invoked once per chunk after it is written. */
  readonly onChunk?: (outcome: BackfillChunkOutcome, index: number, total: number) => void;
  readonly now?: () => number;
};

/**
 * Run a historical backfill across the range, one chunk at a time.
 *
 * A failing chunk does not abandon the range by default: the remaining chunks are independent
 * requests over different hours, and the successful ones are worth keeping. Every failure is
 * reported with the exact window that produced it, so re-running just that window is trivial and
 * costs nothing where the hours are already present.
 */
export async function runEiaBackfill(
  sql: PowerSqlExecutor,
  input: { start: string; end: string },
  options: BackfillOptions = {},
): Promise<BackfillReport> {
  const chunkDays = options.chunkDays ?? DEFAULT_CHUNK_DAYS;
  const chunks = planBackfillChunks(input.start, input.end, chunkDays);
  const clock = options.now ?? (() => Date.now());
  const startedAt = clock();

  let attempted = 0, succeeded = 0;
  const totals = { retrievals: 0, rawRecords: 0, inserted: 0, revised: 0, unchanged: 0, unavailable: 0 };
  const failures: { chunk: BackfillChunk; errors: readonly string[] }[] = [];

  for (const [index, chunk] of chunks.entries()) {
    attempted += 1;
    let outcome: BackfillChunkOutcome;
    try {
      const run = await runPowerIngestion(sql, { start: chunk.start, end: chunk.end, trigger: "backfill" });
      outcome = {
        chunk, ok: run.ok, outcome: run.outcome, retrievals: run.retrievals, rawRecords: run.rawRecords,
        inserted: run.inserted, revised: run.revised, unchanged: run.unchanged,
        unavailable: run.unavailable, errors: run.errors,
      };
    } catch (error) {
      // runPowerIngestion writes its own ledger row and swallows per-page errors; reaching here
      // means the ledger write itself failed, which is worth surfacing as the chunk's failure.
      outcome = {
        chunk, ok: false, outcome: "failed", retrievals: 0, rawRecords: 0, inserted: 0, revised: 0,
        unchanged: 0, unavailable: 0,
        errors: [error instanceof Error ? `${error.name}: ${error.message}` : String(error)],
      };
    }

    totals.retrievals += outcome.retrievals;
    totals.rawRecords += outcome.rawRecords;
    totals.inserted += outcome.inserted;
    totals.revised += outcome.revised;
    totals.unchanged += outcome.unchanged;
    totals.unavailable += outcome.unavailable;
    if (outcome.ok) succeeded += 1; else failures.push({ chunk, errors: outcome.errors });

    options.onChunk?.(outcome, index, chunks.length);
    if (!outcome.ok && options.stopOnError === true) break;
  }

  return {
    ok: failures.length === 0,
    requestedStart: input.start, requestedEnd: input.end,
    chunkDays, chunksPlanned: chunks.length, chunksAttempted: attempted,
    chunksSucceeded: succeeded, chunksFailed: failures.length,
    ...totals,
    elapsedMs: clock() - startedAt,
    failures,
  };
}

/** What a range will cost, computed before anything is requested. */
export type BackfillEstimate = {
  readonly hours: number;
  readonly chunks: number;
  readonly requests: number;
  readonly expectedRows: number;
  readonly expectedObservationsPerMetric: number;
};

export function estimateBackfill(
  start: string, end: string, chunkDays: number = DEFAULT_CHUNK_DAYS,
): BackfillEstimate {
  const chunks = planBackfillChunks(start, end, chunkDays);
  const hours = chunks.reduce((sum, chunk) => sum + chunk.hours, 0);
  return {
    hours,
    chunks: chunks.length,
    // One page per chunk by construction, so requests and chunks are the same number.
    requests: chunks.length,
    expectedRows: hours * ROWS_PER_UTC_HOUR,
    expectedObservationsPerMetric: hours * (ROWS_PER_UTC_HOUR / 2),
  };
}
