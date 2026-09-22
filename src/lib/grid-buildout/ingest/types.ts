/** The contract every Grid Buildout Velocity adapter implements. */

import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type {
  DateQuality, DatePrecision, DeferralReason, DriverBasis, DriverClass, GbvSourceKey,
  LifecycleBasis, LifecycleState, MilestoneKind, QuantityKind, RelationshipKind,
} from "@/lib/grid-buildout/types";

export type ParsedMilestone = {
  kind: MilestoneKind;
  /** Distinguishes CAISO's fifteen prior in-service columns from one another. Null elsewhere. */
  vintageLabel: string | null;
  date: string | null;
  quality: DateQuality;
  precision: DatePrecision;
  native: string | null;
  /** The publisher's own column heading, so a value can be traced to where it was read. */
  sourceField: string;
};

export type ParsedQuantityValue = {
  kind: QuantityKind;
  value: number | null;
  isReported: boolean;
  native: string | null;
};

export type ParsedRelationship = {
  kind: RelationshipKind;
  relatedNativeId: string;
};

export type ParsedDeferral = {
  reason: DeferralReason;
  nativeList: string | null;
  nativeKey: string | null;
  nativeValue: string | null;
  detail: string;
  rowOrdinal: number | null;
};

export type ParsedProjectRow = {
  /** 1-based position within its list, as retrieved. Part of raw-record identity. */
  rowOrdinal: number;
  nativeId: string | null;
  title: string | null;
  description: string | null;
  sponsor: string | null;
  nativeStatus: string | null;
  tier: string | null;
  lifecycle: { state: LifecycleState; basis: LifecycleBasis };
  driver: { klass: DriverClass; basis: DriverBasis; evidence: string | null };
  milestones: ParsedMilestone[];
  quantities: ParsedQuantityValue[];
  relationships: ParsedRelationship[];
  /** The whole source row keyed by publisher field name, minus anything personal. */
  payload: Record<string, string>;
};

export type ParsedList = {
  /** The publisher's own list name — an ERCOT sheet, a CAISO transmission owner. */
  name: string;
  rows: ParsedProjectRow[];
};

export type ParsedSnapshot = {
  nativeSnapshotKey: string;
  sourcePublishedAt: string | null;
  lists: ParsedList[];
  deferrals: ParsedDeferral[];
};

export interface BuildoutAdapter {
  key: GbvSourceKey;
  /** The `reference.source_interfaces` slug this adapter reads. */
  sourceSlug: string;
  /** The PD-2 physical grid area, so a project is anchored to a market without a new registry. */
  marketSlug: string;
  /** Where the artifact lives. Both publishers republish in place, so this is stable. */
  artifactUrl(): string;
  parse(artifact: RetrievedArtifact): ParsedSnapshot;
}
