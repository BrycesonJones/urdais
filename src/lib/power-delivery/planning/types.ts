/**
 * PD-3 planning demand. A separate domain from the PD-2 operational store: nothing here is an
 * hourly measurement, and none of these types is assignable to a `PowerObservation`.
 */

export const RIGHTS_CLASSIFICATIONS = [
  "clearly_reusable",
  "reusable_with_attribution_or_conditions",
  "ambiguous_requires_legal_review",
  "unsuitable_without_permission",
] as const;
export type RightsClassification = (typeof RIGHTS_CLASSIFICATIONS)[number];

export const PLANNING_USE_PURPOSES = [
  "internal_retention",
  "internal_calculation",
  "public_raw_planning_value_display",
  "public_derived_planning_value_display",
] as const;
export type PlanningUsePurpose = (typeof PLANNING_USE_PURPOSES)[number];

export const PUBLIC_PLANNING_USE_PURPOSES = [
  "public_raw_planning_value_display",
  "public_derived_planning_value_display",
] as const;
export type PublicPlanningUsePurpose = (typeof PUBLIC_PLANNING_USE_PURPOSES)[number];

export function isPublicPlanningUsePurpose(purpose: PlanningUsePurpose): purpose is PublicPlanningUsePurpose {
  return (PUBLIC_PLANNING_USE_PURPOSES as readonly string[]).includes(purpose);
}

/** `not_established` is the ordinary state of an ambiguous source: review reached no permission. */
export type PermissionDisposition = "permitted" | "prohibited" | "revoked" | "not_established";

/** Urdais's own editorial intent for a vintage, independent of what the publisher's terms allow. */
export type VintagePublicationState = "internal_only" | "publication_candidate" | "published" | "withdrawn";

export type QualityStatus = "accepted" | "provisional" | "suspect";
export type TargetPeriodKind = "annual" | "seasonal" | "hourly_profile";
export type TargetSeason = "winter" | "spring" | "summer" | "fall";
export type GeographicGrain = "balancing_authority" | "zone" | "load_area" | "weather_zone" | "utility" | "sub_region" | "other";
export type PeakType = "coincident_peak" | "non_coincident_peak" | "hourly_load" | "annual_energy" | "average_load" | "unspecified";
export type LoadBasis = "gross" | "net" | "unspecified";
export type LargeLoadPolicy = "included_all" | "included_screened" | "included_probability_weighted" | "excluded" | "unspecified";
export type WeatherBasis =
  | "normal" | "p50" | "p90" | "p10" | "p99"
  | "one_in_two" | "one_in_five" | "one_in_ten" | "one_in_twenty"
  | "weather_year" | "extreme" | "unspecified";
export type PlanningUnit = "MW" | "GW" | "MWh" | "GWh";
export type SupersessionKind = "correction" | "reissue";

/** The rights determination in force for one source and one purpose, exactly as recorded. */
export type PlanningRightsState = {
  sourceInterfaceSlug: string;
  sourceName: string;
  purpose: PlanningUsePurpose;
  /** The reviewer's finding. Never rewritten because Urdais decided to publish under it. */
  rightsClassification: RightsClassification;
  disposition: PermissionDisposition;
  attributionRequired: boolean;
  attributionText: string | null;
  conditions: string | null;
  /** The question a legal review has not answered. Kept visible wherever the value is shown. */
  unresolvedIssue: string | null;
  termsDocumentUrl: string | null;
  reviewedBy: string | null;
  reviewedOn: string | null;
};

export type PlanningForecastVintage = {
  id: string;
  marketSlug: string;
  marketName: string;
  eiaBaCode: string;
  gridAreaId: string;
  sourceInterfaceSlug: string;
  sourceName: string;
  nativeVintageKey: string;
  nativeReportId: string | null;
  reportTitle: string;
  publishedAt: string;
  publishedAtPrecision: "year" | "month" | "day" | "minute";
  retrievedAt: string;
  sourceMethodologyName: string | null;
  sourceMethodologyVersion: string | null;
  rightsClassification: RightsClassification;
  publicationState: VintagePublicationState;
  qualityStatus: QualityStatus;
  supersededById: string | null;
  supersededAt: string | null;
  supersessionReason: string | null;
  supersessionKind: SupersessionKind | null;
  /** The determination in force for the purpose the read was made under; null when none is. */
  rights: PlanningRightsState | null;
};

export type PlanningForecastScenario = {
  id: string;
  vintageId: string;
  nativeScenarioKey: string;
  nativeScenarioLabel: string;
  canonicalClass: "reference" | "high" | "low" | "other" | null;
  isReference: boolean;
  weatherBasis: WeatherBasis;
  loadBasis: LoadBasis;
  largeLoadPolicy: LargeLoadPolicy;
  assumptions: Record<string, unknown>;
  assumptionsText: string | null;
};

export type PlanningForecastPoint = {
  id: string;
  vintageId: string;
  scenarioId: string;
  gridAreaId: string;
  rawRecordId: string;
  geographicGrain: GeographicGrain;
  nativeGeographyLabel: string | null;
  targetPeriodKind: TargetPeriodKind;
  targetYear: number;
  targetSeason: TargetSeason | null;
  /** Present only where the publisher itself released an hourly planning profile. */
  targetTimestamp: string | null;
  value: number;
  unit: PlanningUnit;
  peakType: PeakType;
  weatherBasis: WeatherBasis;
  loadBasis: LoadBasis;
  largeLoadPolicy: LargeLoadPolicy;
  sourceMethodologyName: string | null;
  sourceMethodologyVersion: string | null;
  qualityStatus: QualityStatus;
  supersededById: string | null;
};
