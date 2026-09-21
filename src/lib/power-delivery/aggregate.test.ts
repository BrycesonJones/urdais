import { describe, expect, it } from "vitest";

import { aggregateCoincidentActualLoad, peakOfCoincidentSeries } from "@/lib/power-delivery/aggregate";
import { PD2_V1_AREAS } from "@/lib/power-delivery/universe";

const H1 = "2026-09-19T10:00:00.000Z";
const H2 = "2026-09-19T11:00:00.000Z";
const end = (start: string) => new Date(new Date(start).valueOf() + 3_600_000).toISOString();

describe("coincident Power Delivery aggregation", () => {
  it("sums seven simultaneous observations and exposes complete coverage", () => {
    const rows = PD2_V1_AREAS.map((area, index) => ({ areaId: area.id, periodStart: H1, periodEnd: end(H1), valueMw: 100 + index }));
    expect(aggregateCoincidentActualLoad(rows, PD2_V1_AREAS.map((area) => area.id))[0]).toMatchObject({ aggregateMw: 721, coverage: { expectedMemberCount: 7, presentMemberCount: 7, missingAreaIds: [], status: "complete" } });
  });

  it("returns unavailable when one member is missing and never treats it as zero", () => {
    const rows = PD2_V1_AREAS.slice(0, 6).map((area) => ({ areaId: area.id, periodStart: H1, periodEnd: end(H1), valueMw: 100 }));
    expect(aggregateCoincidentActualLoad(rows, PD2_V1_AREAS.map((area) => area.id))[0]).toMatchObject({ aggregateMw: null, coverage: { presentMemberCount: 6, missingAreaIds: [PD2_V1_AREAS[6]!.id], status: "incomplete" } });
  });

  it("makes a wholly missing requested hour visible", () => {
    const points = aggregateCoincidentActualLoad([], PD2_V1_AREAS.map((area) => area.id), 1, { start: H1, end: H2 });
    expect(points).toEqual([{ periodStart: H1, periodEnd: H2, aggregateMw: null, coverage: {
      universe: "seven_organized_us_wholesale_markets", universeVersion: 1,
      expectedMemberCount: 7, presentMemberCount: 0,
      missingAreaIds: PD2_V1_AREAS.map((area) => area.id), status: "incomplete",
    } }]);
  });

  it("refuses a planning forecast offered as an operational member", () => {
    const planning = { areaId: PD2_V1_AREAS[0]!.id, periodStart: H1, periodEnd: end(H1), valueMw: 144522, targetYear: 2031, scenarioId: "s1" };
    expect(() => aggregateCoincidentActualLoad([planning as never], PD2_V1_AREAS.map((area) => area.id)))
      .toThrow(/planning or capacity data cannot enter operational coincident aggregation/);
  });

  it("refuses a grid capacity value offered as an operational member", () => {
    const capacity = { areaId: PD2_V1_AREAS[0]!.id, periodStart: H1, periodEnd: end(H1), valueMw: 85000, quantityKind: "capability", capacityBasis: "ucap" };
    expect(() => aggregateCoincidentActualLoad([capacity as never], PD2_V1_AREAS.map((area) => area.id)))
      .toThrow(/planning or capacity data cannot enter operational coincident aggregation/);
  });

  it("refuses a member whose interval is not one operational hour", () => {
    const annual = { areaId: PD2_V1_AREAS[0]!.id, periodStart: "2031-01-01T00:00:00.000Z", periodEnd: "2032-01-01T00:00:00.000Z", valueMw: 144522 };
    expect(() => aggregateCoincidentActualLoad([annual], PD2_V1_AREAS.map((area) => area.id)))
      .toThrow(/one-hour operational intervals only/);
  });

  it("does not sum market peaks that occurred at different hours", () => {
    const rows = PD2_V1_AREAS.flatMap((area, index) => [
      { areaId: area.id, periodStart: H1, periodEnd: end(H1), valueMw: index === 0 ? 1000 : 10 },
      { areaId: area.id, periodStart: H2, periodEnd: end(H2), valueMw: index === 1 ? 1000 : 10 },
    ]);
    const peak = peakOfCoincidentSeries(aggregateCoincidentActualLoad(rows, PD2_V1_AREAS.map((area) => area.id)));
    expect(peak!.aggregateMw).toBe(1060);
    expect(peak!.aggregateMw).not.toBe(2000 + 5 * 10);
  });
});
