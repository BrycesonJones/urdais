/**
 * The Urdais publication policy, in one place, for any source value.
 *
 * PD-3B implemented this decision for planning forecasts. PD-4 needs the identical rule for
 * capacity components, network constraints and derived deliverable capacity, so the rule moves
 * here and the planning entry point becomes a typed wrapper over it. The policy itself is
 * unchanged, and the planning tests are the proof of that.
 *
 *   A source classified `ambiguous_requires_legal_review` may be ingested, calculated from and
 *   publicly displayed under founder-accepted legal risk, provided its classification,
 *   attribution requirement and unresolved issue travel with the value. A source classified
 *   `unsuitable_without_permission` is retained internally and blocked from publication unless a
 *   permission is actually obtained.
 *
 * Deciding to publish never upgrades a classification. Nothing here writes back to
 * `reference.source_use_permissions`, and the decision it returns carries the reviewer's finding
 * through untouched in both outcomes.
 */

export const RIGHTS_CLASSIFICATIONS = [
  "clearly_reusable",
  "reusable_with_attribution_or_conditions",
  "ambiguous_requires_legal_review",
  "unsuitable_without_permission",
] as const;
export type RightsClassification = (typeof RIGHTS_CLASSIFICATIONS)[number];

export type PermissionDisposition = "permitted" | "prohibited" | "revoked" | "not_established";

/** Urdais's own editorial intent for the thing being asked about, independent of the terms. */
export type SourcePublicationState = "internal_only" | "publication_candidate" | "published" | "withdrawn";

/** The determination in force for one source and one purpose, exactly as recorded. */
export type SourceRightsState = {
  sourceInterfaceSlug: string;
  sourceName: string;
  /** The purpose this determination is about. Compared against the purpose being asked. */
  purpose: string;
  rightsClassification: RightsClassification;
  disposition: PermissionDisposition;
  attributionRequired: boolean;
  attributionText: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  termsDocumentUrl: string | null;
  reviewedBy: string | null;
  reviewedOn: string | null;
};

export type PublicationReason =
  | "allowed_clearly_reusable"
  | "allowed_with_attribution_or_conditions"
  | "allowed_under_founder_accepted_legal_risk"
  | "allowed_by_explicit_permission_grant"
  | "blocked_unsuitable_without_permission"
  | "blocked_permission_prohibited"
  | "blocked_permission_revoked"
  | "blocked_no_rights_record"
  | "blocked_internal_only"
  | "blocked_withdrawn_vintage"
  | "blocked_attribution_unavailable";

export type PublicationDecision = {
  allowed: boolean;
  rightsClassification: RightsClassification | null;
  attributionRequired: boolean;
  attributionText: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  reasonCode: PublicationReason;
  purpose: string;
};

export type PublicationSubject = {
  rights: SourceRightsState | null;
  publicationState: SourcePublicationState;
  purpose: string;
  /** Whether `purpose` is one the caller's domain considers public. */
  isPublicPurpose: boolean;
};

function decision(
  purpose: string,
  rights: SourceRightsState | null,
  allowed: boolean,
  reasonCode: PublicationReason,
): PublicationDecision {
  return {
    allowed,
    rightsClassification: rights?.rightsClassification ?? null,
    attributionRequired: rights?.attributionRequired ?? false,
    attributionText: rights?.attributionText ?? null,
    conditions: rights?.conditions ?? null,
    unresolvedIssue: rights?.unresolvedIssue ?? null,
    reasonCode,
    purpose,
  };
}

/**
 * Whether one value may be shown publicly, and on what basis. The reason code is part of the
 * answer in both directions, so a blocked read can say why without a caller inspecting the
 * classification and reaching its own conclusion.
 */
export function mayPublishSourceValue(subject: PublicationSubject): PublicationDecision {
  if (!subject.isPublicPurpose) {
    throw new Error(`${subject.purpose} is an internal purpose; publication is not the question being asked`);
  }
  const { purpose, rights } = subject;

  if (rights === null) return decision(purpose, null, false, "blocked_no_rights_record");
  if (rights.purpose !== purpose) {
    throw new Error(`rights determination is for ${rights.purpose}, not ${purpose}`);
  }
  if (rights.disposition === "prohibited") return decision(purpose, rights, false, "blocked_permission_prohibited");
  if (rights.disposition === "revoked") return decision(purpose, rights, false, "blocked_permission_revoked");

  if (subject.publicationState === "internal_only") return decision(purpose, rights, false, "blocked_internal_only");
  if (subject.publicationState === "withdrawn") return decision(purpose, rights, false, "blocked_withdrawn_vintage");

  if (rights.attributionRequired && (rights.attributionText === null || rights.attributionText.trim() === "")) {
    return decision(purpose, rights, false, "blocked_attribution_unavailable");
  }

  if (rights.disposition === "permitted" && rights.rightsClassification === "unsuitable_without_permission") {
    return decision(purpose, rights, true, "allowed_by_explicit_permission_grant");
  }

  switch (rights.rightsClassification) {
    case "clearly_reusable":
      return decision(purpose, rights, true, "allowed_clearly_reusable");
    case "reusable_with_attribution_or_conditions":
      return decision(purpose, rights, true, "allowed_with_attribution_or_conditions");
    case "ambiguous_requires_legal_review":
      return decision(purpose, rights, true, "allowed_under_founder_accepted_legal_risk");
    case "unsuitable_without_permission":
      return decision(purpose, rights, false, "blocked_unsuitable_without_permission");
  }
}

export type PublicationNotice = {
  attribution: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  rightsClassification: RightsClassification | null;
};

export function publicationNotice(result: PublicationDecision): PublicationNotice {
  if (!result.allowed) throw new Error("a blocked value has no publication notice");
  return {
    attribution: result.attributionRequired ? result.attributionText : null,
    conditions: result.conditions,
    unresolvedIssue: result.unresolvedIssue,
    rightsClassification: result.rightsClassification,
  };
}
