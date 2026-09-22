/**
 * Admission rules for a raw source row.
 *
 * A row is admitted or rejected with a reason. Nothing is coerced, rounded into range, or
 * repaired: an adapter that cannot produce a well-formed observation has found something worth
 * knowing about the source, and silently fixing it would destroy that signal.
 */

import { identityMatches } from "./identity";
import { isReferenceMonth } from "./reference-month";
import type { UmpiRawObservation, UmpiSourceIdentity } from "./types";

export type RejectionCode =
  | "identity_mismatch"
  | "malformed_reference_month"
  | "non_numeric_value"
  | "non_positive_index_level"
  | "negative_export_value"
  | "negative_export_weight"
  | "zero_export_weight"
  | "observation_kind_mismatch";

export type AdmissionResult =
  | { state: "admitted"; observation: UmpiRawObservation }
  | { state: "rejected"; code: RejectionCode; detail: string };

/**
 * Whether a candidate row belongs to the series it claims, and is well formed.
 *
 * `expectedIdentity` is compared on codes, never on a display name: the whole point of the
 * identity module is that `30911201AA` alone does not say which BOK table a row came from.
 *
 * A zero export weight is rejected here rather than at the division, because a month with no
 * exported weight has no unit value and admitting it would push the failure into the
 * calculation layer where the reason would be lost.
 */
export function admit(input: {
  expectedIdentity: UmpiSourceIdentity;
  actualIdentity: UmpiSourceIdentity;
  observation: UmpiRawObservation;
}): AdmissionResult {
  const { expectedIdentity, actualIdentity, observation } = input;

  if (!identityMatches(expectedIdentity, actualIdentity)) {
    return {
      state: "rejected",
      code: "identity_mismatch",
      detail: "the row's source identity is not the one this series is bound to",
    };
  }

  const expectedKind = expectedIdentity.kind === "bok_ecos_series" ? "bok_index_level" : "kcs_trade_month";
  if (observation.kind !== expectedKind) {
    return {
      state: "rejected",
      code: "observation_kind_mismatch",
      detail: `a ${expectedIdentity.kind} source cannot produce a ${observation.kind} observation`,
    };
  }

  if (!isReferenceMonth(observation.referenceMonth)) {
    return {
      state: "rejected",
      code: "malformed_reference_month",
      detail: `reference month ${JSON.stringify(observation.referenceMonth)} is not YYYY-MM`,
    };
  }

  if (observation.kind === "bok_index_level") {
    if (!Number.isFinite(observation.indexLevel)) {
      return { state: "rejected", code: "non_numeric_value", detail: "index level is not a finite number" };
    }
    if (observation.indexLevel <= 0) {
      return {
        state: "rejected",
        code: "non_positive_index_level",
        detail: "an index level of zero or less is not a measurement",
      };
    }
    return { state: "admitted", observation };
  }

  if (!Number.isFinite(observation.exportValueUsd) || !Number.isFinite(observation.exportWeightKg)) {
    return { state: "rejected", code: "non_numeric_value", detail: "export value or weight is not a finite number" };
  }
  if (observation.exportValueUsd < 0) {
    return { state: "rejected", code: "negative_export_value", detail: "export value is negative" };
  }
  if (observation.exportWeightKg < 0) {
    return { state: "rejected", code: "negative_export_weight", detail: "export weight is negative" };
  }
  if (observation.exportWeightKg === 0) {
    return {
      state: "rejected",
      code: "zero_export_weight",
      detail: "a month with no exported weight has no unit value",
    };
  }
  return { state: "admitted", observation };
}
