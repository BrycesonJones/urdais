import { POWER_DELIVERY_UNIVERSE_SLUG } from "@/lib/power-delivery/universe";
import type { CoincidentAggregatePoint } from "@/lib/power-delivery/types";

export type AggregateMember = { areaId: string; periodStart: string; periodEnd: string; valueMw: number };

/**
 * Sum simultaneous hourly member observations. Missing members make the result unavailable;
 * they never become zero. Callers may calculate peaks only from this coincident series.
 */
export function aggregateCoincidentActualLoad(
  observations: readonly AggregateMember[],
  expectedAreaIds: readonly string[],
  universeVersion = 1,
  window?: { start: string; end: string },
): CoincidentAggregatePoint[] {
  const expected = new Set(expectedAreaIds);
  if (expected.size !== expectedAreaIds.length) throw new Error("aggregate membership contains duplicate area IDs");
  const byPeriod = new Map<string, AggregateMember[]>();
  if (window) {
    const start = new Date(window.start).valueOf();
    const end = new Date(window.end).valueOf();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start % 3_600_000 !== 0 || end % 3_600_000 !== 0) {
      throw new Error("aggregate window must be an ordered pair of UTC-hour boundaries");
    }
    for (let timestamp = start; timestamp < end; timestamp += 3_600_000) {
      byPeriod.set(new Date(timestamp).toISOString(), []);
    }
  }
  for (const observation of observations) {
    if (!expected.has(observation.areaId)) throw new Error(`observation area ${observation.areaId} is not in the selected universe version`);
    byPeriod.set(observation.periodStart, [...(byPeriod.get(observation.periodStart) ?? []), observation]);
  }

  return [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([periodStart, rows]) => {
    const byArea = new Map<string, AggregateMember>();
    for (const row of rows) {
      if (byArea.has(row.areaId)) throw new Error(`duplicate current observation for ${row.areaId} at ${periodStart}`);
      if (row.periodEnd !== rows[0]!.periodEnd) throw new Error(`member intervals disagree at ${periodStart}`);
      byArea.set(row.areaId, row);
    }
    const missingAreaIds = expectedAreaIds.filter((id) => !byArea.has(id));
    const complete = missingAreaIds.length === 0;
    return {
      periodStart,
      periodEnd: rows[0]?.periodEnd ?? new Date(new Date(periodStart).valueOf() + 3_600_000).toISOString(),
      aggregateMw: complete ? rows.reduce((sum, row) => sum + row.valueMw, 0) : null,
      coverage: {
        universe: POWER_DELIVERY_UNIVERSE_SLUG,
        universeVersion,
        expectedMemberCount: expectedAreaIds.length,
        presentMemberCount: byArea.size,
        missingAreaIds,
        status: complete ? "complete" : "incomplete",
      },
    };
  });
}

export function peakOfCoincidentSeries(points: readonly CoincidentAggregatePoint[]): CoincidentAggregatePoint | null {
  const complete = points.filter((point) => point.aggregateMw !== null);
  if (complete.length === 0) return null;
  return complete.reduce((peak, point) => point.aggregateMw! > peak.aggregateMw! ? point : peak);
}
