/**
 * The rights gate for UEPI values: a typed wrapper over the one Urdais publication policy.
 *
 * The policy itself lives in `@/lib/rights/publication` and is not restated, re-derived or
 * weakened here. This module does two things and nothing else: it fixes the purpose vocabulary to
 * UEPI's purposes, and it adds the one UEPI-specific condition the shared policy cannot know about
 * -- that a series whose own posture is `internal_only` or `not_built` is never public, however
 * permissive its terms turn out to be.
 *
 * Why both gates exist. The terms answer "may Urdais show this?"; the posture answers "has Urdais
 * built and decided to show this?". PJM, MISO and SPP fail the first. ISO-NE would pass the first
 * (its classification is ambiguous, which the platform publishes under founder-accepted risk) and
 * fails the second, because no ISO-NE payload has ever been observed and publishing a series whose
 * field mapping is unverified would be a guess wearing a value's clothes.
 *
 * Deciding to publish never upgrades a classification. Nothing here writes to
 * `reference.source_use_permissions`, and both outcomes carry the reviewer's finding through.
 */

import {
  mayPublishSourceValue, publicationNotice,
  type PublicationDecision, type PublicationNotice, type SourcePublicationState, type SourceRightsState,
} from "@/lib/rights/publication";
import type { UepiBenchmark } from "@/lib/uepi/types";

/** Internal purposes are not publication questions; public ones are. */
export const UEPI_USE_PURPOSES = [
  "uepi_retention",
  "uepi_calculation",
  "public_derived_uepi_value_display",
  "public_raw_wholesale_price_display",
] as const;

export type UepiUsePurpose = (typeof UEPI_USE_PURPOSES)[number];

export const PUBLIC_UEPI_USE_PURPOSES = [
  "public_derived_uepi_value_display",
  "public_raw_wholesale_price_display",
] as const;

export type PublicUepiUsePurpose = (typeof PUBLIC_UEPI_USE_PURPOSES)[number];

export function isPublicUepiUsePurpose(purpose: string): purpose is PublicUepiUsePurpose {
  return (PUBLIC_UEPI_USE_PURPOSES as readonly string[]).includes(purpose);
}

/** The purpose a released daily value is shown under. The only one a public surface needs. */
export const DERIVED_VALUE_PURPOSE: PublicUepiUsePurpose = "public_derived_uepi_value_display";

export type UepiPublicationReason =
  | PublicationDecision["reasonCode"]
  /** Urdais has not built this series to release. ISO-NE: no credential, no observed payload. */
  | "blocked_series_not_built"
  /** The series is stored and calculated, and Urdais does not display it. */
  | "blocked_series_internal_only";

export type UepiPublicationDecision = Omit<PublicationDecision, "reasonCode"> & {
  readonly reasonCode: UepiPublicationReason;
  readonly seriesId: string;
};

export type UepiPublicationSubject = {
  readonly benchmark: UepiBenchmark;
  /** The determination in force for this source and purpose, or null when there is none. */
  readonly rights: SourceRightsState | null;
  readonly publicationState: SourcePublicationState;
  readonly purpose: UepiUsePurpose;
};

/**
 * Whether one UEPI value may be shown publicly, and on what basis.
 *
 * Posture is checked first, and deliberately: a series Urdais has not built or has decided not to
 * display must not depend on a rights record existing, or on what it says. The terms decision then
 * runs unchanged, so an ambiguous source still publishes under founder-accepted risk with its
 * unresolved issue attached, and an unsuitable one still blocks.
 */
export function mayPublishUepiValue(subject: UepiPublicationSubject): UepiPublicationDecision {
  const { benchmark, purpose } = subject;
  if (!isPublicUepiUsePurpose(purpose)) {
    throw new Error(`${purpose} is an internal purpose; publication is not the question being asked`);
  }

  const blocked = (reasonCode: UepiPublicationReason): UepiPublicationDecision => ({
    allowed: false,
    rightsClassification: subject.rights?.rightsClassification ?? null,
    attributionRequired: subject.rights?.attributionRequired ?? false,
    attributionText: subject.rights?.attributionText ?? null,
    conditions: subject.rights?.conditions ?? null,
    unresolvedIssue: subject.rights?.unresolvedIssue ?? null,
    reasonCode,
    purpose,
    seriesId: benchmark.seriesId,
  });

  if (benchmark.publicationPosture === "not_built") return blocked("blocked_series_not_built");
  if (benchmark.publicationPosture === "internal_only") return blocked("blocked_series_internal_only");

  const decision = mayPublishSourceValue({
    rights: subject.rights,
    publicationState: subject.publicationState,
    purpose,
    isPublicPurpose: true,
  });
  return { ...decision, seriesId: benchmark.seriesId };
}

/** The attribution and open-question text a public surface is obliged to render with a value. */
export function uepiPublicationNotice(decision: UepiPublicationDecision): PublicationNotice {
  if (!decision.allowed) throw new Error("a blocked value has no publication notice");
  // An allowed decision always carries one of the shared reason codes: the two UEPI-only codes
  // above are refusals, so this narrowing cannot discard a real outcome.
  return publicationNotice({ ...decision, reasonCode: decision.reasonCode as PublicationDecision["reasonCode"] });
}
