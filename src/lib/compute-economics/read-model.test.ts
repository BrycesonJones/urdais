import { describe, expect, it } from "vitest";

import { computeEconomicsReadModelFrom, computePriceFreshness } from "@/lib/compute-economics/read-model";
import type { UcpiSeriesPoint } from "@/lib/ucpi/api-contract";
import type { ListedChildState } from "@/lib/ucpi/read/load";

function point(over: Partial<UcpiSeriesPoint> = {}): UcpiSeriesPoint {
  return {
    instrument: "UCPI-H100-SXM-LISTED", displayName: "UCPI H100 SXM Listed",
    gpu: { vendor: "NVIDIA", model: "H100", formFactor: "SXM", memoryGb: 80, label: "H100 SXM" },
    observationType: "listed", procurementMode: "on_demand", regionScope: "listed_provider_wide", country: null,
    attributions: ["Data: licensed production source"], calculationDate: "2026-09-17", status: "published", priceLevel: 3.628,
    currency: "USD", unit: "accelerator_hour", percentageChange1d: null, changeDisposition: "withheld", marketBreadth: "normal",
    structuralCondition: null, participantCount: 4, contributingSourceCount: 2, largestSourceParticipantShare: 0.5,
    dispersion: { p10: 3, p50: 3.5, p90: 4, iqr: 0.5 }, reasonCodes: [],
    freshness: { windowStart: "2026-09-17T00:00:00.000Z", cutoff: "2026-09-18T00:00:00.000Z", allInputsWithinWindow: true },
    methodologyVersion: "1.2.0", instrumentSpecVersion: "1.0.0", calculatedAt: "2026-09-18T00:30:00.000Z", publishedAt: "2026-09-18T01:00:00.000Z", ...over,
  };
}

function child(over: Partial<ListedChildState> = {}): ListedChildState {
  const latest = point();
  return { symbol: latest.instrument, displayName: latest.displayName, gpuLabel: latest.gpu.label, specVersion: "1.0.0", latest, points: [latest], ...over };
}

describe("Compute Economics production read model", () => {
  it("projects the released public UCPI point without constituent or synthetic values", () => {
    const model = computeEconomicsReadModelFrom([child()], new Date("2026-09-18T12:00:00.000Z"));
    expect(model.unavailableReason).toBeNull();
    expect(model.instruments[0]).toMatchObject({ symbol: "UCPI-H100-SXM-LISTED", observedPrice: { priceUsdPerGpuHour: 3.628, participantCount: 4, contributingSourceCount: 2, methodologyVersion: "1.2.0", freshness: { state: "fresh", usableForPayback: true } } });
    expect(JSON.stringify(model)).not.toMatch(/forward|tenor|participantPrices|representativePrice/i);
    expect(model.instruments[0]!.defaultAssumptions.utilization.status).toBe("assumption");
  });

  it("does not replace missing, unreleased, or unsupported production prices", () => {
    const unavailable = child({ latest: null, points: [] });
    const unreleasedPoint = point({ status: "unavailable", priceLevel: null, publishedAt: null });
    const unreleased = child({ latest: unreleasedPoint, points: [unreleasedPoint] });
    const unsupportedPoint = point({ instrument: "UCPI-UNKNOWN-LISTED" });
    const unsupported = child({ symbol: unsupportedPoint.instrument, latest: unsupportedPoint, points: [unsupportedPoint] });
    const model = computeEconomicsReadModelFrom([unavailable, unreleased, unsupported], new Date("2026-09-18T12:00:00.000Z"));
    expect(model.instruments).toEqual([]);
    expect(model.unavailableReason).toBe("no_supported_price");
  });

  it("keeps a stale observed point visible but makes it unusable for Payback", () => {
    const model = computeEconomicsReadModelFrom([child()], new Date("2026-09-20T00:00:00.000Z"));
    expect(model.instruments[0]!.observedPrice.priceUsdPerGpuHour).toBe(3.628);
    expect(model.instruments[0]!.observedPrice.freshness).toEqual({ state: "stale", usableForPayback: false, staleAfter: "2026-09-20T00:00:00.000Z" });
  });
});

describe("computePriceFreshness", () => {
  it("changes state exactly at the next publication deadline", () => {
    expect(computePriceFreshness("2026-09-17", new Date("2026-09-19T23:59:59.999Z")).state).toBe("fresh");
    expect(computePriceFreshness("2026-09-17", new Date("2026-09-20T00:00:00.000Z")).state).toBe("stale");
  });
});
