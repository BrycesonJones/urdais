/**
 * Synthetic hours for UEPI's unit tests.
 *
 * Synthetic on purpose, and only ever synthetic: UEPI-1 implements no source adapter, so no real
 * market file is parsed here and none is committed. What these fixtures reproduce is the *shape*
 * a real day has -- a complete set of instants for a market's own operating day, carrying that
 * benchmark's construct and derivation -- so the calculation and the release gates can be
 * exercised against the structure they will meet in UEPI-2.
 *
 * Prices are arguments. Where a test uses a figure the Phase 1 research measured, it says so at
 * the call site rather than hiding a market number in here.
 */

import { expectedIntervalStarts, operatingDayWindow, type OperatingDayWindow } from "@/lib/uepi/operating-day";
import type { NormalizedHourlyPrice, UepiBenchmark } from "@/lib/uepi/types";

/** One complete operating day: an hour per expected instant, priced by `priceAt`. */
export function completeDay(
  benchmark: UepiBenchmark,
  window: OperatingDayWindow,
  priceAt: (hourOrdinal: number) => string,
): NormalizedHourlyPrice[] {
  return expectedIntervalStarts(window).map((intervalStartUtc, index) => ({
    seriesId: benchmark.seriesId,
    operatingDate: window.operatingDate,
    intervalStartUtc,
    intervalEndUtc: new Date(Date.parse(intervalStartUtc) + 3_600_000).toISOString(),
    hourOrdinal: index + 1,
    priceUsdPerMwh: priceAt(index + 1),
    construct: benchmark.construct,
    derivation: benchmark.derivation,
    derivationExpression: benchmark.derivationExpression,
    sourceVersion: null,
    qualityStatus: "accepted" as const,
    qualityNotes: [],
  }));
}

/** A complete day at one flat price, which is the least interesting day and the clearest fixture. */
export function flatDay(
  benchmark: UepiBenchmark, operatingDate: string, price: string,
): { window: OperatingDayWindow; hours: NormalizedHourlyPrice[] } {
  const window = operatingDayWindow(benchmark, operatingDate);
  return { window, hours: completeDay(benchmark, window, () => price) };
}
