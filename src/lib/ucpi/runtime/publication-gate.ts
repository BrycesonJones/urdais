/**
 * The application-side publication gate. The database enforces the structural
 * shape independently; this gate adds what only the application knows, such as
 * the expected versions, the permission lineage of the inputs, and that no
 * participant price is about to leave the system. Every failure is named.
 *
 * Approval is a gate, not a label. Both UCPI 0.1.2-draft and the LISTED-GPU
 * specification require approved versions of the family methodology and of the
 * child before a first publication, and say that a value computed before then
 * is a labelled candidate. The calculation still runs and the regional
 * observation is still recorded; only the publication is refused. Because the
 * status is a required input, a caller cannot publish without stating where
 * each version stands, and an omission is a type error rather than a release.
 */

import type { RegionalObservation } from "@/lib/ucpi/aggregation";
import { validatePublicResponseShape } from "@/lib/ucpi/api-contract";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import type { Retrieval } from "@/lib/ucpi/domain";
import type { CalculationRunRow } from "@/lib/ucpi/runtime/persistence";

/** The lifecycle of a registry version, mirroring reference.*_versions.status. */
export type VersionApprovalState = "draft" | "approved" | "superseded" | "retired";

/**
 * The versions a run is expected to carry, each with where it stands in the
 * registry. Only "approved" may publish.
 */
export type ExpectedVersions = {
  methodologyVersion: string;
  instrumentSpecVersion: string;
  methodologyVersionStatus: VersionApprovalState;
  instrumentSpecVersionStatus: VersionApprovalState;
};

export type PublicationGateInput = {
  regional: RegionalObservation;
  run: CalculationRunRow;
  expected: ExpectedVersions;
  /** Retrievals behind the participants, for permission lineage. */
  inputRetrievals: readonly Retrieval[];
  /** The intended publication instant. */
  publishAt: Date;
  /** The series point that would be exposed, serialized. Checked structurally against the public schema. */
  exposedJson: string;
};

export type PublicationGateResult = { ok: true; status: "published" | "delayed" } | { ok: false; reasons: string[] };

export function validateForPublication(input: PublicationGateInput): PublicationGateResult {
  const reasons: string[] = [];
  const { regional, run } = input;

  if (run.runKind === "simulation") reasons.push("RUN_IS_SIMULATION");
  if (run.methodologyVersion !== input.expected.methodologyVersion) reasons.push("METHODOLOGY_VERSION_MISMATCH");
  if (run.instrumentSpecVersion !== input.expected.instrumentSpecVersion) reasons.push("SPEC_VERSION_MISMATCH");
  if (input.expected.methodologyVersionStatus !== "approved") reasons.push(`METHODOLOGY_VERSION_NOT_APPROVED:${input.expected.methodologyVersionStatus}`);
  if (input.expected.instrumentSpecVersionStatus !== "approved") reasons.push(`SPEC_VERSION_NOT_APPROVED:${input.expected.instrumentSpecVersionStatus}`);
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
  } else {
    if (regional.priceLevel !== null) reasons.push("PRICE_ON_UNAVAILABLE");
    if (regional.structuralCondition === null) reasons.push("UNAVAILABLE_WITHOUT_CONDITION");
    if (regional.participantCount > 1) reasons.push("UNAVAILABLE_WITH_PARTICIPANTS");
  }

  // The public response is checked by shape, never by value: constituent and lineage fields are forbidden at
  // any depth and only the contract's keys may appear. An aggregate that happens to equal a participant's
  // price is legitimate and publishes.
  let exposed: unknown;
  try {
    exposed = JSON.parse(input.exposedJson) as unknown;
  } catch {
    exposed = undefined;
  }
  reasons.push(...(exposed === undefined ? ["PUBLIC_RESPONSE_NOT_OBJECT"] : validatePublicResponseShape(exposed)));

  if (reasons.length > 0) return { ok: false, reasons: [...new Set(reasons)] };
  const status = input.publishAt.getTime() < Date.parse(window.publicationDeadline) ? "published" : "delayed";
  return { ok: true, status };
}
