/**
 * What the public UBWI surface is allowed to say.
 *
 * Two states and no third. Either a gate-cleared value has been published, in which case
 * the surface shows it with its observed and modelled shares and its sensitivity range;
 * or nothing has been published, in which case the surface says so and says why.
 *
 * There is no demo state, no placeholder level and no back series. UBWI history begins at
 * the first verified production observation, and percentage change is unavailable until a
 * second one exists: there is no such thing as a change from nothing.
 */
import { calculateUbwi, METHODOLOGY_VERSION, RESIDUAL_MODEL_VERSION, UBWI_UNIT } from "../calculate";
import { evaluateGate, PRODUCTION_V1_THRESHOLDS } from "../gate";
import type { UnobservedMajorEconomy } from "../types";

export type UbwiDisclosure = {
  /** Total Global Wealth, in USD. */
  totalGlobalWealthUsd: number;
  bitcoinMarketCapUsd: number;
  /** Share of Total Global Wealth that is a directly observed national balance sheet. */
  observedSharePercent: number;
  /** Share of Total Global Wealth that is the versioned residual model. */
  modeledSharePercent: number;
  rightsClearedGdpCoverage: number;
  observedEconomyCount: number;
  sensitivity: { lowPercent: number; highPercent: number };
  unobservedMajorEconomies: readonly UnobservedMajorEconomy[];
  methodologyVersion: string;
  residualModelVersion: string;
  /** The instant the numerator was observed. */
  observedAt: string;
  blockHeight: number;
};

export type UbwiSurface =
  | ({
      status: "published";
      valuePercent: number;
      unit: typeof UBWI_UNIT;
      publishedAt: string;
      /** Null until a second real observation exists under the same versions. */
      changePercent: number | null;
      changeWithheldReason: string | null;
    } & UbwiDisclosure)
  | ({
      status: "withheld";
      unit: typeof UBWI_UNIT;
      /** The single sentence the surface shows in place of a value. */
      reason: string;
      /** The gate codes that refused, so the surface never invents its own explanation. */
      gateFailures: readonly string[];
    } & UbwiDisclosure);

export const UBWI_WITHHELD_NOTE =
  "No UBWI value is published. The publication gate refuses the current denominator, and Urdais withholds the value rather than relaxing the gate to produce one.";

/**
 * The one-line explanation of what UBWI measures. Kept on the main surface; the
 * methodology carries the detail.
 */
export const UBWI_EXPLANATION =
  "UBWI estimates Bitcoin's share of total global wealth using directly observed national balance sheets where available and a versioned residual model for economies without comparable published balance sheets.";

export const UBWI_METHODOLOGY_HREF = "/docs/methodology/ubwi";

/**
 * Build the surface state. `publication` is the frozen published point where one exists;
 * passing none is the ordinary case today and produces the withheld state.
 */
export function ubwiSurface(options?: {
  now?: string;
  publication?: { publishedAt: string; valuePercent: number; changePercent: number | null };
}): UbwiSurface {
  const calculatedAt = options?.now ?? new Date().toISOString();
  const calculation = calculateUbwi({ calculatedAt });
  const gate = evaluateGate(calculation);

  const disclosure: UbwiDisclosure = {
    totalGlobalWealthUsd: calculation.totalGlobalWealthUsd,
    bitcoinMarketCapUsd: calculation.numerator.marketCapUsd,
    observedSharePercent: calculation.observedShareOfTotal,
    modeledSharePercent: calculation.modeledShareOfTotal,
    rightsClearedGdpCoverage: calculation.coverage.rightsClearedGdpCoverage,
    observedEconomyCount: calculation.coverage.observedEconomyCount,
    sensitivity: calculation.sensitivity,
    unobservedMajorEconomies: calculation.unobservedMajorEconomies,
    methodologyVersion: METHODOLOGY_VERSION,
    residualModelVersion: RESIDUAL_MODEL_VERSION,
    observedAt: calculation.numerator.observedAt,
    blockHeight: calculation.numerator.blockHeight,
  };

  if (options?.publication && gate.passed) {
    return {
      status: "published",
      unit: UBWI_UNIT,
      valuePercent: options.publication.valuePercent,
      publishedAt: options.publication.publishedAt,
      changePercent: options.publication.changePercent,
      changeWithheldReason:
        options.publication.changePercent === null
          ? "Percentage change is unavailable until a second production observation exists."
          : null,
      ...disclosure,
    };
  }

  return {
    status: "withheld",
    unit: UBWI_UNIT,
    reason: UBWI_WITHHELD_NOTE,
    gateFailures: gate.findings.map((f) => f.code),
    ...disclosure,
  };
}

/** The gate thresholds a surface may quote, so the page and the engine cannot disagree. */
export const UBWI_GATE_SUMMARY = {
  maxModeledSharePercent: PRODUCTION_V1_THRESHOLDS.maxImputedShareOfWealth * 100,
  minRightsClearedCoveragePercent: PRODUCTION_V1_THRESHOLDS.minRightsClearedGdpCoverage * 100,
} as const;
