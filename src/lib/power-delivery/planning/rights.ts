/**
 * The Urdais rights policy for planning forecasts, in one place.
 *
 * The policy, stated plainly:
 *
 *   A source classified `ambiguous_requires_legal_review` may be ingested, normalized,
 *   calculated from and publicly displayed under founder-accepted legal risk, provided the
 *   source, its classification, its attribution requirement and the unresolved issue travel
 *   with the value. A source classified `unsuitable_without_permission` may be retained
 *   internally where that is appropriate, and must not be published unless a permission is
 *   actually obtained.
 *
 * Two things follow that are easy to get wrong, so they are enforced here rather than trusted:
 *
 *   1. Deciding to publish does not upgrade the classification. An ambiguous source that Urdais
 *      publishes is still ambiguous, and the decision returned below says so. Nothing in this
 *      module writes back to `reference.source_use_permissions`.
 *
 *   2. There is exactly one implementation. Frontend components, API routes and read functions
 *      call `mayPublishPlanningForecast`; none of them re-derives the answer from a
 *      classification string, because a second copy of this rule would eventually disagree with
 *      the first one on a source nobody was watching.
 */

import {
  isPublicPlanningUsePurpose,
  type PlanningRightsState,
  type PlanningUsePurpose,
  type PublicPlanningUsePurpose,
  type RightsClassification,
  type VintagePublicationState,
} from "@/lib/power-delivery/planning/types";

export type PlanningPublicationReason =
  /** The publisher places the material in the public domain or expressly permits reuse. */
  | "allowed_clearly_reusable"
  /** Reuse is granted subject to credit or other stored conditions. */
  | "allowed_with_attribution_or_conditions"
  /** The terms neither grant nor forbid; Urdais publishes and carries the risk. */
  | "allowed_under_founder_accepted_legal_risk"
  /** A permission was positively obtained, whatever the underlying classification says. */
  | "allowed_by_explicit_permission_grant"
  /** The terms require a permission Urdais does not hold. */
  | "blocked_unsuitable_without_permission"
  | "blocked_permission_prohibited"
  | "blocked_permission_revoked"
  /** No determination is in force for this source and purpose; silence is not permission. */
  | "blocked_no_rights_record"
  /** Urdais's own editorial state refuses it, however permissive the terms are. */
  | "blocked_internal_only"
  | "blocked_withdrawn_vintage"
  /** Credit is required and no credit line is recorded, so the condition cannot be met. */
  | "blocked_attribution_unavailable";

export type PlanningPublicationDecision = {
  allowed: boolean;
  /** The reviewer's classification, passed through untouched in both outcomes. */
  rightsClassification: RightsClassification | null;
  attributionRequired: boolean;
  attributionText: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  reasonCode: PlanningPublicationReason;
  purpose: PublicPlanningUsePurpose;
};

export type PlanningPublicationSubject = {
  /** The determination in force for this source and purpose, or null if there is none. */
  rights: PlanningRightsState | null;
  publicationState: VintagePublicationState;
  purpose: PlanningUsePurpose;
};

function decision(
  subject: { purpose: PublicPlanningUsePurpose; rights: PlanningRightsState | null },
  allowed: boolean,
  reasonCode: PlanningPublicationReason,
): PlanningPublicationDecision {
  const rights = subject.rights;
  return {
    allowed,
    rightsClassification: rights?.rightsClassification ?? null,
    attributionRequired: rights?.attributionRequired ?? false,
    attributionText: rights?.attributionText ?? null,
    conditions: rights?.conditions ?? null,
    unresolvedIssue: rights?.unresolvedIssue ?? null,
    reasonCode,
    purpose: subject.purpose,
  };
}

/**
 * Whether one planning vintage may be shown publicly, and on what basis. The reason code is part
 * of the answer in both directions: a blocked read should be able to say why without a caller
 * inspecting the classification and reaching its own conclusion.
 */
export function mayPublishPlanningForecast(subject: PlanningPublicationSubject): PlanningPublicationDecision {
  if (!isPublicPlanningUsePurpose(subject.purpose)) {
    throw new Error(`${subject.purpose} is an internal purpose; publication is not the question being asked`);
  }
  const purpose = subject.purpose;
  const rights = subject.rights;
  const context = { purpose, rights };

  if (rights === null) return decision(context, false, "blocked_no_rights_record");
  if (rights.purpose !== purpose) {
    throw new Error(`rights determination is for ${rights.purpose}, not ${purpose}`);
  }
  if (rights.disposition === "prohibited") return decision(context, false, "blocked_permission_prohibited");
  if (rights.disposition === "revoked") return decision(context, false, "blocked_permission_revoked");

  // Urdais's own gate. A permissive source still does not reach the public surface while the
  // vintage is held internal or has been withdrawn.
  if (subject.publicationState === "internal_only") return decision(context, false, "blocked_internal_only");
  if (subject.publicationState === "withdrawn") return decision(context, false, "blocked_withdrawn_vintage");

  // A condition that cannot be honoured is a condition that has not been met.
  if (rights.attributionRequired && (rights.attributionText === null || rights.attributionText.trim() === "")) {
    return decision(context, false, "blocked_attribution_unavailable");
  }

  // An explicit permission is decisive regardless of how restrictive the source's published
  // terms were when they were first reviewed. The classification stays as the reviewer left it.
  if (rights.disposition === "permitted" && rights.rightsClassification === "unsuitable_without_permission") {
    return decision(context, true, "allowed_by_explicit_permission_grant");
  }

  switch (rights.rightsClassification) {
    case "clearly_reusable":
      return decision(context, true, "allowed_clearly_reusable");
    case "reusable_with_attribution_or_conditions":
      return decision(context, true, "allowed_with_attribution_or_conditions");
    case "ambiguous_requires_legal_review":
      return decision(context, true, "allowed_under_founder_accepted_legal_risk");
    case "unsuitable_without_permission":
      return decision(context, false, "blocked_unsuitable_without_permission");
  }
}

/** The attribution and open-question text a public surface is obliged to render alongside a value. */
export type PlanningPublicationNotice = {
  attribution: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  rightsClassification: RightsClassification | null;
};

export function planningPublicationNotice(decisionResult: PlanningPublicationDecision): PlanningPublicationNotice {
  if (!decisionResult.allowed) throw new Error("a blocked planning forecast has no publication notice");
  return {
    attribution: decisionResult.attributionRequired ? decisionResult.attributionText : null,
    conditions: decisionResult.conditions,
    unresolvedIssue: decisionResult.unresolvedIssue,
    rightsClassification: decisionResult.rightsClassification,
  };
}
