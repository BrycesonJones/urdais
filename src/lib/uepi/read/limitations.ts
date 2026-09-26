/**
 * The published per-market limitations of UEPI specification 1.0.0 §I.3.
 *
 * These are not internal caveats and they are not a disclaimer. §I.3 is explicit that they are
 * *published text*, because a reader comparing two UEPI series needs them to read the chart
 * correctly: a CAISO energy component and an ERCOT delivered price are different economic
 * objects, and a reader who does not know that will read the gap between the two lines as a
 * price difference.
 *
 * They live here rather than in `reference.power_price_benchmarks` for one reason: they are
 * prose from the frozen specification, and a column would make them editable without amending
 * the specification that authorises them. The benchmark row already carries the *structured*
 * facts a surface needs -- construct, exclusions, geography -- and those are read from the
 * database. This is the sentence beside them.
 *
 * Nothing here may be reworded to soften it. Each entry is §I.3's own text.
 */

import type { UepiSeriesId } from "@/lib/uepi/types";

/** Applies to every series, and is shown first. §I.3, "All markets". */
export const UEPI_UNIVERSAL_LIMITATIONS: readonly string[] = [
  "UEPI is an Urdais calculation over public market data, not an index published by the ISO or RTO.",
  "It is a day-ahead auction benchmark, not the price paid by load, and not a real-time price.",
  "Values can be zero or negative. Where they are, UEPI shows the change in $/MWh and shows no percentage, by design.",
];

/** Per-market, from §I.3. A series with no entry here does not publish. */
const PER_MARKET: Readonly<Record<UepiSeriesId, readonly string[]>> = {
  "uepi-ercot": [
    "The day-ahead hub average is a shift-factor construct, not the simple mean of the four regional hub prices.",
    "The written definition changed effective 1 September 2019 under NPRR931; history that spans that date spans two definitions.",
  ],
  "uepi-pjm": [
    "RTO-aggregate total LMP; Western Hub, the traded benchmark, is a different and narrower price.",
  ],
  "uepi-caiso": [
    "Energy component only: congestion, losses and the marginal greenhouse-gas component are excluded.",
    "Whether the marginal greenhouse-gas component should be included is an open methodology question.",
  ],
  "uepi-miso": [
    "Energy component derived as LMP minus MCC minus MLC from the ex-post file; MISO publishes no MEC column.",
    "Hours are Eastern Standard Time all year, so a MISO day never has 23 or 25 hours.",
  ],
  "uepi-iso-ne": [
    "Hub total LMP, defined by tariff as the arithmetic average of the Hub's nodes.",
    "The Hub node list is revisable without the location id changing, so the hub-definition vintage is pinned in metadata.",
  ],
  "uepi-nyiso": [
    "Reference-bus energy component derived from a zonal row; NYISO publishes no statewide LBMP and no hub.",
    "Zonal prices, including New York City, can differ materially from this reference price.",
  ],
  "uepi-spp": [
    "Energy component for the SPP balancing authority only; the western SWPW market is excluded.",
    "SPP's own trading hubs diverge from each other and from this series.",
  ],
};

/** The published limitations for one series: the universal ones, then its own. */
export function limitationsFor(seriesId: UepiSeriesId): readonly string[] {
  return [...UEPI_UNIVERSAL_LIMITATIONS, ...PER_MARKET[seriesId]];
}
