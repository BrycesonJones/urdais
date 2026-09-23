import { describe, expect, it, vi } from "vitest";

import {
  BackfillArgumentError, DEFAULT_CHUNK_DAYS, MAX_CHUNK_DAYS, ROWS_PER_UTC_HOUR,
  estimateBackfill, planBackfillChunks, runEiaBackfill,
} from "@/lib/flexible-capacity/backfill";
import { EIA_PAGE_LENGTH } from "@/lib/power-delivery/source/eia930";
import { localYearWindow } from "@/lib/flexible-capacity/period";

const HOUR_MS = 3_600_000;

const hoursCovered = (chunks: readonly { start: string; end: string }[]): number =>
  chunks.reduce((sum, chunk) =>
    sum + (Date.parse(`${chunk.end}:00:00Z`) - Date.parse(`${chunk.start}:00:00Z`)) / HOUR_MS + 1, 0);

describe("1. chunking is arithmetic, not taste", () => {
  it("keeps the largest allowed chunk inside one EIA page", () => {
    expect(MAX_CHUNK_DAYS * 24 * ROWS_PER_UTC_HOUR).toBeLessThanOrEqual(EIA_PAGE_LENGTH);
    expect((MAX_CHUNK_DAYS + 1) * 24 * ROWS_PER_UTC_HOUR).toBeGreaterThan(EIA_PAGE_LENGTH);
  });

  it("keeps the default chunk comfortably inside one page", () => {
    expect(DEFAULT_CHUNK_DAYS * 24 * ROWS_PER_UTC_HOUR).toBe(2352);
    expect(2352).toBeLessThan(EIA_PAGE_LENGTH);
  });

  it("refuses a chunk that would need a second page", () => {
    expect(() => planBackfillChunks("2025-01-01T00", "2025-12-31T23", MAX_CHUNK_DAYS + 1))
      .toThrow(BackfillArgumentError);
  });
});

describe("2. chunks tile the range exactly", () => {
  it("covers every hour once, with no overlap and no gap", () => {
    const chunks = planBackfillChunks("2025-01-01T00", "2025-01-31T23", 7);
    expect(hoursCovered(chunks)).toBe(31 * 24);
    for (const [index, chunk] of chunks.entries()) {
      if (index === 0) continue;
      const previousEnd = Date.parse(`${chunks[index - 1]!.end}:00:00Z`);
      expect(Date.parse(`${chunk.start}:00:00Z`)).toBe(previousEnd + HOUR_MS);
    }
  });

  it("gives the last chunk only the hours that remain", () => {
    const chunks = planBackfillChunks("2025-01-01T00", "2025-01-10T23", 7);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.hours).toBe(168);
    expect(chunks[1]!.hours).toBe(72);
  });

  it("handles a single-hour range", () => {
    const chunks = planBackfillChunks("2025-01-01T00", "2025-01-01T00", 7);
    expect(chunks).toEqual([{ start: "2025-01-01T00", end: "2025-01-01T00", hours: 1 }]);
  });

  it("rejects a reversed range and a malformed hour", () => {
    expect(() => planBackfillChunks("2025-02-01T00", "2025-01-01T00")).toThrow(/must not precede/);
    expect(() => planBackfillChunks("2025-01-01", "2025-01-02T00")).toThrow(/must be a UTC hour/);
  });
});

describe("3. estimating a range before requesting it", () => {
  it("reports a full ERCOT local year as 8,760 hours and 53 single-page requests", () => {
    const period = localYearWindow("ercot", 2025);
    const lastHour = new Date(Date.parse(period.endUtc) - HOUR_MS).toISOString().slice(0, 13);
    const estimate = estimateBackfill(period.startUtc.slice(0, 13), lastHour, 7);
    expect(estimate.hours).toBe(8760);
    expect(estimate.chunks).toBe(53);
    expect(estimate.requests).toBe(53);
    expect(estimate.expectedRows).toBe(8760 * ROWS_PER_UTC_HOUR);
    expect(estimate.expectedObservationsPerMetric).toBe(8760 * 7);
  });

  it("scales across three years, counting the leap day rather than assuming 365", () => {
    const single = estimateBackfill("2023-01-01T00", "2023-12-31T23", 7);
    const triple = estimateBackfill("2023-01-01T00", "2025-12-31T23", 7);
    expect(single.hours).toBe(365 * 24);
    // 2023 + 2024 + 2025 is 1,096 days, because 2024 is a leap year.
    expect(triple.hours).toBe((365 + 366 + 365) * 24);
    expect(triple.expectedRows).toBeGreaterThan(single.expectedRows * 2.9);
  });
});

describe("4. the runner delegates every chunk to the reviewed ingestion path", () => {
  /** A stand-in for the Power Delivery executor; the runner never touches SQL itself. */
  function recordingSql(): { query: ReturnType<typeof vi.fn> } {
    return { query: vi.fn().mockResolvedValue({ rows: [] }) };
  }

  it("runs one ingestion per chunk and totals the outcomes", async () => {
    vi.resetModules();
    const runPowerIngestion = vi.fn(async (_sql, input: { start: string; end: string }) => ({
      ok: true, outcome: "succeeded" as const, requestedStart: input.start, requestedEnd: input.end,
      retrievals: 1, rawRecords: 2352, inserted: 2352, revised: 0, unchanged: 0, unavailable: 0, errors: [],
    }));
    vi.doMock("@/lib/power-delivery/run", () => ({ runPowerIngestion }));
    const { runEiaBackfill: run } = await import("@/lib/flexible-capacity/backfill");

    const report = await run(recordingSql() as never, { start: "2025-01-01T00", end: "2025-01-21T23" }, { chunkDays: 7 });
    expect(runPowerIngestion).toHaveBeenCalledTimes(3);
    expect(report.ok).toBe(true);
    expect(report.chunksSucceeded).toBe(3);
    expect(report.rawRecords).toBe(3 * 2352);
    expect(report.inserted).toBe(3 * 2352);
    vi.doUnmock("@/lib/power-delivery/run");
    vi.resetModules();
  });

  it("keeps the surviving chunks when one fails, and names the window that failed", async () => {
    vi.resetModules();
    const runPowerIngestion = vi.fn(async (_sql, input: { start: string; end: string }) => {
      const failing = input.start === "2025-01-08T00";
      return {
        ok: !failing, outcome: failing ? ("failed" as const) : ("succeeded" as const),
        requestedStart: input.start, requestedEnd: input.end,
        retrievals: failing ? 0 : 1, rawRecords: failing ? 0 : 2352,
        inserted: failing ? 0 : 2352, revised: 0, unchanged: 0, unavailable: 0,
        errors: failing ? ["Eia930ContractError: EIA request failed with HTTP 503"] : [],
      };
    });
    vi.doMock("@/lib/power-delivery/run", () => ({ runPowerIngestion }));
    const { runEiaBackfill: run } = await import("@/lib/flexible-capacity/backfill");

    const report = await run(recordingSql() as never, { start: "2025-01-01T00", end: "2025-01-21T23" }, { chunkDays: 7 });
    expect(report.ok).toBe(false);
    expect(report.chunksAttempted).toBe(3);
    expect(report.chunksSucceeded).toBe(2);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0]!.chunk.start).toBe("2025-01-08T00");
    expect(report.failures[0]!.errors[0]).toMatch(/503/);
    // The other two chunks were still written: a bad week does not cost the year.
    expect(report.inserted).toBe(2 * 2352);
    vi.doUnmock("@/lib/power-delivery/run");
    vi.resetModules();
  });

  it("stops at the first failure when asked to", async () => {
    vi.resetModules();
    const runPowerIngestion = vi.fn(async (_sql, input: { start: string; end: string }) => ({
      ok: false, outcome: "failed" as const, requestedStart: input.start, requestedEnd: input.end,
      retrievals: 0, rawRecords: 0, inserted: 0, revised: 0, unchanged: 0, unavailable: 0,
      errors: ["boom"],
    }));
    vi.doMock("@/lib/power-delivery/run", () => ({ runPowerIngestion }));
    const { runEiaBackfill: run } = await import("@/lib/flexible-capacity/backfill");

    const report = await run(recordingSql() as never, { start: "2025-01-01T00", end: "2025-01-21T23" },
      { chunkDays: 7, stopOnError: true });
    expect(runPowerIngestion).toHaveBeenCalledTimes(1);
    expect(report.chunksPlanned).toBe(3);
    expect(report.chunksAttempted).toBe(1);
    vi.doUnmock("@/lib/power-delivery/run");
    vi.resetModules();
  });

  it("reports a rerun as unchanged rather than as new evidence", async () => {
    // Idempotence is the store's property, not this module's: a chunk whose bytes are already
    // recorded comes back with zero inserts. What is asserted here is that the runner reports
    // that honestly instead of counting the pass as fresh work.
    vi.resetModules();
    const runPowerIngestion = vi.fn(async (_sql, input: { start: string; end: string }) => ({
      ok: true, outcome: "succeeded" as const, requestedStart: input.start, requestedEnd: input.end,
      retrievals: 0, rawRecords: 0, inserted: 0, revised: 0, unchanged: 0, unavailable: 0, errors: [],
    }));
    vi.doMock("@/lib/power-delivery/run", () => ({ runPowerIngestion }));
    const { runEiaBackfill: run } = await import("@/lib/flexible-capacity/backfill");

    const report = await run(recordingSql() as never, { start: "2025-01-01T00", end: "2025-01-07T23" }, { chunkDays: 7 });
    expect(report.ok).toBe(true);
    expect(report.inserted).toBe(0);
    expect(report.revised).toBe(0);
    expect(report.retrievals).toBe(0);
    vi.doUnmock("@/lib/power-delivery/run");
    vi.resetModules();
  });
});

describe("5. the runner has no ingestion logic of its own", () => {
  it("never reaches for the EIA client or writes SQL directly", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/flexible-capacity/backfill.ts", "utf8"));
    // Comments discuss the retrieval path at length; the claim is about code, so read code.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/fetchEia930|insert into|source_retrievals|power_observations/);
    expect(code).toMatch(/runPowerIngestion/);
  });
});

/** Guards the exported surface the CLI depends on. */
describe("6. exported surface", () => {
  it("exposes planning, estimating and running", () => {
    expect(typeof planBackfillChunks).toBe("function");
    expect(typeof estimateBackfill).toBe("function");
    expect(typeof runEiaBackfill).toBe("function");
  });
});
