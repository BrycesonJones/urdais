/**
 * The UEPI product surface's entry points: the market page's hydration, and the homepage row.
 *
 * Everything here fails closed. No database, an unreachable one, a read that throws, or a
 * payload that fails its own contract all produce an empty wholesale power family -- never a
 * cached level, and never the seven generated walks this phase retired. A blank shelf on the
 * page is a true statement about what Urdais can serve right now; $36.40/MWh from a seeded
 * random walk is not, and it is indistinguishable from a real price to every reader.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { describeDatabaseError } from "@/lib/db/connection";
import { loadPublishableSeries, loadReleasedDays, seriesViewFrom } from "@/lib/uepi/read/load";
import {
  uepiInstrumentsFrom,
  withWholesalePowerInstruments,
  WHOLESALE_POWER_FAMILY_ID,
  type UepiInstrumentInput,
} from "@/lib/uepi/read/instrument";
import { UEPI_UNIT } from "@/lib/uepi/methodology";
import type { MarketDetail, IndexSnapshot, MarketInstrumentDetail } from "@/types/market";
import type { ProcessEnvLike } from "@/lib/tokens/read/publication";
import type { SqlExecutor } from "@/lib/uepi/store";



function databaseUrl(env: ProcessEnvLike): string {
  return (env.DATABASE_URL ?? env.URDAIS_DATABASE_URL ?? "").trim();
}

/** Every publishable series with its released history, as the surface consumes it. */
export async function loadUepiInstrumentInputs(sql: SqlExecutor): Promise<UepiInstrumentInput[]> {
  const series = await loadPublishableSeries(sql);
  const days = await loadReleasedDays(sql, series.map((row) => row.seriesId));
  return series.map((row) => {
    const released = days.get(row.seriesId) ?? [];
    return {
      series: row,
      days: released,
      change1d: seriesViewFrom(row, released, { includePoints: false }).change1d,
    };
  });
}

/**
 * The released UEPI instruments, or an empty list.
 *
 * Sequential reads and one executor, closed in `finally`. These share the process-wide pooled
 * executor with every other loader on the page; running them concurrently lets whichever
 * finishes first tear the pool out from under the rest, which renders as a healthy database
 * behind a surface that says nothing is published.
 */
export async function loadUepiInstruments(env: ProcessEnvLike = process.env): Promise<MarketInstrumentDetail[]> {
  const url = databaseUrl(env);
  if (!url) return [];
  const sql = await createTokenSqlExecutor(url);
  try {
    return uepiInstrumentsFrom(await loadUepiInstrumentInputs(sql));
  } catch (error) {
    console.error(`uepi surface: load failed (${describeDatabaseError(error)})`);
    return [];
  } finally {
    await sql.end();
  }
}

/**
 * The market with its wholesale power family served from production.
 *
 * A market with no such family is returned untouched, so this can be applied at the page
 * boundary beside the token and compute hydrations without knowing which market it was given.
 */
export async function hydrateMarketWithWholesalePower(
  market: MarketDetail,
  env: ProcessEnvLike = process.env,
): Promise<MarketDetail> {
  if (!market.families.some((family) => family.id === WHOLESALE_POWER_FAMILY_ID)) return market;
  return withWholesalePowerInstruments(market, await loadUepiInstruments(env));
}

/**
 * UEPI's homepage rail row: named, linked, and carrying no number.
 *
 * UEPI publishes three market benchmarks and **no composite** (§C.14). Three markets in three
 * timezones, two of them quoting a system energy component and one a delivered price, have no
 * average that means anything -- and a rail row is one level per symbol, so putting a number
 * here would mean either inventing that average or quietly promoting one market's price to
 * stand for the index. `multi_series` is the vocabulary the product already has for exactly
 * this, from UMPI, and `IndexRow` renders no digits for it.
 *
 * Null where nothing is published at all, so the rail simply has no UEPI row rather than a row
 * asserting a live index behind an empty dataset.
 */
export function uepiIndexSnapshot(instruments: readonly MarketInstrumentDetail[]): IndexSnapshot | null {
  if (instruments.length === 0) return null;
  return {
    symbol: "UEPI",
    name: "Urdais Energy & Power Index",
    unit: UEPI_UNIT,
    provenance: "multi_series",
    // Three today, and read off what actually published rather than written down: a market
    // whose posture changes must not leave the rail claiming a count nobody updated.
    seriesCount: instruments.length,
    // Structurally required by IndexSnapshot and deliberately inert, on the same footing as
    // UMPI's: no branch reads them for a `multi_series` row, and a test asserts the rendered
    // row contains no number.
    value: 0,
    changePercent: null,
    asOf: 0,
  };
}
