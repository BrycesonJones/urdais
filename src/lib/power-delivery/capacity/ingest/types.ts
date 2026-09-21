/**
 * The contract a grid capacity source implements.
 *
 * Shaped like the PD-3 planning adapters, with one addition the capacity sources forced: a
 * normalized record may decline to become a canonical row. CAISO's NQC report is resource-level
 * and the component model is area-level, so turning it into an area capability would be a
 * summation Urdais performed rather than a value CAISO published. `evidence_only` lets the
 * adapter keep every row's provenance while saying, in the data, why no canonical value follows.
 *
 * Nothing here defaults. A record states its own classification, capacity basis, geography and
 * period basis, because every one of those has a wrong answer that looks plausible.
 */

import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type {
  CapacityBasis, CapacityComponentKind, CapacityPeriodBasis, CapacityQualityStatus,
  CapacitySeason, CapacityUnit, GridConstraintKind, GridInterfaceKind, GridSubareaKind,
} from "@/lib/power-delivery/capacity/types";

export const CAPACITY_SOURCE_KEYS = ["ercot", "caiso", "iso-ne"] as const;
export type CapacitySourceKey = (typeof CAPACITY_SOURCE_KEYS)[number];

export type CapacityExtractionMethod =
  | "workbook_cell" | "pdf_table" | "csv_row" | "html_table" | "tariff_clause" | "manual_transcription";

export type CapacityLocator = {
  extractionMethod: CapacityExtractionMethod;
  workbookSheet?: string;
  workbookRange?: string;
  workbookCell?: string;
  pdfPage?: number;
  pdfTable?: string;
  csvRowNumber?: number;
  htmlSelector?: string;
  documentSection?: string;
  clauseReference?: string;
  archiveRef?: string;
  archiveMember?: string;
  archiveMemberHash?: string;
};

export type CapacityTargetPeriod = {
  periodBasis: CapacityPeriodBasis;
  targetYear: number;
  targetSeason: CapacitySeason | null;
  periodStart: string | null;
  periodEnd: string | null;
};

/** A quantity that becomes a row in pipeline.grid_capacity_components. */
export type ComponentTarget = {
  kind: "component";
  scenarioKey: string;
  quantityKind: "capability" | "requirement" | "resource_quantity" | "diagnostic_only";
  componentKind: CapacityComponentKind;
  capacityBasis: CapacityBasis;
  /** Native key of a locality this value is about, or null for the whole balancing authority. */
  subareaNativeKey: string | null;
  interfaceNativeKey: string | null;
  period: CapacityTargetPeriod;
  value: number;
  unit: CapacityUnit;
};

/** A network limit that becomes a row in pipeline.grid_constraint_values. */
export type ConstraintTarget = {
  kind: "constraint";
  scenarioKey: string;
  constraintKind: GridConstraintKind;
  direction: "import" | "export" | "bidirectional";
  interfaceNativeKey: string;
  subareaNativeKey: string | null;
  period: CapacityTargetPeriod;
  value: number;
  unit: CapacityUnit;
};

/**
 * Evidence kept without a canonical value, and the reason. A deferral recorded in the data is
 * auditable; one recorded only in a comment is an absence someone later mistakes for an oversight.
 */
export type EvidenceOnlyTarget = { kind: "evidence_only"; reason: string };

export type NormalizedCapacityRecord = {
  artifactLabel: string;
  nativeGeography: string;
  nativePeriod: string;
  nativeScenario: string | null;
  /** The publisher's own word for the quantity, retained verbatim. */
  nativeTerm: string;
  nativeValue: string;
  nativeUnit: string;
  rawPayload: Record<string, unknown>;
  locator: CapacityLocator;
  target: ComponentTarget | ConstraintTarget | EvidenceOnlyTarget;
};

export type CapacityVintageDraft = {
  nativeVintageKey: string;
  nativeReportId: string | null;
  reportTitle: string;
  releaseKind: "adequacy_report" | "auction_result" | "accreditation_release"
    | "requirement_filing" | "study" | "tariff_document" | "other";
  publishedAt: string;
  publishedAtPrecision: "year" | "month" | "day" | "minute";
  sourceMethodologyName: string | null;
  sourceMethodologyVersion: string | null;
  publicationState: "internal_only" | "publication_candidate" | "published" | "withdrawn";
  qualityStatus: CapacityQualityStatus;
};

export type CapacityScenarioDraft = {
  nativeScenarioKey: string;
  nativeScenarioLabel: string;
  canonicalClass: "reference" | "high" | "low" | "sensitivity" | "other" | null;
  isReference: boolean;
  assumptions: Record<string, unknown>;
  assumptionsText: string | null;
};

/** A locality the adapter needs to exist, named only from the source's own identity. */
export type SubareaDraft = {
  nativeKey: string;
  nativeLabel: string;
  subareaKind: GridSubareaKind;
  notes: string | null;
};

export type InterfaceDraft = {
  nativeKey: string;
  nativeLabel: string;
  interfaceKind: GridInterfaceKind;
  fromSubareaNativeKey: string | null;
  toSubareaNativeKey: string | null;
  /** The system on the far side of an external tie. Null whenever both ends are inside the market. */
  externalCounterparty: string | null;
  notes: string | null;
};

export type CapacityExtraction = {
  vintage: CapacityVintageDraft;
  scenarios: CapacityScenarioDraft[];
  subareas: SubareaDraft[];
  interfaces: InterfaceDraft[];
  records: NormalizedCapacityRecord[];
};

export interface CapacityAdapter {
  key: CapacitySourceKey;
  /** The PD-2 physical grid area this source describes. */
  marketSlug: string;
  sourceInterfaceSlug: string;
  retrievalPurpose: "production" | "research";
  artifacts: { label: string; url: string }[];
  /** Pure: the same artifacts always produce the same records. */
  parse(artifacts: ReadonlyMap<string, RetrievedArtifact>): CapacityExtraction;
}

export class CapacitySourceFormatError extends Error {
  constructor(readonly source: CapacitySourceKey, message: string) {
    super(`${source}: ${message}`);
    this.name = "CapacitySourceFormatError";
  }
}
