/**
 * The access taxonomy, and the one place the public fold happens.
 *
 * Every consumer -- the read layer, the population script, the production check and the chart
 * -- routes through `publicClassOf`, so there is exactly one answer to "does a revenue-capped
 * community licence count as open-weight?" and it is stated here rather than reimplemented
 * three times with a chance of disagreeing.
 *
 * **Why restricted weights roll up to open-weight and non-commercial ones do not.** The line is
 * whether the weights are available for the ordinary commercial use the rest of the section
 * measures. Kimi K3 and MiniMax M3 impose real obligations above a revenue threshold, and
 * below it they are downloadable and usable in production like any other open model; they are
 * Open-weight. Weights published for non-commercial or research use only are a different
 * object: they cannot lawfully serve the paid inference whose volume and price this section
 * compares, so counting them as Open-weight would put them inside a commercial comparison they
 * are excluded from. They are reported as Unclassified, and the internal class is preserved so
 * the distinction stays recoverable.
 *
 * **Why `not_applicable` is unclassified rather than excluded.** A stealth or anonymised
 * endpoint has real volume and no publisher to ask. Dropping it would shrink the denominator
 * and inflate both known classes; calling it proprietary would be a guess. It is counted, and
 * named as uncounted.
 */

import { OpenWeightDerivationError } from "@/lib/open-weight/types";

/** The internal taxonomy, matching `reference.model_access_classes.access_class` exactly. */
export const MODEL_ACCESS_CLASSES = [
  "open_weights_unrestricted",
  "open_weights_restricted",
  "open_weights_noncommercial",
  "api_only_closed_weights",
  "unknown",
  "not_applicable",
] as const;

export type ModelAccessClass = (typeof MODEL_ACCESS_CLASSES)[number];

/** The three classes the chart shows. */
export const PUBLIC_ACCESS_CLASSES = ["open_weight", "proprietary", "unclassified"] as const;

export type PublicAccessClass = (typeof PUBLIC_ACCESS_CLASSES)[number];

/**
 * Which internal classes roll up to the public Open-weight bucket.
 *
 * `open_weights_noncommercial` is deliberately absent. Its weights are downloadable, which is
 * why it is an `open_weights_*` class internally, but it may not serve commercial inference --
 * and commercial inference is what the volume and price panels measure.
 */
const OPEN: ReadonlySet<ModelAccessClass> = new Set([
  "open_weights_unrestricted",
  "open_weights_restricted",
]);

/**
 * The fold. Total over the internal taxonomy: an unrecognised class throws rather than
 * defaulting, because a silent default would route a class nobody has thought about into a
 * published number.
 */
export function publicClassOf(accessClass: string): PublicAccessClass {
  if (OPEN.has(accessClass as ModelAccessClass)) return "open_weight";
  if (accessClass === "api_only_closed_weights") return "proprietary";
  if (accessClass === "open_weights_noncommercial" || accessClass === "unknown" || accessClass === "not_applicable") {
    return "unclassified";
  }
  throw new OpenWeightDerivationError(`unrecognised access class ${JSON.stringify(accessClass)}`);
}

export function isModelAccessClass(value: string): value is ModelAccessClass {
  return (MODEL_ACCESS_CLASSES as readonly string[]).includes(value);
}

/** How each class is named to a reader. Short, because it sits in a legend. */
export const PUBLIC_CLASS_LABEL: Record<PublicAccessClass, string> = {
  open_weight: "Open-weight",
  proprietary: "Proprietary",
  unclassified: "Unclassified",
};

/**
 * The licence-shaped detail a reader needs to not over-read the fold, where one exists.
 * Rendered beside a model, never aggregated into a claim about a class.
 */
export const ACCESS_CLASS_DETAIL: Record<ModelAccessClass, string> = {
  open_weights_unrestricted: "weights published under a licence with no field-of-use restriction",
  open_weights_restricted: "weights published under a licence that restricts some commercial use",
  open_weights_noncommercial: "weights published for non-commercial use only, so not comparable as commercial inference",
  api_only_closed_weights: "offered as hosted access; the publisher lists no downloadable weights",
  unknown: "Urdais has not established how this model's weights are distributed",
  not_applicable: "the source does not disclose which model served this volume",
};
