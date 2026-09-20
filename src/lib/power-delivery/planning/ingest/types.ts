/**
 * The contract every planning source implements.
 *
 * Publishers do not agree about anything: ERCOT states net coincident seasonal peaks by weather
 * zone, PJM states monthly peak and energy per zone, the CEC states an annual peak with its
 * components broken out, ISO-NE states a probability distribution. Forcing those into one shape
 * would mean discarding the part of each that makes it meaningful, so an adapter's job is to
 * carry the publisher's own semantics through to the canonical point, not to flatten them.
 *
 * What is shared is everything around that: retrieval, hashing, rights snapshots, vintage and
 * scenario identity, locator provenance, idempotence and supersession. Those live in the
 * framework and no adapter reimplements them.
 *
 * `parse` is a pure function of retrieved bytes. That is what makes a fixture test meaningful:
 * the same artifact always produces the same records, and the network is not involved.
 */

import type {
  GeographicGrain, LargeLoadPolicy, LoadBasis, PeakType, PlanningUnit, QualityStatus,
  TargetSeason, VintagePublicationState, WeatherBasis,
} from "@/lib/power-delivery/planning/types";

/** Every planning source Urdais has assessed. Being named here is not being collectable. */
export const PLANNING_SOURCE_KEYS = ["ercot", "pjm", "cec", "nyiso", "isone", "spp", "miso"] as const;
export type PlanningSourceKey = (typeof PLANNING_SOURCE_KEYS)[number];

/** PD-3C adds monthly, which three of the six publishers state natively. */
export type PlanningTargetPeriodKind = "annual" | "seasonal" | "monthly" | "hourly_profile";

export type PlanningExtractionMethod =
  | "workbook_cell" | "pdf_table" | "csv_row" | "html_table" | "manual_transcription";

/** Where a value was read from, precisely enough to go back and look at it. */
export type PlanningLocator = {
  extractionMethod: PlanningExtractionMethod;
  workbookSheet?: string;
  workbookRange?: string;
  workbookCell?: string;
  pdfPage?: number;
  pdfTable?: string;
  csvRowNumber?: number;
  htmlSelector?: string;
  /** The container the artifact arrived in, and the member within it. */
  archiveRef?: string;
  archiveMember?: string;
  archiveMemberHash?: string;
};

export type CanonicalPointDraft = {
  scenarioKey: string;
  geographicGrain: GeographicGrain;
  /** Required for anything that is not the whole balancing-authority area. */
  nativeGeographyLabel: string | null;
  targetPeriodKind: PlanningTargetPeriodKind;
  targetYear: number;
  targetSeason: TargetSeason | null;
  targetMonth: number | null;
  targetTimestamp: string | null;
  value: number;
  unit: PlanningUnit;
  peakType: PeakType;
  weatherBasis: WeatherBasis;
  loadBasis: LoadBasis;
  largeLoadPolicy: LargeLoadPolicy;
};

export type ExtractedPlanningRecord = {
  /** Which retrieved artifact this came out of. */
  artifactLabel: string;
  nativeGeography: string;
  nativePeriod: string;
  nativeScenario: string | null;
  nativeValue: string;
  nativeUnit: string;
  rawPayload: Record<string, unknown>;
  locator: PlanningLocator;
  point: CanonicalPointDraft;
};

export type PlanningVintageDraft = {
  nativeVintageKey: string;
  nativeReportId: string | null;
  reportTitle: string;
  publishedAt: string;
  publishedAtPrecision: "year" | "month" | "day" | "minute";
  sourceMethodologyName: string | null;
  sourceMethodologyVersion: string | null;
  publicationState: VintagePublicationState;
  qualityStatus: QualityStatus;
};

export type PlanningScenarioDraft = {
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

export type PlanningExtraction = {
  vintage: PlanningVintageDraft;
  scenarios: PlanningScenarioDraft[];
  records: ExtractedPlanningRecord[];
};

export type PlanningArtifactRef = { label: string; url: string };

export type RetrievedArtifact = {
  label: string;
  url: string;
  retrievedAt: string;
  status: number;
  contentType: string | null;
  byteLength: number;
  sha256: string;
  body: Buffer;
};

export interface PlanningAdapter {
  key: PlanningSourceKey;
  /** The PD-2 physical grid area this publisher forecasts for. */
  marketSlug: string;
  sourceInterfaceSlug: string;
  /**
   * `production` for sources Urdais may publish or derive from; `research` for a source that is
   * retained internally only, which is what SPP's rights determination permits.
   */
  retrievalPurpose: "production" | "research";
  artifacts: PlanningArtifactRef[];
  parse(artifacts: ReadonlyMap<string, RetrievedArtifact>): PlanningExtraction;
}

/** Thrown when a source no longer looks the way the adapter was written against. */
export class PlanningSourceFormatError extends Error {
  constructor(
    readonly source: PlanningSourceKey,
    message: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "PlanningSourceFormatError";
  }
}
