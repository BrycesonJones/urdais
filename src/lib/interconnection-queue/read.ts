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
