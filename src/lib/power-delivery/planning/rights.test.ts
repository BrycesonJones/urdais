import { describe, expect, it } from "vitest";

import { mayPublishPlanningForecast, planningPublicationNotice } from "@/lib/power-delivery/planning/rights";
import type { PlanningRightsState, RightsClassification, VintagePublicationState } from "@/lib/power-delivery/planning/types";

const rights = (over: Partial<PlanningRightsState> & { rightsClassification: RightsClassification }): PlanningRightsState => ({
  sourceInterfaceSlug: "fixture-source",
  sourceName: "Fixture source",
  purpose: "public_raw_planning_value_display",
  disposition: "not_established",
  attributionRequired: false,
  attributionText: null,
  conditions: null,
  unresolvedIssue: null,
  termsDocumentUrl: null,
  reviewedBy: "fixture",
  reviewedOn: "2026-09-19",
  ...over,
});

const decide = (state: PlanningRightsState | null, publicationState: VintagePublicationState = "published") =>
  mayPublishPlanningForecast({ rights: state, publicationState, purpose: "public_raw_planning_value_display" });

describe("planning forecast publication policy", () => {
  it("publishes a clearly reusable source", () => {
    expect(decide(rights({ rightsClassification: "clearly_reusable" }))).toMatchObject({
      allowed: true, reasonCode: "allowed_clearly_reusable", rightsClassification: "clearly_reusable",
    });
  });

  it("publishes a source granted with attribution and carries the conditions forward", () => {
    const decision = decide(rights({
      rightsClassification: "reusable_with_attribution_or_conditions",
      disposition: "permitted",
      attributionRequired: true,
      attributionText: "Source: Electric Reliability Council of Texas, Inc.",
      conditions: "Credit ERCOT as the source.",
    }));
    expect(decision).toMatchObject({ allowed: true, reasonCode: "allowed_with_attribution_or_conditions" });
    expect(planningPublicationNotice(decision)).toEqual({
      attribution: "Source: Electric Reliability Council of Texas, Inc.",
      conditions: "Credit ERCOT as the source.",
      unresolvedIssue: null,
      rightsClassification: "reusable_with_attribution_or_conditions",
    });
  });

  it("publishes an ambiguous source under accepted risk without calling it cleared", () => {
    const decision = decide(rights({
      rightsClassification: "ambiguous_requires_legal_review",
      attributionRequired: true,
      attributionText: "Source: PJM Interconnection, L.L.C.",
      unresolvedIssue: "Does pjm.com copyright bar numeric tables in a commercial product?",
    }));
    expect(decision.allowed).toBe(true);
    expect(decision.reasonCode).toBe("allowed_under_founder_accepted_legal_risk");
    // The classification is passed through, not upgraded, and the open question travels with it.
    expect(decision.rightsClassification).toBe("ambiguous_requires_legal_review");
    expect(decision.unresolvedIssue).toBe("Does pjm.com copyright bar numeric tables in a commercial product?");
    expect(planningPublicationNotice(decision).unresolvedIssue).not.toBeNull();
  });

  it("does not publish a source that requires a permission Urdais does not hold", () => {
    expect(decide(rights({ rightsClassification: "unsuitable_without_permission", disposition: "prohibited" })))
      .toMatchObject({ allowed: false, reasonCode: "blocked_permission_prohibited", rightsClassification: "unsuitable_without_permission" });
    expect(decide(rights({ rightsClassification: "unsuitable_without_permission" })))
      .toMatchObject({ allowed: false, reasonCode: "blocked_unsuitable_without_permission" });
  });

  it("lets a later permission grant unblock a source without converting its classification", () => {
    const decision = decide(rights({
      rightsClassification: "unsuitable_without_permission",
      disposition: "permitted",
      attributionRequired: true,
      attributionText: "Source: Southwest Power Pool, Inc.",
    }));
    expect(decision).toMatchObject({ allowed: true, reasonCode: "allowed_by_explicit_permission_grant" });
    expect(decision.rightsClassification).toBe("unsuitable_without_permission");
  });

  it("refuses a revoked permission and a source with no determination at all", () => {
    expect(decide(rights({ rightsClassification: "clearly_reusable", disposition: "revoked" })))
      .toMatchObject({ allowed: false, reasonCode: "blocked_permission_revoked" });
    expect(decide(null)).toMatchObject({ allowed: false, reasonCode: "blocked_no_rights_record", rightsClassification: null });
  });

  it("refuses internal-only and withdrawn vintages however permissive the source is", () => {
    const permissive = rights({ rightsClassification: "clearly_reusable" });
    expect(decide(permissive, "internal_only")).toMatchObject({ allowed: false, reasonCode: "blocked_internal_only" });
    expect(decide(permissive, "withdrawn")).toMatchObject({ allowed: false, reasonCode: "blocked_withdrawn_vintage" });
    expect(decide(permissive, "publication_candidate").allowed).toBe(true);
  });

  it("refuses a value whose required credit line is missing", () => {
    expect(decide(rights({ rightsClassification: "clearly_reusable", attributionRequired: true, attributionText: null })))
      .toMatchObject({ allowed: false, reasonCode: "blocked_attribution_unavailable" });
  });

  it("is a publication question and refuses to answer an internal one", () => {
    expect(() => mayPublishPlanningForecast({
      rights: rights({ rightsClassification: "clearly_reusable", purpose: "internal_retention" }),
      publicationState: "published",
      purpose: "internal_retention",
    })).toThrow(/internal purpose/);
    expect(() => decide(rights({ rightsClassification: "clearly_reusable", purpose: "public_derived_planning_value_display" })))
      .toThrow(/rights determination is for/);
  });

  it("has no publication notice for a blocked decision", () => {
    expect(() => planningPublicationNotice(decide(null))).toThrow(/blocked/);
  });
});
