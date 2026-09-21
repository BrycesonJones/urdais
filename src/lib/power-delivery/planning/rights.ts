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

import { mayPublishSourceValue, publicationNotice } from "@/lib/rights/publication";
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

/**
 * The planning entry point. PD-4 needs the identical rule for capacity values, so the decision
 * itself lives in `@/lib/rights/publication` and this is a typed wrapper: it fixes the purpose
 * vocabulary to the planning purposes and returns the planning-shaped result. The policy is the
 * shared one, and the tests in this file are what prove the move changed nothing.
 */
export function mayPublishPlanningForecast(subject: PlanningPublicationSubject): PlanningPublicationDecision {
  const decision = mayPublishSourceValue({
    rights: subject.rights,
    publicationState: subject.publicationState,
    purpose: subject.purpose,
    isPublicPurpose: isPublicPlanningUsePurpose(subject.purpose),
  });
  return { ...decision, purpose: decision.purpose as PublicPlanningUsePurpose };
}

/** The attribution and open-question text a public surface is obliged to render alongside a value. */
export type PlanningPublicationNotice = {
  attribution: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  rightsClassification: RightsClassification | null;
};

export function planningPublicationNotice(decisionResult: PlanningPublicationDecision): PlanningPublicationNotice {
  return publicationNotice(decisionResult);
}
