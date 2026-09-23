/**
 * UTVI's homepage watchlist row.
 *
 * Built from the same production read model the Model Economics section renders, so the rail and
 * the section cannot quote different numbers for the same index. There is no fixture path and no
 * fallback: where production publishes nothing, or the read fails, there is no row, which is the
 * rule every other row on this rail already follows. A placeholder here would be a fabricated
 * token count, and UTVI is a measurement of real consumption.
 *
 * The row carries `provenance: "production"` because that is what it is -- UTVI has published
 * daily since 16 September 2026 under methodology 1.0.0 -- and `valueFormat: "compact"` because
 * the unit is tokens per day and the values run to thirteen digits.
 *
 * The row links to `/markets/model-economics#volume`, not to `/markets/utvi`, and the rail reads
 * that destination from the catalog entry rather than from the symbol. See `UTVI_HREF`.
 */

import type { UtviInstrumentView } from "@/lib/utvi/read/instrument";
import type { IndexSnapshot } from "@/types/market";

export function utviIndexSnapshot(view: UtviInstrumentView | null): IndexSnapshot | null {
  if (view === null) return null;
  const { instrument } = view;
  return {
    symbol: instrument.symbol,
    name: instrument.name,
    unit: instrument.unit,
    provenance: "production",
    valueFormat: "compact",
    value: instrument.snapshot.value,
    // The read model's calendar-anchored 1-day change, already on the instrument. Null where the
    // previous calendar day published nothing, which is how a coverage gap presents.
    changePercent: instrument.snapshot.changePercent,
    asOf: instrument.snapshot.asOf,
  };
}
