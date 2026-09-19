import { assumptionDefaultsFor } from "@/lib/compute-economics/assumptions";
import type { ComputeEconomicsReadModel, ComputePriceFreshness } from "@/lib/compute-economics/domain";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import type { ListedChildState } from "@/lib/ucpi/read/load";

export function computePriceFreshness(calculationDate: string, now: Date): ComputePriceFreshness {
  const currentWindow = calculationWindow(calculationDate);
  // The current D point remains usable until the D+1 point is due. Reusing the
  // UCPI calendar here keeps Payback aligned if that cadence ever changes.
  const staleAfter = calculationWindow(currentWindow.cutoff.slice(0, 10)).publicationDeadline;
  const fresh = now.getTime() < Date.parse(staleAfter);
  return { state: fresh ? "fresh" : "stale", usableForPayback: fresh, staleAfter };
}

/**
 * Projects the canonical public UCPI contract into Compute Economics. Children
 * without a released price or without explicit defaults are not supported.
 */
export function computeEconomicsReadModelFrom(children: readonly ListedChildState[], now: Date): ComputeEconomicsReadModel {
  const instruments = children.flatMap((child) => {
    const assumptions = assumptionDefaultsFor(child.symbol);
    const point = child.latest;
    if (assumptions === null || point === null || point.priceLevel === null || point.publishedAt === null) return [];
    if (point.status !== "published" && point.status !== "delayed") return [];

    return [{
      symbol: child.symbol,
      label: point.gpu.label,
      gpu: {
        vendor: point.gpu.vendor,
        model: point.gpu.model,
        formFactor: point.gpu.formFactor,
        memoryGb: point.gpu.memoryGb,
      },
      observedPrice: {
        priceUsdPerGpuHour: point.priceLevel,
        currency: point.currency,
        unit: point.unit,
        calculationDate: point.calculationDate,
        observationWindowStart: point.freshness.windowStart,
        observationWindowEnd: point.freshness.cutoff,
        publishedAt: point.publishedAt,
        publicationStatus: point.status,
        participantCount: point.participantCount,
        contributingSourceCount: point.contributingSourceCount,
        marketBreadth: point.marketBreadth,
        attributions: [...point.attributions],
        methodologyVersion: point.methodologyVersion,
        instrumentSpecVersion: point.instrumentSpecVersion,
        freshness: computePriceFreshness(point.calculationDate, now),
      },
      defaultAssumptions: assumptions,
    }];
  });

  return {
    generatedAt: now.toISOString(),
    instruments,
    unavailableReason: instruments.length === 0 ? "no_supported_price" : null,
  };
}
