/**
 * Internal server-side reads for the grid capacity domain.
 *
 * Internal only, deliberately. No public route exists yet and none should until a methodology is
 * approved: the thing a public surface would most want — a deliverable capacity number — is an
 * Urdais conclusion, and PD-4B has no formula to produce one. What these reads do is make the
 * parts visible so a later phase can be written against them.
 *
 * Every read keeps the three layers apart. A component is what a publisher said, a constraint is
 * what the network permits, a result is what Urdais concluded, and no read returns them merged.
 */

import type {
  DeliverableCapacityInput, DeliverableCapacityResult, DeliverableCapacityResultWithInputs,
  GridCapacityComponent, GridCapacityVintage, GridConstraintValue,
} from "@/lib/power-delivery/capacity/types";

export interface CapacitySqlExecutor {
  query(text: string, params: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const text = (value: unknown): string | null => (value == null ? null : String(value));
const iso = (value: unknown): string | null => (value == null ? null : new Date(String(value)).toISOString());
const period = (row: Record<string, unknown>) => ({
  periodBasis: String(row.period_basis) as GridCapacityComponent["period"]["periodBasis"],
  targetYear: Number(row.target_year),
  targetSeason: text(row.target_season) as GridCapacityComponent["period"]["targetSeason"],
  periodStart: row.period_start == null ? null : String(row.period_start).slice(0, 10),
  periodEnd: row.period_end == null ? null : String(row.period_end).slice(0, 10),
});

const VINTAGE_SELECT = `select v.id, v.native_vintage_key, v.report_title, v.release_kind,
    v.published_at, v.retrieved_at, v.source_methodology_name, v.source_methodology_version,
    v.rights_classification, v.publication_state, v.quality_status, v.superseded_by_id,
    a.id as grid_area_id, a.slug as market_slug, a.display_name as market_name, s.slug as source_slug
  from pipeline.grid_capacity_vintages v
  join reference.grid_areas a on a.id = v.grid_area_id
  join reference.source_interfaces s on s.id = v.source_interface_id`;

function vintage(row: Record<string, unknown>): GridCapacityVintage {
  return {
    id: String(row.id), marketSlug: String(row.market_slug), marketName: String(row.market_name),
    gridAreaId: String(row.grid_area_id), sourceInterfaceSlug: String(row.source_slug),
    nativeVintageKey: String(row.native_vintage_key), reportTitle: String(row.report_title),
    releaseKind: String(row.release_kind), publishedAt: iso(row.published_at)!,
    retrievedAt: iso(row.retrieved_at)!,
    sourceMethodologyName: text(row.source_methodology_name),
    sourceMethodologyVersion: text(row.source_methodology_version),
    rightsClassification: String(row.rights_classification),
    publicationState: String(row.publication_state) as GridCapacityVintage["publicationState"],
    qualityStatus: String(row.quality_status) as GridCapacityVintage["qualityStatus"],
    supersededById: text(row.superseded_by_id),
  };
}

/** The most recent live capacity release for each market. */
export async function latestCapacityVintageByMarketInternal(
  sql: CapacitySqlExecutor,
): Promise<GridCapacityVintage[]> {
  const { rows } = await sql.query(
    `${VINTAGE_SELECT}
      where v.superseded_by_id is null
        and v.published_at = (select max(v2.published_at) from pipeline.grid_capacity_vintages v2
                               where v2.grid_area_id = v.grid_area_id and v2.superseded_by_id is null)
      order by a.display_name`,
    [],
  );
  return rows.map(vintage);
}

export async function capacityVintageByKeyInternal(
  sql: CapacitySqlExecutor, marketSlug: string, nativeVintageKey: string,
): Promise<GridCapacityVintage | null> {
  const { rows } = await sql.query(
    `${VINTAGE_SELECT} where a.slug = $1 and v.native_vintage_key = $2 and v.superseded_by_id is null`,
    [marketSlug, nativeVintageKey],
  );
  return rows[0] ? vintage(rows[0]) : null;
}

/**
 * Source-published components, filtered on the axes that decide comparability. `quantityKind` is
 * a filter rather than an afterthought because a caller almost always wants capabilities or
 * requirements, never both in one list.
 */
export async function capacityComponentsInternal(
  sql: CapacitySqlExecutor,
  filter: {
    vintageId?: string; gridAreaId?: string; gridSubareaId?: string | null;
    quantityKind?: string; targetYear?: number; periodBasis?: string;
  },
): Promise<GridCapacityComponent[]> {
  const { rows } = await sql.query(
    `select c.* from pipeline.grid_capacity_components c
      where c.superseded_by_id is null
        and ($1::uuid is null or c.vintage_id = $1::uuid)
        and ($2::uuid is null or c.grid_area_id = $2::uuid)
        and ($3::uuid is null or c.grid_subarea_id = $3::uuid)
        and ($4::text is null or c.quantity_kind = $4::text)
        and ($5::int is null or c.target_year = $5::int)
        and ($6::text is null or c.period_basis = $6::text)
      order by c.target_year, c.component_kind, c.source_term`,
    [filter.vintageId ?? null, filter.gridAreaId ?? null, filter.gridSubareaId ?? null,
      filter.quantityKind ?? null, filter.targetYear ?? null, filter.periodBasis ?? null],
  );
  return rows.map((row) => ({
    id: String(row.id), vintageId: String(row.vintage_id), scenarioId: String(row.scenario_id),
    gridAreaId: String(row.grid_area_id), gridSubareaId: text(row.grid_subarea_id),
    gridInterfaceId: text(row.grid_interface_id), rawRecordId: String(row.raw_record_id),
    quantityKind: String(row.quantity_kind) as GridCapacityComponent["quantityKind"],
    componentKind: String(row.component_kind) as GridCapacityComponent["componentKind"],
    sourceTerm: String(row.source_term), period: period(row), value: Number(row.value),
    unit: String(row.unit) as GridCapacityComponent["unit"],
    capacityBasis: String(row.capacity_basis) as GridCapacityComponent["capacityBasis"],
    qualityStatus: String(row.quality_status) as GridCapacityComponent["qualityStatus"],
    supersededById: text(row.superseded_by_id),
  }));
}

/** Network limits by interface and period. The same rows Transmission Headroom will read. */
export async function gridConstraintsInternal(
  sql: CapacitySqlExecutor,
  filter: { gridInterfaceId?: string; gridAreaId?: string; targetYear?: number; constraintKind?: string },
): Promise<GridConstraintValue[]> {
  const { rows } = await sql.query(
    `select c.* from pipeline.grid_constraint_values c
      where c.superseded_by_id is null
        and ($1::uuid is null or c.grid_interface_id = $1::uuid)
        and ($2::uuid is null or c.grid_area_id = $2::uuid)
        and ($3::int is null or c.target_year = $3::int)
        and ($4::text is null or c.constraint_kind = $4::text)
      order by c.target_year, c.constraint_kind`,
    [filter.gridInterfaceId ?? null, filter.gridAreaId ?? null, filter.targetYear ?? null, filter.constraintKind ?? null],
  );
  return rows.map((row) => ({
    id: String(row.id), vintageId: String(row.vintage_id), scenarioId: String(row.scenario_id),
    gridAreaId: String(row.grid_area_id), gridInterfaceId: String(row.grid_interface_id),
    gridSubareaId: text(row.grid_subarea_id), rawRecordId: String(row.raw_record_id),
    quantityKind: "constraint",
    constraintKind: String(row.constraint_kind) as GridConstraintValue["constraintKind"],
    direction: String(row.direction) as GridConstraintValue["direction"],
    sourceTerm: String(row.source_term), period: period(row), value: Number(row.value),
    unit: String(row.unit) as GridConstraintValue["unit"],
    qualityStatus: String(row.quality_status) as GridConstraintValue["qualityStatus"],
    supersededById: text(row.superseded_by_id),
  }));
}

/**
 * A derived result with the exact rows it was computed from. The inputs come from the frozen
 * join table, never from whatever is current now — that is the difference between a result that
 * can be audited and one that merely looks auditable.
 */
export async function deliverableCapacityResultInternal(
  sql: CapacitySqlExecutor, resultId: string,
): Promise<DeliverableCapacityResultWithInputs | null> {
  const { rows } = await sql.query(
    `select r.*, mv.version as methodology_version, mv.status as methodology_status
       from pipeline.deliverable_capacity_results r
       join reference.methodology_versions mv on mv.id = r.methodology_version_id
      where r.id = $1`,
    [resultId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const result: DeliverableCapacityResult = {
    id: String(row.id), methodologyVersionId: String(row.methodology_version_id),
    methodologyVersion: String(row.methodology_version),
    methodologyStatus: String(row.methodology_status) as DeliverableCapacityResult["methodologyStatus"],
    gridAreaId: String(row.grid_area_id), gridSubareaId: text(row.grid_subarea_id),
    scenarioId: text(row.scenario_id), quantityKind: "derived_quantity",
    period: period(row), value: Number(row.value),
    unit: String(row.unit) as DeliverableCapacityResult["unit"],
    capacityBasis: String(row.capacity_basis) as DeliverableCapacityResult["capacityBasis"],
    calculationStatus: String(row.calculation_status) as DeliverableCapacityResult["calculationStatus"],
    publicationState: String(row.publication_state) as DeliverableCapacityResult["publicationState"],
    supersededById: text(row.superseded_by_id),
  };
  const inputRows = await sql.query(
    `select id, result_id, input_kind, component_id, constraint_id, input_role
       from pipeline.deliverable_capacity_result_inputs where result_id = $1 order by input_role, id`,
    [resultId],
  );
  const inputs: DeliverableCapacityInput[] = inputRows.rows.map((input) => ({
    id: String(input.id), resultId: String(input.result_id),
    inputKind: String(input.input_kind) as DeliverableCapacityInput["inputKind"],
    componentId: text(input.component_id), constraintId: text(input.constraint_id),
    inputRole: String(input.input_role),
  }));
  return { result, inputs };
}
