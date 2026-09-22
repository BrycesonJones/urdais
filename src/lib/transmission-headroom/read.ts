/**
 * Internal read models for Transmission Headroom.
 *
 * Internal is the operative word: there is no public API and no surface in TH-2, and these exist
 * so the ingestion can be inspected and the invariants proved. The public read model belongs to
 * TH-4, after TH-3 approves a methodology.
 *
 * Nothing here combines the two markets. A NYISO interface margin and an ERCOT constraint margin
 * are both megawatts and are not the same measurement: NYISO's population is a fixed roster of
 * published interfaces, ERCOT's is whichever constraints dispatch happened to be tracking.
 */

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type EntityMargin = {
  entityId: string;
  entityLabel: string;
  contingencyKind: string;
  observedAt: string;
  selectedDirection: string;
  limitFieldUsed: string | null;
  state: string;
  headroomMw: number | null;
  flowMw: number;
  limitMw: number | null;
  limitState: string | null;
};

/** One entity's margin history, newest first. */
export async function entityMarginHistory(
  sql: CapacitySqlExecutor, sourceSlug: string, nativeKey: string, limit = 50,
): Promise<EntityMargin[]> {
  const rows = await sql.query(
    `select m.entity_id,
            coalesce(i.native_name, e.native_constraint_name || ' / ' || e.native_contingency_name) as label,
            m.contingency_kind, m.observed_at::text as observed_at, m.selected_direction,
            m.limit_field_used, m.state, m.headroom_mw::text as headroom_mw,
            f.flow_mw::text as flow_mw, l.limit_mw::text as limit_mw, l.limit_state
       from pipeline.transmission_margins m
       join reference.source_interfaces si on si.id = m.source_interface_id
       join pipeline.transmission_flow_observations f on f.id = m.flow_observation_id
       left join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
       left join pipeline.transmission_interfaces i on i.id = m.entity_id
       left join pipeline.transmission_elements e on e.id = m.entity_id
      where si.slug = $1
        and (i.native_id = $2
             or (e.native_constraint_name || chr(31) || e.native_contingency_name) = $2)
      order by m.observed_at desc
      limit $3`,
    [sourceSlug, nativeKey, limit],
  );
  return rows.rows.map((row) => ({
    entityId: String(row.entity_id),
    entityLabel: String(row.label),
    contingencyKind: String(row.contingency_kind),
    observedAt: String(row.observed_at),
    selectedDirection: String(row.selected_direction),
    limitFieldUsed: row.limit_field_used == null ? null : String(row.limit_field_used),
    state: String(row.state),
    headroomMw: row.headroom_mw == null ? null : Number(row.headroom_mw),
    flowMw: Number(row.flow_mw),
    limitMw: row.limit_mw == null ? null : Number(row.limit_mw),
    limitState: row.limit_state == null ? null : String(row.limit_state),
  }));
}

export type StateBreakdown = { state: string; observations: number; entities: number };

/** How many margins reached each state, per source. The shape of what the pipeline could not say. */
export async function marginStateBreakdown(
  sql: CapacitySqlExecutor, sourceSlug: string,
): Promise<StateBreakdown[]> {
  const rows = await sql.query(
    `select reference.transmission_code('margin_state', m.state) as state, count(*)::int as observations, count(distinct m.entity_id)::int as entities
       from pipeline.transmission_margins m
       join reference.source_interfaces si on si.id = m.source_interface_id
      where si.slug = $1
      group by m.state order by observations desc`,
    [sourceSlug],
  );
  return rows.rows.map((row) => ({
    state: String(row.state), observations: Number(row.observations), entities: Number(row.entities),
  }));
}

export type DeferralBreakdown = { reason: string; occurrences: number };

export async function deferralBreakdown(
  sql: CapacitySqlExecutor, sourceSlug: string,
): Promise<DeferralBreakdown[]> {
  const rows = await sql.query(
    `select d.reason, count(*)::int as occurrences
       from pipeline.transmission_deferrals d
       join pipeline.transmission_snapshots s on s.id = d.snapshot_id
       join reference.source_interfaces si on si.id = s.source_interface_id
      where si.slug = $1
      group by d.reason order by occurrences desc`,
    [sourceSlug],
  );
  return rows.rows.map((row) => ({
    reason: String(row.reason), occurrences: Number(row.occurrences),
  }));
}

/**
 * Coverage actually retained, per source.
 *
 * `coverage_start` is the first interval held, not the first the publisher ever produced. For ERCOT
 * that distinction is the whole story: the listing is a rolling seven-day window, so coverage
 * begins when Urdais first swept it and nothing earlier is recoverable.
 */
export async function sourceCoverage(
  sql: CapacitySqlExecutor,
): Promise<{
  sourceSlug: string; snapshots: number; firstObservedAt: string | null;
  lastObservedAt: string | null; entities: number; margins: number;
}[]> {
  // Scalar subqueries, deliberately, not three left joins on the same key. Joining snapshots,
  // flows and margins to one interface row multiplies them together: at 158 snapshots and 24,564
  // of each observation that is a 95-billion-row intermediate, which spilled 73 GB of temp files
  // before it was caught. Each count is independent and belongs in its own subquery.
  const rows = await sql.query(
    `select si.slug,
            (select count(*) from pipeline.transmission_snapshots s
              where s.source_interface_id = si.id)::int as snapshots,
            (select min(f.observed_at)::text from pipeline.transmission_flow_observations f
              where f.entity_id in (select id from pipeline.transmission_interfaces where source_interface_id = si.id union all select id from pipeline.transmission_elements where source_interface_id = si.id)) as first_observed_at,
            (select max(f.observed_at)::text from pipeline.transmission_flow_observations f
              where f.entity_id in (select id from pipeline.transmission_interfaces where source_interface_id = si.id union all select id from pipeline.transmission_elements where source_interface_id = si.id)) as last_observed_at,
            (select count(distinct f.entity_id) from pipeline.transmission_flow_observations f
              where f.entity_id in (select id from pipeline.transmission_interfaces where source_interface_id = si.id union all select id from pipeline.transmission_elements where source_interface_id = si.id))::int as entities,
            (select count(*) from pipeline.transmission_margins m
              where m.source_interface_id = si.id)::int as margins
       from reference.source_interfaces si
      where si.slug in ('nyiso-external-limits-flows', 'ercot-sced-binding-constraints')
      order by si.slug`,
    [],
  );
  return rows.rows.map((row) => ({
    sourceSlug: String(row.slug),
    snapshots: Number(row.snapshots),
    firstObservedAt: row.first_observed_at == null ? null : String(row.first_observed_at),
    lastObservedAt: row.last_observed_at == null ? null : String(row.last_observed_at),
    entities: Number(row.entities),
    margins: Number(row.margins),
  }));
}

export type Currentness = {
  sourceSlug: string; expectedCadence: string; staleAfterHours: number;
  retentionHours: number | null; latestObservedAt: string | null; ageHours: number | null;
  status: "current" | "stale" | "unavailable";
  /** True when the publisher's retention window is close enough that a gap becomes permanent. */
  retentionAtRisk: boolean;
};

/**
 * Whether each source has been swept recently enough.
 *
 * ERCOT's threshold is deliberately far inside its retention window: staleness at 36 hours against
 * a 168-hour window leaves roughly five days in which a missed sweep can still be recovered. NYISO
 * keeps a twenty-year archive, so its threshold only needs to surface a broken feed.
 */
export async function transmissionCurrentness(sql: CapacitySqlExecutor): Promise<Currentness[]> {
  const rows = await sql.query(
    `select si.slug, m.expected_cadence, m.stale_after_hours, m.retention_hours,
            latest.observed_at::text as latest_observed_at,
            extract(epoch from (now() - latest.observed_at)) / 3600 as age_hours
       from reference.transmission_source_monitors m
       join reference.source_interfaces si on si.id = m.source_interface_id
       left join lateral (
         select max(f.observed_at) as observed_at
           from pipeline.transmission_flow_observations f
          where f.entity_id in (select id from pipeline.transmission_interfaces where source_interface_id = si.id union all select id from pipeline.transmission_elements where source_interface_id = si.id)) latest on true
      order by si.slug`,
    [],
  );
  return rows.rows.map((row) => {
    const ageHours = row.age_hours == null ? null : Number(row.age_hours);
    const staleAfter = Number(row.stale_after_hours);
    const retention = row.retention_hours == null ? null : Number(row.retention_hours);
    const status: Currentness["status"] =
      ageHours === null ? "unavailable" : ageHours > staleAfter ? "stale" : "current";
    return {
      sourceSlug: String(row.slug),
      expectedCadence: String(row.expected_cadence),
      staleAfterHours: staleAfter,
      retentionHours: retention,
      latestObservedAt: row.latest_observed_at == null ? null : String(row.latest_observed_at),
      ageHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      status,
      retentionAtRisk: retention !== null && ageHours !== null && ageHours > retention * 0.5,
    };
  });
}

/** The invariants no single constraint can express. Expected to be empty. */
export async function domainViolations(
  sql: CapacitySqlExecutor,
): Promise<{ violation: string; detail: string; occurrences: number }[]> {
  const rows = await sql.query(
    `select violation, detail, occurrences from pipeline.transmission_domain_violations()`, []);
  return rows.rows.map((row) => ({
    violation: String(row.violation), detail: String(row.detail),
    occurrences: Number(row.occurrences),
  }));
}
