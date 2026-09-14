/**
 * The application-side publication gate. The database enforces the structural
 * shape independently; this gate adds what only the application knows, such as
 * the expected versions, the permission lineage of the inputs, and that no
 * participant price is about to leave the system. Every failure is named.
 */

import type { RegionalObservation } from "@/lib/ucpi/aggregation";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import type { Retrieval } from "@/lib/ucpi/domain";
import type { CalculationRunRow } from "@/lib/ucpi/runtime/persistence";

export type PublicationGateInput = {
  regional: RegionalObservation;
  run: CalculationRunRow;
  expected: { methodologyVersion: string; instrumentSpecVersion: string };
  /** Retrievals behind the participants, for permission lineage. */
  inputRetrievals: readonly Retrieval[];
  /** The intended publication instant. */
  publishAt: Date;
  /** The series point that would be exposed, serialized, to prove it carries no participant price. */
  exposedJson: string;
  participantPrices: readonly number[];
};

export type PublicationGateResult = { ok: true; status: "published" | "delayed" } | { ok: false; reasons: string[] };

export function validateForPublication(input: PublicationGateInput): PublicationGateResult {
  const reasons: string[] = [];
  const { regional, run } = input;

  if (run.runKind === "simulation") reasons.push("RUN_IS_SIMULATION");
  if (run.methodologyVersion !== input.expected.methodologyVersion) reasons.push("METHODOLOGY_VERSION_MISMATCH");
  if (run.instrumentSpecVersion !== input.expected.instrumentSpecVersion) reasons.push("SPEC_VERSION_MISMATCH");
  if (regional.methodologyVersion !== run.methodologyVersion || regional.instrumentSpecVersion !== run.instrumentSpecVersion) reasons.push("OBSERVATION_VERSION_MISMATCH");

  const window = calculationWindow(run.calculationDate);
  if (run.windowStart !== window.windowStart || run.cutoff !== window.cutoff || run.publicationDeadline !== window.publicationDeadline) reasons.push("CALCULATION_WINDOW_INVALID");
  if (regional.calculationDate !== run.calculationDate) reasons.push("CALCULATION_DATE_MISMATCH");
  if (Date.parse(run.calculatedAt) < Date.parse(window.cutoff)) reasons.push("CALCULATED_BEFORE_CUTOFF");

  if (regional.outcome === "value") {
    for (const r of input.inputRetrievals) {
      if (r.retrievalPurpose !== "production") reasons.push(`INPUT_NOT_PRODUCTION:${r.id}`);
      if (r.permissionGrantId === null) reasons.push(`INPUT_WITHOUT_PERMISSION_GRANT:${r.id}`);
      if (r.completedAt === null || Date.parse(r.completedAt) < Date.parse(window.windowStart) || Date.parse(r.completedAt) >= Date.parse(window.cutoff)) {
        reasons.push(`INPUT_OUTSIDE_WINDOW:${r.id}`);
      }
    }
    if (regional.participants.length !== regional.participantCount) reasons.push("PARTICIPANT_COUNT_MISMATCH");
    if (regional.participantCount < 2) reasons.push("VALUE_WITH_FEWER_THAN_TWO_PARTICIPANTS");
    if (regional.participantCount === 2 && regional.marketBreadth !== "minimum") reasons.push("N2_NOT_MINIMUM_BREADTH");
    if (regional.participantCount >= 3 && regional.marketBreadth !== "normal") reasons.push("N3_NOT_NORMAL_BREADTH");
    if (regional.participantCount === 2 && (regional.dispersionPublished || regional.dispersion !== null)) reasons.push("DISPERSION_AT_N2");
    if (regional.priceLevel === null || !(regional.priceLevel > 0)) reasons.push("PRICE_LEVEL_INVALID");
    if (regional.structuralCondition !== null) reasons.push("STRUCTURAL_CONDITION_ON_VALUE");
    if ((regional.changeDisposition === "withheld" || regional.changeDisposition === null) !== (regional.percentageChange1d === null)) reasons.push("PERCENTAGE_CHANGE_INCONSISTENT");
    if (regional.participantCount === 2) {
      for (const p of input.participantPrices) {
        if (input.exposedJson.includes(String(p))) reasons.push("PARTICIPANT_PRICE_EXPOSED_AT_N2");
      }
    }
  } else {
    if (regional.priceLevel !== null) reasons.push("PRICE_ON_UNAVAILABLE");
    if (regional.structuralCondition === null) reasons.push("UNAVAILABLE_WITHOUT_CONDITION");
    if (regional.participantCount > 1) reasons.push("UNAVAILABLE_WITH_PARTICIPANTS");
  }

  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };
  const status = input.publishAt.getTime() < Date.parse(window.publicationDeadline) ? "published" : "delayed";
  return { ok: true, status };
}
