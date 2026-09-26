/**
 * Released UEPI series, shaped for the market surface.
 *
 * It follows the convention the token benchmarks and the listed GPU children already run in
 * production, with one deliberate difference that §L.6 requires: where nothing is published,
 * UEPI's family comes back **empty** rather than untouched. UCPI leaves its family alone when
 * production has nothing to serve, which is right there -- the existing content is illustrative
 * and labelled as such. It would be wrong here, because the content this replaces is seven
 * generated random walks presented as wholesale power prices, and falling back to them would put
 * a fabricated $36.40/MWh where a real price belongs. An empty shelf is the honest failure.
 *
 * Only released days become points. The loader already refuses a superseded row, an unapproved
 * methodology version and a non-publishable posture, so nothing reaches here that the release
 * and publication gates did not pass.
 */

import { availableRangesFor, operatingDateInstant, seriesAsOf, toTimeSeries } from "@/lib/uepi/read/ranges";
import { UEPI_UNIT } from "@/lib/uepi/methodology";
import type { PublishableSeriesRow, ReleasedDayRow } from "@/lib/uepi/read/load";
import type { UepiChange } from "@/lib/uepi/read/read-model";
import type { MarketDetail, MarketInstrumentDetail, MarketSnapshot } from "@/types/market";

/** The family on the UEPI market that holds the wholesale power benchmarks. */
export const WHOLESALE_POWER_FAMILY_ID = "wholesale-power";

/** A released series with everything the surface needs, as the loader returns it. */
export type UepiInstrumentInput = {
  series: PublishableSeriesRow;
  days: readonly ReleasedDayRow[];
  change1d: UepiChange;
};

/**
 * The snapshot's movement, under §D.
 *
 * `changePercent` stays null whenever §D withholds it, and `absoluteChange` carries the figure
 * that is always defined. Direction is not a field here: the surface derives it from the sign of
 * the absolute change, which is §D.2 rule 3 and the reason rows 8 and 9 of the truth table do not
 * lose their arrow along with their percentage.
 */
function snapshotFrom(latest: ReleasedDayRow, change: UepiChange): MarketSnapshot {
  const asOf = operatingDateInstant(latest.operatingDate);
  if (change.basis === "unavailable") {
    return {
      value: Number(latest.valueUsdPerMwh),
      changePercent: null,
      absoluteChange: null,
      changeBasis: "absolute",
      changeSuppressionReason: "no_base_observation",
      asOf,
    };
  }
  return {
    value: Number(latest.valueUsdPerMwh),
    changePercent: change.percentChange,
    absoluteChange: change.absoluteChangeUsdPerMwh,
    changeBasis: change.basis,
    ...(change.reason === null
      ? {}
      : { changeSuppressionReason: change.reason as NonNullable<MarketSnapshot["changeSuppressionReason"]> }),
    ...(change.baseOperatingDate === null ? {} : { baseTime: operatingDateInstant(change.baseOperatingDate) }),
    asOf,
  };
}

/**
 * One instrument per series that has released a value.
 *
 * A series with nothing released is not an instrument. `MarketInstrumentDetail.snapshot.value` is
 * a number and not a nullable one, deliberately: an instrument on this surface is a thing with a
 * value, and a series whose only honest statement is "no value today" does not get a zero in
 * order to appear.
 */
export function uepiInstrumentsFrom(inputs: readonly UepiInstrumentInput[]): MarketInstrumentDetail[] {
  const instruments: MarketInstrumentDetail[] = [];
  for (const input of inputs) {
    const latest = input.days[input.days.length - 1];
    if (latest === undefined) continue;
    const series = { daily: toTimeSeries(input.days), intraday: [] };
    instruments.push({
      // §I.1: one identifier, spelled the same way everywhere. The frontend instrument id *is*
      // the public series id, so the two cannot drift.
      id: input.series.seriesId,
      shortLabel: input.series.market,
      symbol: input.series.market,
      // The headline renders as `<market>-<benchmarkCode ?? symbol>`, giving "UEPI-ERCOT" (§I.1).
      benchmarkCode: input.series.market,
      name: input.series.name,
      unit: UEPI_UNIT,
      provenance: "production",
      snapshot: snapshotFrom(latest, input.change1d),
      series,
      // §E.2's rule, from the shared low-frequency path. UEPI has no intraday tail and must not
      // acquire one by copying daily points: that would invent observations to light up a button.
      availableRanges: availableRangesFor(input.days),
      // No comparison options. UEPI's series live behind the production read model rather than in
      // the static market dataset, so a cross-market option could only resolve to nothing -- the
      // same reason UTVI and UMPI offer none. Comparing production series across read models is
      // real work (§H.2) and is not this phase's.
      comparisons: [],
    });
  }
  return instruments;
}

/**
 * Replaces the wholesale power family's instruments with the released series.
 *
 * Unlike the compute path, an empty result empties the family rather than leaving it. The
 * default instrument follows the first released series so the page never opens on an id that
 * resolves to nothing.
 */
export function withWholesalePowerInstruments(
  market: MarketDetail,
  instruments: readonly MarketInstrumentDetail[],
): MarketDetail {
  const first = instruments[0];
  return {
    ...market,
    defaultInstrumentId: first?.id ?? market.defaultInstrumentId,
    families: market.families.map((family) =>
      family.id === WHOLESALE_POWER_FAMILY_ID
        ? { ...family, instruments: [...instruments], defaultInstrumentId: first?.id ?? "" }
        : family,
    ),
  };
}

export { seriesAsOf };
