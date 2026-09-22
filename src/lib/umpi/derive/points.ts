/**
 * Monthly points, for both series.
 *
 * Series A republishes the Bank of Korea's level unchanged. Series B is computed:
 * value over weight, rebased to the frozen 2020 aggregate. Both get a month-over-month change
 * from the same primitive, under the same withholding rules.
 *
 * Nothing here rounds. The published precision is whatever the arithmetic produced; display
 * rounding is a presentation concern and rounding early would make a stored value irreproducible
 * from its inputs.
 */

import { createHash } from "node:crypto";

import { monthOverMonth, rebaseToIndex, unitValueUsdPerKg } from "../calculate";
import { previousMonth } from "../reference-month";
import type { LineagedLevel, SeriesLineage, UmpiSeriesCode } from "../types";
import type { CurrentObservation, DerivedPoint, StoredBase } from "./types";
import { UMPI_CALCULATION_VERSION } from "./types";

/**
 * The digest that decides whether a recalculation writes anything.
 *
 * It covers every input that can change the number — the observation and its vintage, the base,
 * the month compared against, the methodology version and the calculation version — and nothing
 * that cannot. **No clock, no run id, no ordering.** Two runs over identical inputs produce the
 * same digest and therefore the same row, which is what makes an exact rerun a no-op rather than
 * a revision.
 */
export function publicationDigest(input: {
  seriesCode: UmpiSeriesCode;
  referenceMonth: string;
  observationId: string;
  vintageOrdinal: number;
  level: number;
  previousObservationId: string | null;
  momChange: number | null;
  momWithheldReason: string | null;
  indexBaseDigest: string | null;
  methodologyVersionId: string;
  calculationVersion: string;
}): string {
  const canonical = JSON.stringify([
    input.seriesCode,
    input.referenceMonth,
    input.observationId,
    input.vintageOrdinal,
    input.level,
    input.previousObservationId,
    input.momChange,
    input.momWithheldReason,
    input.indexBaseDigest,
    input.methodologyVersionId,
    input.calculationVersion,
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

function lineageOf(seriesCode: UmpiSeriesCode, observation: CurrentObservation, baseLabel: string): SeriesLineage {
  return {
    seriesCode,
    methodologyVersion: observation.methodologyVersionId,
    sourceSeriesId: observation.sourceSeriesId,
    baseLabel,
  };
}

/**
 * Derive every month of a series.
 *
 * `observations` must be the current vintages only; the caller reads them from
 * `pipeline.umpi_current_observations`, which is the one place "latest" is defined.
 */
export function derivePoints(input: {
  seriesCode: UmpiSeriesCode;
  observations: readonly CurrentObservation[];
  base: StoredBase | null;
  baseLabel: string;
  indexBaseId: string | null;
  /**
   * The methodology a published value is governed by — the series' current version, not the
   * one that happened to be in force when the observation was collected. Those are different
   * facts: an observation records what governed its retrieval, a publication records what
   * governs the number. Including it in the digest is what makes an approval regenerate the
   * published set instead of relabelling it.
   */
  publicationMethodologyVersionId: string;
}): DerivedPoint[] {
  const { seriesCode, base, baseLabel, indexBaseId, publicationMethodologyVersionId } = input;
  const byMonth = new Map(input.observations.map((o) => [o.referenceMonth, o]));
  const months = [...byMonth.keys()].sort();
  const points: DerivedPoint[] = [];

  for (const month of months) {
    const observation = byMonth.get(month)!;

    // The level. Series A is the agency's own, untouched; Series B is Urdais's calculation.
    let level: number;
    let unitValue: number | null = null;
    if (seriesCode === "UMPI-KR-DRAM-PPI") {
      if (observation.indexLevel === null) continue;
      level = observation.indexLevel;
    } else {
      if (base === null) continue;
      if (observation.exportValueUsd === null || observation.exportWeightKg === null) continue;
      if (observation.exportWeightKg <= 0) continue;
      unitValue = unitValueUsdPerKg({
        exportValueUsd: observation.exportValueUsd,
        exportWeightKg: observation.exportWeightKg,
      });
      // A month that exported weight but no value has a unit value of zero, which the rebasing
      // primitive refuses: an index level of zero is not a measurement of price. The admission
      // layer accepts such a month as real evidence, so the seam is here — it is stored and it
      // is not published, rather than throwing and taking the whole series down with it.
      if (unitValue <= 0) continue;
      level = rebaseToIndex(unitValue, base);
    }

    // The change, against the immediately preceding calendar month and nothing else. A gap is a
    // gap: there is no "since the last available observation" fallback.
    const priorMonth = previousMonth(month);
    const prior = byMonth.get(priorMonth) ?? null;
    let priorLevel: LineagedLevel | null = null;
    if (prior !== null) {
      if (seriesCode === "UMPI-KR-DRAM-PPI") {
        if (prior.indexLevel !== null) {
          priorLevel = { referenceMonth: priorMonth, level: prior.indexLevel, lineage: lineageOf(seriesCode, prior, baseLabel) };
        }
      } else if (base !== null && prior.exportValueUsd !== null && prior.exportWeightKg !== null && prior.exportWeightKg > 0) {
        const priorUv = unitValueUsdPerKg({ exportValueUsd: prior.exportValueUsd, exportWeightKg: prior.exportWeightKg });
        // A predecessor with no publishable level is no predecessor: the change is withheld
        // rather than measured against a month that was never published.
        if (priorUv > 0) {
          priorLevel = { referenceMonth: priorMonth, level: rebaseToIndex(priorUv, base), lineage: lineageOf(seriesCode, prior, baseLabel) };
        }
      }
    }

    const current: LineagedLevel = { referenceMonth: month, level, lineage: lineageOf(seriesCode, observation, baseLabel) };
    let mom = monthOverMonth(current, priorLevel);

    // The primitive reports a null predecessor as `no_prior_month`, which is right for the
    // first month of a series and wrong for a hole in the middle of one. Those are different
    // facts — "the series starts here" against "the month before this one is missing" — and the
    // reason a reader sees should say which. The comparison is still refused either way.
    if (mom.state === "withheld" && mom.reason === "no_prior_month") {
      const hasEarlier = months.some((candidate) => candidate < month);
      if (hasEarlier) mom = { state: "withheld", reason: "prior_month_missing" };
    }

    const comparedTo = mom.state === "computed" ? (prior?.observationId ?? null) : null;

    points.push({
      seriesCode,
      referenceMonth: month,
      observationId: observation.observationId,
      previousObservationId: comparedTo,
      publishedLevel: level,
      unitValueUsdPerKg: unitValue,
      momChange: mom.state === "computed" ? mom.change : null,
      momWithheldReason: mom.state === "withheld" ? mom.reason : null,
      baseLabel,
      indexBaseId,
      sourceVintageOrdinal: observation.vintageOrdinal,
      methodologyVersionId: publicationMethodologyVersionId,
      inputsDigest: publicationDigest({
        seriesCode,
        referenceMonth: month,
        observationId: observation.observationId,
        vintageOrdinal: observation.vintageOrdinal,
        level,
        previousObservationId: comparedTo,
        momChange: mom.state === "computed" ? mom.change : null,
        momWithheldReason: mom.state === "withheld" ? mom.reason : null,
        // The base enters the digest by its own digest, so a rebuilt base propagates to every
        // Series B point that depends on it instead of leaving a stale publication behind.
        indexBaseDigest: base?.inputsDigest ?? null,
        methodologyVersionId: publicationMethodologyVersionId,
        calculationVersion: UMPI_CALCULATION_VERSION,
      }),
    });
  }

  return points;
}
