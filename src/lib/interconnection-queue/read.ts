/**
 * Internal reads. No route, no public surface, no derived analytics.
 *
 * These exist so IQ-2's evidence can be checked and so IQ-5 has a foundation that does not need
 * a schema rewrite. Deliberately absent: anything that totals MW. Summing a queue is a decision
 * about which of several incompatible MW fields is meant, and that decision belongs to an
 * approved methodology rather than to a helper somebody imports by accident.
 */

import { isTerminal, type CurrentnessStatus, type LifecycleStage, type QuantityKind,
  type QuantityUnit, type RequestClass, type Technology } from "@/lib/interconnection-queue/types";
import { mayPublishSourceValue, type PermissionDisposition, type PublicationDecision,
  type RightsClassification } from "@/lib/rights/publication";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type QueueRequest = {
  id: string;
  marketSlug: string;
  sourceInterfaceSlug: string;
  nativeQueueId: string;
  firstSeenAt: string;
};

export type QueueObservation = {
  id: string;
  requestId: string;
  ordinal: number;
  isLatest: boolean;
  nativeProjectName: string | null;
  nativeStatus: Record<string, string>;
  nativeStatusDisplay: string | null;
  lifecycleStage: LifecycleStage;
  requestClass: RequestClass;
  requestedOn: string | null;
  proposedInServiceOn: string | null;
  revisedInServiceOn: string | null;
  actualInServiceOn: string | null;
  agreementExecutedOn: string | null;
  withdrawnOn: string | null;
  nativeState: string | null;
  nativeCounty: string | null;
  nativePoi: string | null;
  sourcePartition: string | null;
  firstSnapshotId: string;
  lastSnapshotId: string;
  /** True when the request has left the queue under this id. */
  terminal: boolean;
};

export type QueueQuantity = {
  nativeField: string;
  quantityKind: QuantityKind;
  value: string;
  unit: QuantityUnit;
  resourceOrdinal: number | null;
  direction: string | null;
};

export type QueueResource = {
  componentOrdinal: number;
  nativeTechnology: string | null;
  nativeFuel: string | null;
  technology: Technology;
  isSourceSeparated: boolean;
};

export type QueueSnapshot = {
  id: string;
  sourceInterfaceSlug: string;
  nativeSnapshotKey: string;
  artifactSha256: string;
  sourcePublishedAt: string | null;
  observedAt: string;
  currentnessStatus: CurrentnessStatus;
  recordCount: number;
};

const date = (value: unknown): string | null =>
  value == null ? null : String(value).slice(0, 10);

function toObservation(row: Record<string, unknown>): QueueObservation {
  const stage = String(row.lifecycle_stage) as LifecycleStage;
  return {
    id: String(row.id),
    requestId: String(row.request_id),
    ordinal: Number(row.observation_ordinal),
    isLatest: row.is_latest === true,
    nativeProjectName: row.native_project_name == null ? null : String(row.native_project_name),
    nativeStatus: (row.native_status ?? {}) as Record<string, string>,
    nativeStatusDisplay: row.native_status_display == null ? null : String(row.native_status_display),
    lifecycleStage: stage,
    requestClass: String(row.request_class) as RequestClass,
    requestedOn: date(row.requested_on),
    proposedInServiceOn: date(row.proposed_in_service_on),
    revisedInServiceOn: date(row.revised_in_service_on),
    actualInServiceOn: date(row.actual_in_service_on),
    agreementExecutedOn: date(row.agreement_executed_on),
    withdrawnOn: date(row.withdrawn_on),
    nativeState: row.native_state == null ? null : String(row.native_state),
    nativeCounty: row.native_county == null ? null : String(row.native_county),
    nativePoi: row.native_poi == null ? null : String(row.native_poi),
    sourcePartition: row.source_partition == null ? null : String(row.source_partition),
    firstSnapshotId: String(row.first_snapshot_id),
    lastSnapshotId: String(row.last_snapshot_id),
    terminal: isTerminal(stage),
  };
}

const OBSERVATION_COLUMNS = `
  o.id, o.request_id, o.observation_ordinal, o.is_latest, o.native_project_name,
  o.native_status, o.native_status_display, o.lifecycle_stage, o.request_class,
  o.requested_on::text as requested_on, o.proposed_in_service_on::text as proposed_in_service_on,
  o.revised_in_service_on::text as revised_in_service_on,
  o.actual_in_service_on::text as actual_in_service_on,
  o.agreement_executed_on::text as agreement_executed_on, o.withdrawn_on::text as withdrawn_on,
  o.native_state, o.native_county, o.native_poi, o.source_partition,
  o.first_snapshot_id, o.last_snapshot_id`;

/** One request by the only identity it has: its market and the publisher's own queue id. */
export async function findRequest(
  sql: CapacitySqlExecutor, marketSlug: string, nativeQueueId: string,
): Promise<QueueRequest | null> {
  const result = await sql.query(
    `select r.id, a.slug as market_slug, s.slug as source_slug, r.native_queue_id,
            r.first_seen_at::text as first_seen_at
       from pipeline.interconnection_requests r
       join reference.grid_areas a on a.id = r.grid_area_id
       join reference.source_interfaces s on s.id = r.source_interface_id
      where a.slug = $1 and r.native_queue_id = $2`,
    [marketSlug, nativeQueueId],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    id: String(row.id), marketSlug: String(row.market_slug),
    sourceInterfaceSlug: String(row.source_slug), nativeQueueId: String(row.native_queue_id),
    firstSeenAt: String(row.first_seen_at),
  };
}

export async function latestObservation(
  sql: CapacitySqlExecutor, requestId: string,
): Promise<QueueObservation | null> {
  const result = await sql.query(
    `select ${OBSERVATION_COLUMNS}
       from pipeline.interconnection_request_observations o
      where o.request_id = $1 and o.is_latest`,
    [requestId],
  );
  return result.rows[0] === undefined ? null : toObservation(result.rows[0]!);
}

/** Every state the publisher has been observed to assert, oldest first. */
export async function observationHistory(
  sql: CapacitySqlExecutor, requestId: string,
): Promise<QueueObservation[]> {
  const result = await sql.query(
    `select ${OBSERVATION_COLUMNS}
       from pipeline.interconnection_request_observations o
      where o.request_id = $1
      order by o.observation_ordinal`,
    [requestId],
  );
  return result.rows.map(toObservation);
}

export async function observationQuantities(
  sql: CapacitySqlExecutor, observationId: string,
): Promise<QueueQuantity[]> {
  const result = await sql.query(
    `select native_field, quantity_kind, value::text as value, unit, resource_ordinal, direction
       from pipeline.interconnection_request_quantities
      where observation_id = $1
      order by resource_ordinal nulls first, native_field`,
    [observationId],
  );
  return result.rows.map((row) => ({
    nativeField: String(row.native_field),
    quantityKind: String(row.quantity_kind) as QuantityKind,
    // Text, not a number: these are exact decimals and JavaScript would round some of them.
    value: String(row.value),
    unit: String(row.unit) as QuantityUnit,
    resourceOrdinal: row.resource_ordinal == null ? null : Number(row.resource_ordinal),
    direction: row.direction == null ? null : String(row.direction),
  }));
}

export async function observationResources(
  sql: CapacitySqlExecutor, observationId: string,
): Promise<QueueResource[]> {
  const result = await sql.query(
    `select component_ordinal, native_technology, native_fuel, technology, is_source_separated
       from pipeline.interconnection_request_resources
      where observation_id = $1
      order by component_ordinal`,
    [observationId],
  );
  return result.rows.map((row) => ({
    componentOrdinal: Number(row.component_ordinal),
    nativeTechnology: row.native_technology == null ? null : String(row.native_technology),
    nativeFuel: row.native_fuel == null ? null : String(row.native_fuel),
    technology: String(row.technology) as Technology,
    isSourceSeparated: row.is_source_separated === true,
  }));
}

export async function latestSnapshot(
  sql: CapacitySqlExecutor, sourceInterfaceSlug: string,
): Promise<QueueSnapshot | null> {
  const result = await sql.query(
    `select q.id, s.slug as source_slug, q.native_snapshot_key, q.artifact_sha256,
            q.source_published_at::text as source_published_at, q.observed_at::text as observed_at,
            q.currentness_status, q.record_count
       from pipeline.interconnection_queue_snapshots q
       join reference.source_interfaces s on s.id = q.source_interface_id
      where s.slug = $1 and q.is_latest`,
    [sourceInterfaceSlug],
  );
  const row = result.rows[0];
  if (row === undefined) return null;
  return {
    id: String(row.id), sourceInterfaceSlug: String(row.source_slug),
    nativeSnapshotKey: String(row.native_snapshot_key),
    artifactSha256: String(row.artifact_sha256),
    sourcePublishedAt: row.source_published_at == null ? null : String(row.source_published_at),
    observedAt: String(row.observed_at),
    currentnessStatus: String(row.currentness_status) as CurrentnessStatus,
    recordCount: Number(row.record_count),
  };
}

/**
 * Latest observations for one market, optionally filtered by stage. Counts and rows only — no
 * quantity is aggregated here, by design.
 */
export async function latestObservationsForMarket(
  sql: CapacitySqlExecutor, marketSlug: string,
  options: { lifecycleStage?: LifecycleStage; limit?: number } = {},
): Promise<QueueObservation[]> {
  const parameters: unknown[] = [marketSlug];
  let filter = "";
  if (options.lifecycleStage !== undefined) {
    parameters.push(options.lifecycleStage);
    filter = ` and o.lifecycle_stage = $${parameters.length}`;
  }
  parameters.push(options.limit ?? 500);
  const result = await sql.query(
    `select ${OBSERVATION_COLUMNS}
       from pipeline.interconnection_request_observations o
       join pipeline.interconnection_requests r on r.id = o.request_id
       join reference.grid_areas a on a.id = r.grid_area_id
      where a.slug = $1 and o.is_latest${filter}
      order by o.requested_on nulls last
      limit $${parameters.length}`,
    parameters,
  );
  return result.rows.map(toObservation);
}

/** How many requests sit in each lifecycle stage right now, by their latest observation. */
export async function lifecycleCounts(
  sql: CapacitySqlExecutor, marketSlug: string,
): Promise<Record<string, number>> {
  const result = await sql.query(
    `select o.lifecycle_stage, count(*)::int as n
       from pipeline.interconnection_request_observations o
       join pipeline.interconnection_requests r on r.id = o.request_id
       join reference.grid_areas a on a.id = r.grid_area_id
      where a.slug = $1 and o.is_latest
      group by o.lifecycle_stage`,
    [marketSlug],
  );
  const counts: Record<string, number> = {};
  for (const row of result.rows) counts[String(row.lifecycle_stage)] = Number(row.n);
  return counts;
}

// ---------------------------------------------------------------- archive history

export type SnapshotPeriod = {
  id: string;
  reportPeriod: string | null;
  isCorrection: boolean;
  nativeSnapshotKey: string;
  sourcePublishedAt: string | null;
  recordCount: number;
  nativeDocumentId: string | null;
};

/** Every observed state of an archive source, oldest report period first. */
export async function snapshotsByReportPeriod(
  sql: CapacitySqlExecutor, sourceInterfaceSlug: string,
): Promise<SnapshotPeriod[]> {
  const result = await sql.query(
    `select q.id, q.report_period::text as report_period, q.is_correction, q.native_snapshot_key,
            q.source_published_at::text as source_published_at, q.record_count, q.native_document_id
       from pipeline.interconnection_queue_snapshots q
       join reference.source_interfaces s on s.id = q.source_interface_id
      where s.slug = $1
      order by q.report_period nulls last, q.is_correction, q.source_published_at`,
    [sourceInterfaceSlug],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    reportPeriod: row.report_period == null ? null : String(row.report_period),
    isCorrection: row.is_correction === true,
    nativeSnapshotKey: String(row.native_snapshot_key),
    sourcePublishedAt: row.source_published_at == null ? null : String(row.source_published_at),
    recordCount: Number(row.record_count),
    nativeDocumentId: row.native_document_id == null ? null : String(row.native_document_id),
  }));
}

export type RequestPresence = {
  snapshotId: string;
  reportPeriod: string | null;
  isCorrection: boolean;
  sourcePublishedAt: string | null;
};

/**
 * Which observed source states held this request.
 *
 * No presence table exists and none is needed: every retrieval writes one raw record per source
 * row, carrying both the snapshot and the native queue id, so presence is already a fact the
 * evidence records. Asking it this way also means presence can never drift from the evidence,
 * which a separate table would eventually do.
 *
 * Absence from a snapshot is only absence. It is not a withdrawal, a cancellation or an
 * operation, and nothing here infers one.
 */
export async function requestPresence(
  sql: CapacitySqlExecutor, sourceInterfaceSlug: string, nativeQueueId: string,
): Promise<RequestPresence[]> {
  const result = await sql.query(
    `select distinct q.id, q.report_period::text as report_period, q.is_correction,
            q.source_published_at::text as source_published_at
       from pipeline.raw_interconnection_queue_records r
       join pipeline.interconnection_queue_snapshots q on q.id = r.snapshot_id
       join reference.source_interfaces s on s.id = q.source_interface_id
      where s.slug = $1 and r.native_queue_id = $2
      order by q.report_period nulls last, q.source_published_at`,
    [sourceInterfaceSlug, nativeQueueId],
  );
  return result.rows.map((row) => ({
    snapshotId: String(row.id),
    reportPeriod: row.report_period == null ? null : String(row.report_period),
    isCorrection: row.is_correction === true,
    sourcePublishedAt: row.source_published_at == null ? null : String(row.source_published_at),
  }));
}

/**
 * The first and last observed source state that held this request, and how many held it.
 *
 * Deliberately not called "entered the queue" or "left the queue": Urdais observed a publisher's
 * file, and a request that stops appearing has stopped appearing. What that means is a question
 * for a methodology, not for a read model.
 */
export async function requestPresenceRange(
  sql: CapacitySqlExecutor, sourceInterfaceSlug: string, nativeQueueId: string,
): Promise<{ firstSeen: string | null; lastSeen: string | null; snapshots: number }> {
  const result = await sql.query(
    `select min(q.report_period)::text as first_seen, max(q.report_period)::text as last_seen,
            count(distinct q.id)::int as snapshots
       from pipeline.raw_interconnection_queue_records r
       join pipeline.interconnection_queue_snapshots q on q.id = r.snapshot_id
       join reference.source_interfaces s on s.id = q.source_interface_id
      where s.slug = $1 and r.native_queue_id = $2`,
    [sourceInterfaceSlug, nativeQueueId],
  );
  const row = result.rows[0];
  return {
    firstSeen: row?.first_seen == null ? null : String(row.first_seen),
    lastSeen: row?.last_seen == null ? null : String(row.last_seen),
    snapshots: row?.snapshots == null ? 0 : Number(row.snapshots),
  };
}

// ---------------------------------------------------------------- load requests

/**
 * Load interconnection requests, by the publisher's own end-use classification.
 *
 * Load is structurally separate from generation throughout: a different request class, a
 * different quantity kind, and a filter here that cannot accidentally return a generator.
 */
export async function loadRequests(
  sql: CapacitySqlExecutor, marketSlug: string,
  options: { loadEndUse?: string; limit?: number } = {},
): Promise<(QueueObservation & { nativeEndUse: string | null; loadEndUse: string | null })[]> {
  const parameters: unknown[] = [marketSlug];
  let filter = "";
  if (options.loadEndUse !== undefined) {
    parameters.push(options.loadEndUse);
    filter = ` and o.load_end_use = $${parameters.length}`;
  }
  parameters.push(options.limit ?? 500);
  const result = await sql.query(
    `select ${OBSERVATION_COLUMNS}, o.native_end_use, o.load_end_use
       from pipeline.interconnection_request_observations o
       join pipeline.interconnection_requests r on r.id = o.request_id
       join reference.grid_areas a on a.id = r.grid_area_id
      where a.slug = $1 and o.is_latest and o.request_class = 'load'${filter}
      order by o.requested_on nulls last
      limit $${parameters.length}`,
    parameters,
  );
  return result.rows.map((row) => ({
    ...toObservation(row),
    nativeEndUse: row.native_end_use == null ? null : String(row.native_end_use),
    loadEndUse: row.load_end_use == null ? null : String(row.load_end_use),
  }));
}

/** How many load requests sit under each end use, by their latest observation. */
export async function loadEndUseCounts(
  sql: CapacitySqlExecutor, marketSlug: string,
): Promise<Record<string, number>> {
  const result = await sql.query(
    `select coalesce(o.load_end_use, 'unknown') as end_use, count(*)::int as n
       from pipeline.interconnection_request_observations o
       join pipeline.interconnection_requests r on r.id = o.request_id
       join reference.grid_areas a on a.id = r.grid_area_id
      where a.slug = $1 and o.is_latest and o.request_class = 'load'
      group by 1`,
    [marketSlug],
  );
  const counts: Record<string, number> = {};
  for (const row of result.rows) counts[String(row.end_use)] = Number(row.n);
  return counts;
}

// ---------------------------------------------------------------- publication eligibility

export const PUBLIC_QUEUE_PURPOSE = "public_interconnection_queue_display";
export const PUBLIC_QUEUE_DERIVED_PURPOSE = "public_interconnection_queue_derived_metric_display";

export type QueuePublicationEligibility = {
  marketSlug: string;
  sourceInterfaceSlug: string;
  rightsClassification: RightsClassification | null;
  disposition: PermissionDisposition | null;
  rawDisplay: PublicationDecision;
  derivedDisplay: PublicationDecision;
};

/**
 * Whether a market's queue values may be shown publicly, decided by the shared rights policy.
 *
 * This exists so that whoever builds the public API in a later phase cannot reach for the data
 * without also reaching for the answer. SPP is the case that matters: its terms permit copying
 * "except when such materials will be used in commercial publication", which is a stated
 * exclusion rather than an open question, so it is retained internally and blocked from display.
 * No founder-accepted-risk path reaches it.
 */
export async function queuePublicationEligibility(
  sql: CapacitySqlExecutor, marketSlug: string,
): Promise<QueuePublicationEligibility | null> {
  const result = await sql.query(
    `select s.slug as source_slug, s.name as source_name, sup.purpose_code,
            sup.rights_classification, sup.disposition, sup.attribution_required,
            sup.attribution_text, sup.conditions, sup.unresolved_issue,
            sup.terms_document_url, sup.reviewed_by, sup.reviewed_on::text as reviewed_on
       from reference.source_interfaces s
       join reference.source_use_permissions sup on sup.source_interface_id = s.id
       join pipeline.interconnection_requests r on r.source_interface_id = s.id
       join reference.grid_areas a on a.id = r.grid_area_id
      where a.slug = $1 and sup.purpose_code = any($2::text[])
      group by 1,2,3,4,5,6,7,8,9,10,11,12`,
    [marketSlug, [PUBLIC_QUEUE_PURPOSE, PUBLIC_QUEUE_DERIVED_PURPOSE]],
  );
  if (result.rows.length === 0) return null;

  const state = (purpose: string) => {
    const row = result.rows.find((candidate) => String(candidate.purpose_code) === purpose);
    if (row === undefined) return null;
    return {
      sourceInterfaceSlug: String(row.source_slug), sourceName: String(row.source_name),
      purpose,
      rightsClassification: String(row.rights_classification) as RightsClassification,
      disposition: String(row.disposition) as PermissionDisposition,
      attributionRequired: row.attribution_required === true,
      attributionText: row.attribution_text == null ? null : String(row.attribution_text),
      conditions: row.conditions == null ? null : String(row.conditions),
      unresolvedIssue: row.unresolved_issue == null ? null : String(row.unresolved_issue),
      termsDocumentUrl: row.terms_document_url == null ? null : String(row.terms_document_url),
      reviewedBy: row.reviewed_by == null ? null : String(row.reviewed_by),
      reviewedOn: row.reviewed_on == null ? null : String(row.reviewed_on),
    };
  };

  const raw = state(PUBLIC_QUEUE_PURPOSE);
  const derived = state(PUBLIC_QUEUE_DERIVED_PURPOSE);
  const first = result.rows[0]!;

  return {
    marketSlug,
    sourceInterfaceSlug: String(first.source_slug),
    rightsClassification: raw?.rightsClassification ?? null,
    disposition: raw?.disposition ?? null,
    rawDisplay: mayPublishSourceValue({
      rights: raw, publicationState: "publication_candidate",
      purpose: PUBLIC_QUEUE_PURPOSE, isPublicPurpose: true,
    }),
    derivedDisplay: mayPublishSourceValue({
      rights: derived, publicationState: "publication_candidate",
      purpose: PUBLIC_QUEUE_DERIVED_PURPOSE, isPublicPurpose: true,
    }),
  };
}

// ---------------------------------------------------------------- request kinds

export type SubtypeCount = { requestSubtype: string; isNewCapability: boolean; requests: number };

/**
 * How many requests of each kind a market holds, by their latest observation.
 *
 * `isNewCapability` is the flag a later total must respect. ISO-NE is the market that makes it
 * matter: two thirds of its published MW belongs to capacity-rights requests against resources
 * that already exist.
 */
export async function requestSubtypeCounts(
  sql: CapacitySqlExecutor, marketSlug: string,
): Promise<SubtypeCount[]> {
  const result = await sql.query(
    `select o.request_subtype, t.is_new_capability, count(*)::int as n
       from pipeline.interconnection_request_observations o
       join pipeline.interconnection_requests r on r.id = o.request_id
       join reference.grid_areas a on a.id = r.grid_area_id
       join reference.interconnection_request_subtypes t on t.code = o.request_subtype
      where a.slug = $1 and o.is_latest
      group by 1, 2 order by 3 desc`,
    [marketSlug],
  );
  return result.rows.map((row) => ({
    requestSubtype: String(row.request_subtype),
    isNewCapability: row.is_new_capability === true,
    requests: Number(row.n),
  }));
}

/**
 * Quantities on a market's latest observations, split by whether the request proposes new
 * capability.
 *
 * Returned as counts and exact text sums per named field — never one number. A caller that wants
 * "the queue MW" still has to say which field it means, and cannot reach a total that mixes new
 * generation with capacity rights, because the two are separated here and the database refuses to
 * put a new-generation quantity on a capacity-rights request in the first place.
 */
export async function quantitiesByCapability(
  sql: CapacitySqlExecutor, marketSlug: string,
): Promise<{ isNewCapability: boolean; nativeField: string; quantityKind: QuantityKind;
  rows: number; total: string }[]> {
  const result = await sql.query(
    `select t.is_new_capability, q.native_field, q.quantity_kind,
            count(*)::int as n, sum(q.value)::text as total
       from pipeline.interconnection_request_quantities q
       join pipeline.interconnection_request_observations o on o.id = q.observation_id
       join pipeline.interconnection_requests r on r.id = o.request_id
       join reference.grid_areas a on a.id = r.grid_area_id
       join reference.interconnection_request_subtypes t on t.code = o.request_subtype
      where a.slug = $1 and o.is_latest
      group by 1, 2, 3 order by 1 desc, 4 desc`,
    [marketSlug],
  );
  return result.rows.map((row) => ({
    isNewCapability: row.is_new_capability === true,
    nativeField: String(row.native_field),
    quantityKind: String(row.quantity_kind) as QuantityKind,
    rows: Number(row.n),
    total: String(row.total),
  }));
}
