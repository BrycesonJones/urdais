/**
 * The daily UBWI publication run.
 *
 * Every test here injects the observation instant. Nothing reads the wall clock, so a run
 * at 23:59:59 on the machine executing the suite behaves exactly as one at noon, and a
 * test cannot start passing or failing because of when it happened to run.
 *
 * Nothing here opens a socket either. The fake below answers the pipeline's queries from
 * memory, which is what lets the idempotency and cadence rules be tested without a live
 * Chainlink feed, a Bitcoin node, an RPC endpoint or a database.
 */
import { describe, expect, it } from "vitest";

import { calculateUbwi } from "@/lib/ubwi/calculate";
import { CHAINLINK_BTC_USD_FEED } from "@/lib/ubwi/chainlink";
import { evaluateGate } from "@/lib/ubwi/gate";
import { OBSERVED_ECONOMIES } from "@/lib/ubwi/observations";
import { PRODUCTION_BTC_OBSERVATION } from "@/lib/ubwi/numerator";
import type { BtcMarketObservation, UbwiCalculation } from "@/lib/ubwi/types";
import {
  UBWI_DAILY_CRON_PATH,
  UBWI_DAILY_CRON_SCHEDULE,
  UBWI_DAILY_OBSERVATION_UTC_HOUR,
  priceRoundAgeSeconds,
  runDailyUbwiPublication,
  ubwiObservationDate,
  ubwiRunSummary,
  type UbwiSql,
} from "./run";

/**
 * The instant the real production point was frozen, and the feed round behind it. Used as
 * the reference "fresh" moment so the fixtures describe an observation that was genuinely
 * current, rather than one invented to pass.
 */
const FROZEN_AT = "2026-09-15T04:33:47.738Z";
const FRESH_NOW = new Date((PRODUCTION_BTC_OBSERVATION.chainlink!.updatedAt + 600) * 1000).toISOString();

type PublicationRow = {
  id: string;
  calculation_id: string;
  published_at: string;
  frozen_at: string;
  superseded_by_id: string | null;
};

class UniqueViolation extends Error {
  code = "23505";
}

/**
 * An in-memory stand-in for the production schema: enough of it to exercise every
 * identity the pipeline depends on, including the daily unique index.
 */
class FakeUbwiDatabase {
  vintages: { id: string; ruleId: string; referenceDate: string; observed: number }[] = [];
  observations: { id: string; blockHeight: number; observedAt: string }[] = [];
  calculations: { id: string; vintageId: string; btcId: string; mvId: string; gatePassed: boolean; reason: string }[] = [];
  publications: PublicationRow[] = [];
  /** Every statement executed, so a test can assert that nothing was written. */
  statements: string[] = [];
  /**
   * Hide existing points from the daily pre-check while still enforcing the unique index
   * on insert. This is the one state the application check cannot see for itself: two
   * runs that both read an empty day before either of them writes.
   */
  hideFromDailyCheck = false;
  private next = 0;

  private id(prefix: string): string {
    this.next += 1;
    return `${prefix}-${this.next}`;
  }

  /** Seed a frozen publication directly, as a previous day's run would have left one. */
  seedPublication(publishedAt: string, options: { superseded?: boolean } = {}): PublicationRow {
    const row: PublicationRow = {
      id: this.id("pub"),
      calculation_id: this.id("calc"),
      published_at: publishedAt,
      frozen_at: publishedAt,
      superseded_by_id: options.superseded === true ? "pub-superseding" : null,
    };
    this.publications.push(row);
    return row;
  }

  private utcDate(iso: string): string {
    return new Date(iso).toISOString().slice(0, 10);
  }

  get sql(): UbwiSql {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the executor closes over the fake.
    const db = this;
    return {
      async query(text: string, params: readonly unknown[]) {
        db.statements.push(text.trim().split("\n")[0]!.trim());
        const t = text.trim();

        if (/^(begin|commit|rollback)$/i.test(t)) return { rows: [] };

        if (t.startsWith("select id from reference.")) return { rows: [{ id: db.id("ref") }] };
        if (t.startsWith("select mv.id from reference.methodology_versions")) {
          return { rows: [{ id: "mv-1" }] };
        }

        if (t.startsWith("select id from pipeline.wealth_vintages")) {
          const [, referenceDate, observed] = params as [string, string, number];
          const found = db.vintages.find(
            (v) => v.referenceDate === referenceDate && Math.abs(v.observed - observed) <= observed * 1e-9,
          );
          return { rows: found ? [{ id: found.id }] : [] };
        }
        if (t.startsWith("insert into pipeline.wealth_vintages")) {
          const row = {
            id: db.id("vintage"),
            ruleId: String(params[0]),
            referenceDate: String(params[1]),
            observed: Number(params[3]),
          };
          db.vintages.push(row);
          return { rows: [{ id: row.id }] };
        }

        if (t.startsWith("select id from pipeline.btc_market_observations")) {
          const [blockHeight, observedAt] = params as [number, string];
          const found = db.observations.find(
            (o) => o.blockHeight === blockHeight && o.observedAt === observedAt,
          );
          return { rows: found ? [{ id: found.id }] : [] };
        }
        if (t.startsWith("insert into pipeline.btc_market_observations")) {
          const row = { id: db.id("btc"), observedAt: String(params[0]), blockHeight: Number(params[1]) };
          db.observations.push(row);
          return { rows: [{ id: row.id }] };
        }

        if (t.startsWith("select id from pipeline.ubwi_calculations")) {
          const [vintageId, btcId, mvId] = params as [string, string, string];
          const found = db.calculations.find(
            (c) => c.vintageId === vintageId && c.btcId === btcId && c.mvId === mvId,
          );
          return { rows: found ? [{ id: found.id }] : [] };
        }
        if (t.startsWith("insert into pipeline.ubwi_calculations")) {
          const row = {
            id: db.id("calc"),
            instrumentId: String(params[0]),
            vintageId: String(params[5]),
            btcId: String(params[4]),
            mvId: String(params[2]),
            gatePassed: Boolean(params[15]),
            reason: String(params[17]),
          };
          db.calculations.push(row);
          return { rows: [{ id: row.id }] };
        }

        if (t.startsWith("select id from pipeline.ubwi_publications")) {
          if (t.includes("calculation_id = $1")) {
            const found = db.publications.find((p) => p.calculation_id === String(params[0]));
            return { rows: found ? [{ id: found.id }] : [] };
          }
          if (t.includes("at time zone 'utc'")) {
            if (db.hideFromDailyCheck) return { rows: [] };
            const wanted = String(params[0]);
            const found = db.publications.find(
              (p) => p.superseded_by_id === null && db.utcDate(p.published_at) === wanted,
            );
            return { rows: found ? [{ id: found.id }] : [] };
          }
          const any = db.publications.find((p) => p.superseded_by_id === null);
          return { rows: any ? [{ id: any.id }] : [] };
        }
        if (t.startsWith("insert into pipeline.ubwi_publications")) {
          const publishedAt = String(params[1]);
          // The daily partial unique index, enforced here as the database enforces it.
          if (
            db.publications.some(
              (p) => p.superseded_by_id === null && db.utcDate(p.published_at) === db.utcDate(publishedAt),
            )
          ) {
            // The race is over the moment the index refuses: the winner's row is now
            // visible to everyone, including the loser looking up what it lost to.
            db.hideFromDailyCheck = false;
            throw new UniqueViolation("duplicate key value violates unique constraint");
          }
          const row: PublicationRow = {
            id: db.id("pub"),
            calculation_id: String(params[0]),
            published_at: publishedAt,
            frozen_at: publishedAt,
            superseded_by_id: null,
          };
          db.publications.push(row);
          return { rows: [{ id: row.id }] };
        }

        // Component, scenario, height, chainlink and venue inserts return nothing.
        return { rows: [] };
      },
    };
  }
}

/**
 * The production numerator observation, re-timed as a reading genuinely taken at `nowIso`.
 *
 * Height, supply, price and every lineage field are the real production ones: only the
 * instants move, which is what a fresh reading on a later day looks like when the chain
 * tip and the price happen to be unchanged. The observation instant differs, so each day
 * is a distinct numerator observation under the pipeline's own (height, instant) identity.
 */
function freshNumeratorAt(nowIso: string): BtcMarketObservation {
  const nowUnix = Math.floor(Date.parse(nowIso) / 1000);
  const feed = PRODUCTION_BTC_OBSERVATION.chainlink!;
  const observedAt = new Date((nowUnix - 60) * 1000).toISOString().replace(".000Z", "Z");
  return {
    ...PRODUCTION_BTC_OBSERVATION,
    observedAt,
    heightObservations: PRODUCTION_BTC_OBSERVATION.heightObservations?.map((reading) => ({
      ...reading,
      retrievedAt: observedAt,
    })),
    chainlink: {
      ...feed,
      startedAt: nowUnix - 347,
      updatedAt: nowUnix - 300,
      retrievalTimestamp: nowUnix - 60,
    },
  };
}

/** A calculation from a numerator that is current at the observation instant. */
function calculationAt(calculatedAt: string): UbwiCalculation {
  return calculateUbwi({ calculatedAt, numerator: freshNumeratorAt(calculatedAt) });
}

describe("the scheduled observation date", () => {
  it("is the UTC calendar date of the observation instant", () => {
    expect(ubwiObservationDate("2026-09-15T04:33:47.738Z")).toBe("2026-09-15");
    expect(ubwiObservationDate("2026-09-15T06:00:00.000Z")).toBe("2026-09-15");
    expect(ubwiObservationDate("2026-09-15T23:59:59.999Z")).toBe("2026-09-15");
    expect(ubwiObservationDate("2026-09-16T00:00:00.000Z")).toBe("2026-09-16");
  });

  it("does not depend on the machine's local time zone", () => {
    // 2026-09-15T23:30Z is already 2026-09-16 in Tokyo and still 2026-09-15 in New York.
    // The observation date is neither of those readings; it is the UTC one.
    expect(ubwiObservationDate(new Date("2026-09-15T23:30:00.000Z"))).toBe("2026-09-15");
  });
});

describe("the daily schedule", () => {
  it("is a fixed UTC hour, away from both midnight boundaries", () => {
    expect(UBWI_DAILY_CRON_SCHEDULE).toBe(`0 ${UBWI_DAILY_OBSERVATION_UTC_HOUR} * * *`);
    expect(UBWI_DAILY_OBSERVATION_UTC_HOUR).toBeGreaterThan(0);
    expect(UBWI_DAILY_OBSERVATION_UTC_HOUR).toBeLessThan(23);
  });

  it("is once per day, and not more often", () => {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = UBWI_DAILY_CRON_SCHEDULE.split(" ");
    expect(minute).toMatch(/^\d+$/);
    expect(hour).toMatch(/^\d+$/);
    expect([dayOfMonth, month, dayOfWeek]).toEqual(["*", "*", "*"]);
  });

  it("is registered in vercel.json at exactly that path and schedule, alongside the news job", async () => {
    const { readFileSync } = await import("node:fs");
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as {
      crons: { path: string; schedule: string }[];
    };
    const ubwi = config.crons.find((cron) => cron.path === UBWI_DAILY_CRON_PATH);
    expect(ubwi, "the UBWI cron must be declared in vercel.json").toBeDefined();
    expect(ubwi!.schedule).toBe(UBWI_DAILY_CRON_SCHEDULE);
    // And it does not collide with the news job's midnight slot.
    const news = config.crons.find((cron) => cron.path === "/api/cron/news");
    expect(news!.schedule).toBe("0 0 * * *");
    expect(ubwi!.schedule).not.toBe(news!.schedule);
  });
});

describe("price-round freshness", () => {
  it("measures the round's age at the observation instant, not at retrieval", () => {
    // The production observation was read 493 s after its round was written, and that
    // number is frozen on it forever. Its age *now* is a different measurement.
    const calculation = calculateUbwi({ calculatedAt: FRESH_NOW });
    expect(priceRoundAgeSeconds(calculation, FRESH_NOW)).toBe(600);
    expect(priceRoundAgeSeconds(calculationAt(FRESH_NOW), FRESH_NOW)).toBe(300);
  });

  it("refuses to publish a round older than the feed heartbeat, and writes nothing", async () => {
    const db = new FakeUbwiDatabase();
    // A day later, still carrying the production observation: the round is now roughly
    // 86,000 seconds old against a 3,600-second heartbeat. This is exactly the case a
    // daily scheduler would otherwise turn into a second point wearing a new date while
    // carrying the first point's price.
    const tomorrow = new Date(Date.parse(FRESH_NOW) + 86_400_000).toISOString();
    const result = await runDailyUbwiPublication(db.sql, {
      now: tomorrow,
      calculation: calculateUbwi({ calculatedAt: tomorrow }),
    });

    expect(result.outcome).toBe("observation_stale");
    expect(result.publicationId).toBeNull();
    expect(result.priceAgeSeconds!).toBeGreaterThan(CHAINLINK_BTC_USD_FEED.heartbeatSeconds);
    expect(db.publications).toHaveLength(0);
    expect(db.calculations).toHaveLength(0);
    expect(db.statements, "nothing may be written before freshness is established").toEqual([]);
  });
});

describe("a publishing day", () => {
  it("freezes one point and stamps it at the observation instant", async () => {
    const db = new FakeUbwiDatabase();
    const result = await runDailyUbwiPublication(db.sql, {
      now: FRESH_NOW,
      calculation: calculationAt(FRESH_NOW),
    });

    expect(result.outcome).toBe("published");
    expect(result.publicationId).not.toBeNull();
    expect(result.observationDate).toBe(ubwiObservationDate(FRESH_NOW));
    expect(db.publications).toHaveLength(1);
    expect(db.publications[0]!.published_at).toBe(FRESH_NOW);
    expect(db.publications[0]!.frozen_at).toBe(FRESH_NOW);
  });

  it("records that the first point has no predecessor, and does not repeat that on day two", async () => {
    const db = new FakeUbwiDatabase();
    await runDailyUbwiPublication(db.sql, { now: FRESH_NOW, calculation: calculationAt(FRESH_NOW) });
    expect(db.calculations[0]!.reason).toBe("no previous production observation exists");

    const nextDay = "2026-09-16T06:00:00.000Z";
    await runDailyUbwiPublication(db.sql, { now: nextDay, calculation: calculationAt(nextDay) });
    expect(db.calculations).toHaveLength(2);
    expect(db.calculations[1]!.reason).not.toBe("no previous production observation exists");
    expect(db.calculations[1]!.reason).toContain("read model");
  });
});

describe("daily idempotency", () => {
  const sameDayRun = (db: FakeUbwiDatabase, now: string) =>
    runDailyUbwiPublication(db.sql, { now, calculation: calculationAt(now) });

  it("a second invocation on the same observation date adds no second point", async () => {
    const db = new FakeUbwiDatabase();
    const first = await sameDayRun(db, FRESH_NOW);
    const second = await sameDayRun(db, FRESH_NOW);

    expect(first.outcome).toBe("published");
    expect(second.outcome).toBe("already_published");
    expect(second.publicationId).toBe(first.publicationId);
    expect(db.publications).toHaveLength(1);
  });

  it("converges on the same point at a different time of the same UTC day", async () => {
    // A scheduler retry an hour later, or an operator running the command by hand.
    const db = new FakeUbwiDatabase();
    const first = await sameDayRun(db, "2026-09-15T06:00:00.000Z");
    const retry = await sameDayRun(db, "2026-09-15T07:30:00.000Z");
    expect(retry.outcome).toBe("already_published");
    expect(retry.publicationId).toBe(first.publicationId);
    expect(db.publications).toHaveLength(1);
  });

  it("writes nothing at all on the repeat run", async () => {
    const db = new FakeUbwiDatabase();
    await sameDayRun(db, FRESH_NOW);
    const before = db.statements.length;
    await sameDayRun(db, FRESH_NOW);
    // Exactly one statement: the daily check that found the existing point.
    expect(db.statements.slice(before)).toHaveLength(1);
    expect(db.statements[before]).toContain("select id from pipeline.ubwi_publications");
  });

  it("does not use the current timestamp as the uniqueness key", async () => {
    // Two runs a second apart have different timestamps and the same observation date.
    // A timestamp key would let both through; the date key does not.
    const db = new FakeUbwiDatabase();
    await sameDayRun(db, "2026-09-15T06:00:00.000Z");
    await sameDayRun(db, "2026-09-15T06:00:01.000Z");
    expect(db.publications).toHaveLength(1);
  });

  it("converges when two runs overlap and the database refuses the loser", async () => {
    // Both runs read an empty day before either inserts, which is the one case the
    // application check cannot catch. The unique index catches it instead, and the loser
    // reports the winner's point rather than failing or retrying into a duplicate.
    const db = new FakeUbwiDatabase();
    const winner = db.seedPublication("2026-09-15T06:00:00.000Z");
    db.hideFromDailyCheck = true;

    const loser = await runDailyUbwiPublication(db.sql, {
      now: "2026-09-15T06:00:00.500Z",
      calculation: calculationAt("2026-09-15T06:00:00.500Z"),
    });

    expect(loser.outcome).toBe("already_published");
    expect(loser.publicationId).toBe(winner.id);
    expect(loser.detail).toContain("concurrently");
    expect(db.publications).toHaveLength(1);
  });

  it("publishes a genuinely new day, and leaves the earlier point untouched", async () => {
    const db = new FakeUbwiDatabase();
    const first = await sameDayRun(db, FRESH_NOW);
    const nextDay = "2026-09-16T06:00:00.000Z";
    const second = await runDailyUbwiPublication(db.sql, {
      now: nextDay,
      calculation: calculationAt(nextDay),
    });

    expect(second.outcome).toBe("published");
    expect(db.publications).toHaveLength(2);
    expect(db.publications[0]!.id).toBe(first.publicationId);
    expect(db.publications[0]!.published_at).toBe(FRESH_NOW);
  });

  it("does not let a superseded point hold a day against its replacement", async () => {
    const db = new FakeUbwiDatabase();
    db.seedPublication(FRESH_NOW, { superseded: true });
    const result = await runDailyUbwiPublication(db.sql, {
      now: FRESH_NOW,
      calculation: calculationAt(FRESH_NOW),
    });
    expect(result.outcome).toBe("published");
  });
});

describe("a failing day", () => {
  /**
   * A denominator far below the coverage floor and far above the modelled ceiling: the
   * gate refuses it on both counts. The numerator is current, so the refusal is the
   * denominator's, not a stale price standing in for one.
   */
  const refusedCalculation = (calculatedAt: string) =>
    calculateUbwi({
      calculatedAt,
      numerator: freshNumeratorAt(calculatedAt),
      economies: OBSERVED_ECONOMIES.slice(0, 1),
    });

  it("creates no point when the gate refuses, and keeps the refusal auditable", async () => {
    const db = new FakeUbwiDatabase();
    const calculation = refusedCalculation(FRESH_NOW);
    expect(evaluateGate(calculation).passed, "fixture must actually be refused").toBe(false);

    const result = await runDailyUbwiPublication(db.sql, { now: FRESH_NOW, calculation });

    expect(result.outcome).toBe("gate_refused");
    expect(result.publicationId).toBeNull();
    expect(result.gateFailures.length).toBeGreaterThan(0);
    expect(db.publications).toHaveLength(0);
    // The calculation is retained so the refusal itself can be read back later.
    expect(db.calculations).toHaveLength(1);
    expect(db.calculations[0]!.gatePassed).toBe(false);
  });

  it("leaves the failed day empty and publishes the next day on its own merits", async () => {
    const db = new FakeUbwiDatabase();
    // September 18 fails.
    const failed = "2026-09-18T06:00:00.000Z";
    await runDailyUbwiPublication(db.sql, { now: failed, calculation: refusedCalculation(failed) });
    expect(db.publications).toHaveLength(0);

    // September 19 passes. Nothing is back-filled into the 18th.
    const passed = "2026-09-19T06:00:00.000Z";
    const result = await runDailyUbwiPublication(db.sql, {
      now: passed,
      calculation: calculationAt(passed),
    });

    expect(result.outcome).toBe("published");
    expect(db.publications).toHaveLength(1);
    expect(db.publications.map((p) => p.published_at.slice(0, 10))).toEqual(["2026-09-19"]);
  });
});

describe("the run summary", () => {
  it("carries the outcome and the observation date, and no connection detail", async () => {
    const db = new FakeUbwiDatabase();
    const result = await runDailyUbwiPublication(db.sql, {
      now: FRESH_NOW,
      calculation: calculationAt(FRESH_NOW),
    });
    const summary = ubwiRunSummary(result);
    expect(summary.outcome).toBe("published");
    expect(summary.observationDate).toBe("2026-09-15");
    expect(summary.methodologyVersion).toBe("1.2.0");
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("postgres");
    expect(serialized).not.toContain("@");
  });

  it("describes the frozen production point that already exists", () => {
    // The real 2026-09-15 point: value and freeze time as production holds them.
    expect(ubwiObservationDate(FROZEN_AT)).toBe("2026-09-15");
  });
});
