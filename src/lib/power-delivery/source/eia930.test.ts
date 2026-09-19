import { describe, expect, it, vi } from "vitest";

import { buildEia930Parameters, Eia930ContractError, fetchEia930, parseEia930Page, parseEia930Row } from "@/lib/power-delivery/source/eia930";
import { PD2_V1_AREAS } from "@/lib/power-delivery/universe";

const row = (overrides: Record<string, unknown> = {}) => ({
  period: "2026-09-19T11", respondent: "ERCO", "respondent-name": "ERCOT",
  type: "D", "type-name": "Demand", value: "53599", "value-units": "megawatthours", ...overrides,
});

const body = (data: unknown[], total = data.length) => JSON.stringify({ response: { total: String(total), frequency: "hourly", data } });

describe("EIA-930 request and normalization", () => {
  it("builds deterministic parameters for exactly the seven physical areas and D/DF", () => {
    const params = buildEia930Parameters({ start: "2026-09-19T00", end: "2026-09-19T23" });
    expect(params.getAll("facets[respondent][]")).toEqual(PD2_V1_AREAS.map((area) => area.eiaBaCode));
    expect(params.getAll("facets[type][]")).toEqual(["D", "DF"]);
    expect(params.get("frequency")).toBe("hourly");
  });

  it("normalizes D and DF without creating planning or capacity metrics", () => {
    expect(parseEia930Row(row())).toMatchObject({ metric: "actual_load", valueMw: 53599, nativeUnit: "megawatthours" });
    expect(parseEia930Row(row({ type: "DF", "type-name": "Forecast" }))).toMatchObject({ metric: "operational_demand_forecast" });
    expect(JSON.stringify([parseEia930Row(row()), parseEia930Row(row({ type: "DF" }))])).not.toMatch(/planning_demand_forecast|deliverable_capacity/);
  });

  it("represents a native null as source unavailability", () => {
    expect(parseEia930Row(row({ value: null }))).toMatchObject({ valueMw: null, normalizationStatus: "source_unavailable" });
  });

  it("fails the whole page on malformed rows, unsupported units, types, or duplicates", () => {
    expect(() => parseEia930Row(row({ value: "not-a-number" }))).toThrow(Eia930ContractError);
    expect(() => parseEia930Row(row({ "value-units": "MW" }))).toThrow(/unsupported.*unit/i);
    expect(() => parseEia930Row(row({ type: "NG" }))).toThrow(/unsupported.*type/i);
    expect(() => parseEia930Page(body([row(), row()]), "url", buildEia930Parameters({ start: "2026-09-19T00", end: "2026-09-19T23" }), "2026-09-19T12:00:00Z")).toThrow(/duplicate/i);
  });

  it("retains every repeated facet in provenance parameters", () => {
    const params = buildEia930Parameters({ start: "2026-09-19T00", end: "2026-09-19T23" });
    const page = parseEia930Page(body([row()]), "url", params, "2026-09-19T12:00:00Z");
    expect(page.requestParameters["facets[respondent][]"]).toEqual(PD2_V1_AREAS.map((area) => area.eiaBaCode));
    expect(page.requestParameters["facets[type][]"]).toEqual(["D", "DF"]);
  });

  it("paginates until the advertised total and keeps the API key out of retained URLs", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(body([row()], 2), { status: 200 }))
      .mockResolvedValueOnce(new Response(body([row({ period: "2026-09-19T12" })], 2), { status: 200 }));
    const pages = await fetchEia930({ start: "2026-09-19T00", end: "2026-09-19T23" }, { apiKey: "secret", fetchImpl, now: () => new Date("2026-09-19T13:00:00Z") });
    expect(pages).toHaveLength(2);
    expect(fetchImpl.mock.calls[1]![0]).toContain("offset=1");
    expect(pages[0]!.requestUrl).not.toContain("secret");
  });
});
