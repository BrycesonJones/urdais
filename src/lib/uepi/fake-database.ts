/**
 * An in-memory stand-in for the UEPI tables, good enough to prove what a retry does.
 *
 * It exists for one question a mock cannot answer: after a connection dies part-way through
 * writing a day and the caller reconnects and tries again, does production end up with one copy of
 * that day or two? Answering that needs transaction semantics -- staged writes that a rollback
 * discards and a commit keeps -- and the content-keyed conflict behaviour the real tables enforce
 * with unique indexes. Both are modelled here; nothing else is.
 *
 * Deliberately not a general SQL engine. It matches the handful of statements `storeOperatingDay`
 * issues, and throws on anything it does not recognise, so a change to the store that this fake
 * has not been taught about fails loudly instead of silently passing.
 */

import type { SqlExecutor } from "@/lib/uepi/store";

type Row = Record<string, unknown>;

type Tables = {
  retrievals: Row[];
  raw: Row[];
  observations: Row[];
  daily: Row[];
};

const empty = (): Tables => ({ retrievals: [], raw: [], observations: [], daily: [] });
const clone = (tables: Tables): Tables => JSON.parse(JSON.stringify(tables)) as Tables;

export class ConnectionTerminatedError extends Error {
  readonly code = "08006";
  constructor() {
    super("Connection terminated unexpectedly");
    this.name = "ConnectionTerminatedError";
  }
}

export class FakeDatabase {
  committed: Tables = empty();
  private staged: Tables | null = null;
  /** Statements executed since construction, for assertions about what the store did. */
  readonly statements: string[] = [];
  /** When set, the next matching statement throws once and the counter decrements. */
  private failures: { pattern: RegExp; remaining: number; error: () => Error }[] = [];

  failNext(pattern: RegExp, times = 1, error: () => Error = () => new ConnectionTerminatedError()): void {
    this.failures.push({ pattern, remaining: times, error });
  }

  private get active(): Tables {
    return this.staged ?? this.committed;
  }

  /** A caller-facing executor. A new one models a reconnection; the data outlives it, as it would. */
  executor(): SqlExecutor {
    return { query: (text, params) => this.query(text, params) };
  }

  private async query(text: string, params: readonly unknown[] = []): Promise<{ rows: Row[] }> {
    const sql = text.trim().replace(/\s+/g, " ");
    this.statements.push(sql);

    for (const failure of this.failures) {
      if (failure.remaining > 0 && failure.pattern.test(sql)) {
        failure.remaining -= 1;
        // A dropped connection loses the open transaction with it.
        this.staged = null;
        throw failure.error();
      }
    }

    if (/^begin$/i.test(sql)) { this.staged = clone(this.committed); return { rows: [] }; }
    if (/^commit$/i.test(sql)) { if (this.staged) this.committed = this.staged; this.staged = null; return { rows: [] }; }
    if (/^rollback$/i.test(sql)) { this.staged = null; return { rows: [] }; }

    if (/from reference.power_price_benchmarks where slug/i.test(sql)) return { rows: [{ id: "benchmark-1" }] };
    if (/from reference.methodology_versions/i.test(sql)) return { rows: [{ id: "version-1" }] };
    if (/from reference.source_interfaces where slug/i.test(sql)) return { rows: [{ id: "interface-1" }] };

    if (/^insert into pipeline.source_retrievals/i.test(sql)) {
      const key = params[1] as string;
      if (this.active.retrievals.some((r) => r.idempotency_key === key)) return { rows: [] };
      const row = { id: `retrieval-${this.active.retrievals.length + 1}`, idempotency_key: key };
      this.active.retrievals.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (/from pipeline.source_retrievals where idempotency_key/i.test(sql)) {
      const row = this.active.retrievals.find((r) => r.idempotency_key === params[0]);
      return { rows: row ? [{ id: row.id }] : [] };
    }

    if (/^insert into pipeline.raw_uepi_price_records/i.test(sql)) {
      const [retrievalId, , , hash] = params as [string, string, number, string];
      if (this.active.raw.some((r) => r.retrieval_id === retrievalId && r.record_hash === hash)) return { rows: [] };
      const row = { id: `raw-${this.active.raw.length + 1}`, retrieval_id: retrievalId, record_hash: hash };
      this.active.raw.push(row);
      return { rows: [{ id: row.id }] };
    }
    if (/from pipeline.raw_uepi_price_records where retrieval_id/i.test(sql)) {
      const row = this.active.raw.find((r) => r.retrieval_id === params[0] && r.record_hash === params[1]);
      return { rows: row ? [{ id: row.id }] : [] };
    }

    if (/from pipeline.uepi_price_observations where benchmark_id/i.test(sql)) {
      const row = this.active.observations.find(
        (o) => o.benchmark_id === params[0] && o.interval_start === params[1] && o.superseded_by_id === null);
      return { rows: row ? [{ id: row.id, price: row.price_usd_per_mwh }] : [] };
    }
    if (/^update pipeline.uepi_price_observations/i.test(sql)) {
      const row = this.active.observations.find((o) => o.id === params[2]);
      if (row) { row.superseded_by_id = params[0]; row.superseded_at = params[1]; }
      return { rows: [] };
    }
    if (/^insert into pipeline.uepi_price_observations/i.test(sql)) {
      const [id, , benchmarkId, , intervalStart, , , price] = params as string[];
      this.active.observations.push({
        id, benchmark_id: benchmarkId, interval_start: intervalStart,
        price_usd_per_mwh: price, superseded_by_id: null,
      });
      return { rows: [] };
    }

    if (/from pipeline.uepi_daily_values where benchmark_id/i.test(sql)) {
      const row = this.active.daily.find(
        (d) => d.benchmark_id === params[0] && d.operating_date === params[1] && d.superseded_by_id === null);
      return { rows: row ? [{ id: row.id, input_digest: row.input_digest }] : [] };
    }
    if (/^update pipeline.uepi_daily_values/i.test(sql)) {
      const row = this.active.daily.find((d) => d.id === params[2]);
      if (row) { row.superseded_by_id = params[0]; row.superseded_at = params[1]; }
      return { rows: [] };
    }
    if (/^insert into pipeline.uepi_daily_values/i.test(sql)) {
      const [id, benchmarkId, operatingDate, value] = params as string[];
      this.active.daily.push({
        id, benchmark_id: benchmarkId, operating_date: operatingDate, value_usd_per_mwh: value,
        input_digest: params[8], superseded_by_id: null,
      });
      return { rows: [] };
    }

    // Read used by the backfill's resume check.
    if (/from pipeline.uepi_daily_values v/i.test(sql)) {
      const row = this.committed.daily.find(
        (d) => d.operating_date === params[1] && d.superseded_by_id === null);
      return { rows: row ? [{ one: 1 }] : [] };
    }

    throw new Error(`the fake database was asked something it does not model: ${sql.slice(0, 120)}`);
  }

  /** Rows a reader would see: committed, not superseded. */
  current(): { observations: number; daily: number; retrievals: number; raw: number } {
    return {
      observations: this.committed.observations.filter((o) => o.superseded_by_id === null).length,
      daily: this.committed.daily.filter((d) => d.superseded_by_id === null).length,
      retrievals: this.committed.retrievals.length,
      raw: this.committed.raw.length,
    };
  }
}
