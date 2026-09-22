import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MARKETS } from "@/data/mock/market-detail";
import { UMPI_EXPORT_UV_MIX_WARNING } from "../types";
import {
  buildUmpiReadModel,
  unconfiguredUmpiReadModel,
  validatePublicUmpi,
  type PublicationRow,
} from "./read-model";

const ppi = (month: string, level: number, change: number | null): PublicationRow => ({
  seriesCode: "UMPI-KR-DRAM-PPI",
  referenceMonth: month,
  level,
  change,
  changeWithheldReason: change === null ? "no_prior_month" : null,
  tradeUnitValueUsdPerKg: null,
  publishedAt: "2026-09-22T10:00:00.000Z",
  methodologyVersion: "1.0.0",
  methodologyEffectiveFrom: "2026-09-22",
  base: "2020=100",
  attributionNotice: "Source: Bank of Korea",
});

const uv = (month: string, level: number, change: number | null, unitValue: number): PublicationRow => ({
  seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
  referenceMonth: month,
  level,
  change,
  changeWithheldReason: change === null ? "no_prior_month" : null,
  tradeUnitValueUsdPerKg: unitValue,
  publishedAt: "2026-09-22T10:00:00.000Z",
  methodologyVersion: "1.0.0",
  methodologyEffectiveFrom: "2026-09-22",
  base: "2020 calendar-year aggregate = 100",
  attributionNotice: "Source: Korea Customs Service, HSK 8542321010",
});

const sample = () => [
  ppi("2026-06", 496.84, null),
  ppi("2026-07", 538.74, 0.0843329),
  uv("2026-06", 579.6643, null, 74686.8873),
  uv("2026-07", 674.9998, 0.1644672, 86970.3885),
];

describe("the family", () => {
  it("holds two independent series and declares that it has no composite", () => {
    const model = buildUmpiReadModel(sample());
    expect(model.family.code).toBe("UMPI");
    expect(model.family.hasCompositeLevel).toBe(false);
    expect(model.series.map((s) => s.seriesCode)).toEqual(["UMPI-KR-DRAM-PPI", "UMPI-KR-DRAM-EXPORT-UV"]);
    // No level anywhere above the series.
    expect(Object.keys(model.family)).not.toContain("level");
    expect(validatePublicUmpi(model)).toEqual([]);
  });

  it("is present and empty, with a reason, when nothing is published", () => {
    const model = buildUmpiReadModel([]);
    expect(model.unavailableReason).toBe("no published observations");
    expect(model.series).toHaveLength(2);
    for (const series of model.series) {
      expect(series.points).toEqual([]);
      expect(series.latest).toBeNull();
      expect(series.unavailableReason).toBe("no published observations");
    }
    expect(unconfiguredUmpiReadModel().unavailableReason).toBe("no database is configured");
  });
});

describe("Series A", () => {
  const series = () => buildUmpiReadModel(sample()).series[0]!;

  it("publishes the official level in index points on the agency's base", () => {
    expect(series().latest).toMatchObject({ referenceMonth: "2026-07", level: 538.74 });
    expect(series().unit).toBe("index_points");
    expect(series().base).toBe("2020=100");
    expect(series().frequency).toBe("monthly");
    expect(series().changeLabel).toBe("MoM");
  });

  it("carries the Bank of Korea attribution and the source identity", () => {
    expect(series().attribution.agency).toBe("Bank of Korea");
    expect(series().attribution.sourceIdentity).toContain("404Y016");
    expect(series().attribution.sourceIdentity).toContain("30911201AA");
    expect(series().attribution.notice).toBe("Source: Bank of Korea");
  });

  it("carries no mix warning, because it is a quality-adjusted price index", () => {
    expect(series().kind).toBe("official_price_index");
    expect(series().semanticWarning).toBeNull();
  });

  it("exposes no trade unit value", () => {
    expect(series().points.every((p) => p.tradeUnitValueUsdPerKg === null)).toBe(true);
  });
});

describe("Series B", () => {
  const series = () => buildUmpiReadModel(sample()).series[1]!;

  it("publishes a rebased level on its own base", () => {
    expect(series().latest).toMatchObject({ referenceMonth: "2026-07", level: 674.9998 });
    expect(series().base).toBe("2020 calendar-year aggregate = 100");
    expect(series().unit).toBe("index_points");
  });

  it("carries the permanent unit-value warning at the series level", () => {
    expect(series().kind).toBe("derived_unit_value_index");
    expect(series().semanticWarning).toBe(UMPI_EXPORT_UV_MIX_WARNING);
    expect(series().semanticWarning).toMatch(/not a pure price index/);
    // Carried once, on the series, not duplicated into every point.
    expect(JSON.stringify(series().points)).not.toContain("unit-value index");
  });

  it("labels the underlying trade unit value and never as the index's own unit", () => {
    expect(series().latest!.tradeUnitValueUsdPerKg).toBeCloseTo(86970.3885, 4);
    // The unit of the series is index points; USD/kg is a separate, named field.
    expect(series().unit).toBe("index_points");
  });

  it("is never described as a price", () => {
    const prose = `${series().name} ${series().description}`;
    for (const forbidden of ["spot price", "chip price", "DDR5", "quality-adjusted", "transaction price"]) {
      expect(prose, forbidden).not.toContain(forbidden);
    }
    expect(series().name).toContain("Unit-Value");
  });

  it("carries the Korea Customs attribution and the HS code", () => {
    expect(series().attribution.agency).toBe("Korea Customs Service");
    expect(series().attribution.sourceIdentity).toContain("8542321010");
  });
});

describe("points and freshness", () => {
  it("orders months ascending and keeps the newest as latest", () => {
    const model = buildUmpiReadModel([ppi("2026-07", 538.74, 0.08), ppi("2026-06", 496.84, null)]);
    expect(model.series[0]!.points.map((p) => p.referenceMonth)).toEqual(["2026-06", "2026-07"]);
    expect(model.series[0]!.latest!.referenceMonth).toBe("2026-07");
  });

  it("keeps the publication timestamp separate from the reference month", () => {
    const series = buildUmpiReadModel(sample()).series[0]!;
    // An August figure must not be renderable as "updated today" from this payload.
    expect(series.latest!.referenceMonth).toBe("2026-07");
    expect(series.lastPublishedAt).toBe("2026-09-22T10:00:00.000Z");
    expect(series.latest).not.toHaveProperty("publishedAt");
  });

  it("preserves a sparse history instead of filling it", () => {
    // A 2020 base month and a 2026 month, with nothing between. The gap is visible.
    const model = buildUmpiReadModel([uv("2020-01", 100, null, 12884.5), uv("2026-06", 579.6643, null, 74686.9)]);
    expect(model.series[1]!.points.map((p) => p.referenceMonth)).toEqual(["2020-01", "2026-06"]);
    expect(model.series[1]!.points).toHaveLength(2);
  });

  it("reports a withheld change as null with its reason, never as zero", () => {
    const first = buildUmpiReadModel(sample()).series[0]!.points[0]!;
    expect(first.change).toBeNull();
    expect(first.changeWithheldReason).toBe("no_prior_month");
  });
});

describe("the response contract", () => {
  it("accepts a well-formed model", () => {
    expect(validatePublicUmpi(buildUmpiReadModel(sample()))).toEqual([]);
    expect(validatePublicUmpi(buildUmpiReadModel([]))).toEqual([]);
  });

  it("rejects a leaked database identifier", () => {
    const model = buildUmpiReadModel(sample()) as unknown as Record<string, unknown>;
    model.leaked = "21aa5584-8fa4-47fb-82f7-3b4eb0182231";
    expect(validatePublicUmpi(model).join()).toMatch(/database identifier/);
  });

  it("rejects leaked internal provenance", () => {
    const model = buildUmpiReadModel(sample()) as unknown as Record<string, unknown>;
    model.inputsDigest = "a".repeat(64);
    expect(validatePublicUmpi(model).join()).toMatch(/inputsDigest/);
  });

  it("rejects a rights-review marker reaching a public payload", () => {
    const model = buildUmpiReadModel(sample()) as unknown as Record<string, unknown>;
    model.note = "founder_accepted_risk";
    expect(validatePublicUmpi(model).join()).toMatch(/founder_accepted_risk/);
  });

  it("rejects a unit-value series that lost its warning", () => {
    const model = buildUmpiReadModel(sample());
    model.series[1]!.semanticWarning = null;
    expect(validatePublicUmpi(model).join()).toMatch(/carries no warning/);
  });

  it("rejects a price index that acquired a mix warning", () => {
    const model = buildUmpiReadModel(sample());
    model.series[0]!.semanticWarning = UMPI_EXPORT_UV_MIX_WARNING;
    expect(validatePublicUmpi(model).join()).toMatch(/must not carry a mix warning/);
  });

  it("rejects a claimed composite", () => {
    const model = buildUmpiReadModel(sample()) as unknown as { family: { hasCompositeLevel: boolean } };
    model.family.hasCompositeLevel = true;
    expect(validatePublicUmpi(model).join()).toMatch(/composite/);
  });

  it("rejects a point carrying both a change and a withholding reason", () => {
    const model = buildUmpiReadModel(sample());
    model.series[0]!.points[0]!.change = 0;
    expect(validatePublicUmpi(model).join()).toMatch(/both a change and a withholding reason/);
  });

  it("rejects duplicate or unordered months", () => {
    const model = buildUmpiReadModel(sample());
    model.series[0]!.points.push({ ...model.series[0]!.points[0]! });
    expect(validatePublicUmpi(model).join()).toMatch(/strictly ascending/);
  });
});

describe("the demo market cannot reach the public path", () => {
  it("shares no vocabulary with the production model", () => {
    // The repository still carries an invented memory market. This is the regression that keeps
    // it out of production: the contract fails the response if any of its vocabulary appears.
    const model = buildUmpiReadModel(sample()) as unknown as Record<string, unknown>;
    (model.series as { description: string }[])[0]!.description = "DDR5 16Gb spot price in $/part";
    expect(validatePublicUmpi(model).join()).toMatch(/demo vocabulary/);
  });

  it("the demo market still exists and is untouched by this phase", () => {
    // Phase 7 owns removing it. Phase 6 only has to be unable to serve it.
    const memory = MARKETS.find((market) => market.symbol === "UMPI");
    expect(memory).toBeDefined();
    const demoIds = new Set(memory!.families?.flatMap((f) => f.instruments.map((i) => i.id)) ?? []);
    expect(demoIds.size).toBeGreaterThan(0);

    // And none of its instruments is a public UMPI series code.
    const model = buildUmpiReadModel(sample());
    for (const series of model.series) expect(demoIds.has(series.seriesCode)).toBe(false);
  });

  it("the public read model never imports the demo data", () => {
    const source = readFileSync(path.join(process.cwd(), "src/lib/umpi/read/read-model.ts"), "utf8");
    const loader = readFileSync(path.join(process.cwd(), "src/lib/umpi/read/load.ts"), "utf8");
    expect(source).not.toContain("data/mock");
    expect(loader).not.toContain("data/mock");
  });
});
