/**
 * The contract a queue source implements.
 *
 * Shaped like the PD-3 and PD-4 adapters: the adapter owns only `parse`, which is a pure function
 * of retrieved bytes, and the framework owns retrieval, hashing, rights, identity, idempotence and
 * persistence. Nothing here defaults. A record states its own lifecycle stage, its own class and
 * the unit of every quantity, because each of those has a wrong answer that looks plausible.
 */

import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type {
  DeferralKind, LifecycleStage, QuantityKind, QuantityUnit, RequestClass, Technology,
} from "@/lib/interconnection-queue/types";

export const QUEUE_SOURCE_KEYS = ["pjm", "miso", "caiso"] as const;
export type QueueSourceKey = (typeof QUEUE_SOURCE_KEYS)[number];

export type QueueLocator = {
  extractionMethod: "xml_element" | "json_object" | "workbook_row";
  /** PJM: the element path. CAISO: the sheet name. MISO: the array name. */
  container?: string;
  /** Ordinal within the container, 1-based and in document order. */
  ordinal?: number;
  workbookSheet?: string;
  workbookRow?: number;
  jsonPath?: string;
  elementPath?: string;
  field?: string;
};

export type NormalizedQuantity = {
  /** The publisher's own field name. Mandatory: a normalized kind groups, it never replaces. */
  nativeField: string;
  quantityKind: QuantityKind;
  value: number;
  unit: QuantityUnit;
  /** Set only for component quantities, matching a resource's ordinal. */
  resourceOrdinal: number | null;
  direction: "injection" | "withdrawal" | "bidirectional" | null;
};

export type NormalizedResource = {
  componentOrdinal: number;
  nativeTechnology: string | null;
  nativeFuel: string | null;
  technology: Technology;
  /** True only where the source encoded this component separately, as CAISO does. */
  isSourceSeparated: boolean;
};

export type NormalizedQueueRecord = {
  nativeQueueId: string;
  nativeProjectName: string | null;
  nativeCustomer: string | null;
  /** Preserved verbatim and in full. MISO's status is three fields, not one. */
  nativeStatus: Record<string, string>;
  nativeStatusDisplay: string | null;
  lifecycleStage: LifecycleStage;
  requestClass: RequestClass;

  requestedOn: string | null;
  proposedInServiceOn: string | null;
  revisedInServiceOn: string | null;
  /** Only ever set from an explicit operational signal. A proposed date is not one. */
  actualInServiceOn: string | null;
  agreementExecutedOn: string | null;
  withdrawnOn: string | null;

  nativeState: string | null;
  nativeCounty: string | null;
  nativeZone: string | null;
  nativePoi: string | null;
  nativeSubstation: string | null;
  nativeTransmissionOwner: string | null;
  /** CAISO's sheet membership, which is itself lifecycle evidence. */
  sourcePartition: string | null;

  quantities: NormalizedQuantity[];
  resources: NormalizedResource[];

  locator: QueueLocator;
  payload: Record<string, unknown>;
  /**
   * False when this row may not become a canonical request. Raw evidence is still written — the
   * publisher served it and that is a fact — but no identity is invented for it. Set by the
   * shared collision guard when one native queue id arrives more than once in a single artifact.
   */
  canonical: boolean;
};

/** Something the source published that the adapter did not map, kept rather than dropped. */
export type QueueDeferral = {
  nativeQueueId: string | null;
  deferralKind: DeferralKind;
  nativeValue: string | null;
  detail: string;
  locator: QueueLocator;
};

export type QueueSnapshotDraft = {
  /**
   * The source's own release key where it has one. PJM and MISO publish none, so the adapter
   * returns null and the framework falls back to the content hash — which is the only honest
   * identity for a feed that refreshes continuously without versioning itself.
   */
  nativeSnapshotKey: string | null;
  sourcePublishedAt: string | null;
};

export type QueueExtraction = {
  snapshot: QueueSnapshotDraft;
  records: NormalizedQueueRecord[];
  deferrals: QueueDeferral[];
};

export interface QueueAdapter {
  key: QueueSourceKey;
  /** The PD-2 physical grid area this queue belongs to. */
  marketSlug: string;
  sourceInterfaceSlug: string;
  retrievalPurpose: "production" | "research";
  artifacts: { label: string; url: string }[];
  /** Pure: the same artifacts always produce the same records, in the same order. */
  parse(artifacts: ReadonlyMap<string, RetrievedArtifact>): QueueExtraction;
}

export class QueueSourceFormatError extends Error {
  constructor(readonly source: QueueSourceKey, message: string) {
    super(`${source}: ${message}`);
    this.name = "QueueSourceFormatError";
  }
}
