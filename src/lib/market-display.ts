/**
 * Display naming for instruments inside a market.
 *
 * An Urdais index ticker belongs to the market, and only the market's
 * current headline benchmark carries the combined index/benchmark identity:
 * H100 SXM is `UCPI-H100`, HBM3E is `UMPI-HBM3E`, 800G is `UPPI-800G`, PJM
 * is `UEPI-PJM`. Every other selectable instrument is presented as itself
 * (`H200`, `HBM4`, `200G`, `ISO-NE`): an instrument viewed inside the
 * market, not a separate Urdais index. The headline is decided by the
 * market's explicit `defaultInstrumentId`, never by position or by a
 * family's own default, so a benchmark change needs no naming change.
 */

import type { MarketDetail, MarketInstrumentDetail } from "@/types/market";

/** Whether this instrument is the market's current headline benchmark. */
export function isHeadlineInstrument(market: MarketDetail, instrument: MarketInstrumentDetail): boolean {
  return instrument.id === market.defaultInstrumentId;
}

/**
 * The identity shown for an instrument on its market's page: the combined
 * index/benchmark identity for the headline, the instrument's own symbol
 * otherwise. A standalone index whose only instrument is itself keeps the
 * bare index symbol.
 */
export function instrumentDisplaySymbol(market: MarketDetail, instrument: MarketInstrumentDetail): string {
  if (!isHeadlineInstrument(market, instrument)) return instrument.symbol;
  if (instrument.symbol === market.symbol) return market.symbol;
  return `${market.symbol}-${instrument.benchmarkCode ?? instrument.symbol}`;
}

/**
 * The label for a chart series. Inside its own market an instrument is
 * named as itself, headline or not, so same-family comparisons read
 * `H100 SXM | H200 | B200` rather than as a string of index tickers. A
 * series pulled in from another market is a cross-index comparison, so it
 * carries that market's index/benchmark identity, e.g. `UMPI-HBM3E`.
 */
export function chartSeriesLabel(
  pageMarket: MarketDetail,
  instrument: MarketInstrumentDetail,
  homeMarketOf: (instrument: MarketInstrumentDetail) => MarketDetail | undefined,
): string {
  const home = homeMarketOf(instrument);
  if (!home || home.symbol === pageMarket.symbol) return instrument.symbol;
  return instrumentDisplaySymbol(home, instrument);
}
