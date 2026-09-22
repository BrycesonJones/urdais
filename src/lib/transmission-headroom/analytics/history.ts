/**
 * One entity's observation history.
 *
 * Event history, not a series: NYISO publishes at irregular instants and skips slots, so nothing
 * here fills a gap, interpolates, or pretends to a fixed cadence. What comes back is what the
 * publisher published.
 *
 * Kept entity-specific on purpose. There is no cross-market history, because a chart with both
 * markets on one axis would imply a comparison the methodology forbids.
 */

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export type HistoryPoint = {
  observedAt: string;
  headroomMw: number | null;
  flowMw: number;
  limitMw: number | null;
  state: string;
};

export type EntityHistory = {
  market: string;
  entityId: string;
  name: string;
  /** The earliest observation Urdais retains, which for ERCOT is when it first swept the feed. */
  coverageStart: string | null;
  coverageEnd: string | null;
  points: HistoryPoint[];
  truncated: boolean;
  note: string;
};

const SOURCE_BY_MARKET: Record<string, string> = {
  nyiso: "nyiso-external-limits-flows",
  ercot: "ercot-sced-binding-constraints",
};

export async function loadEntityHistory(
  sql: CapacitySqlExecutor, market: "nyiso" | "ercot", entityId: string, limit: number,
): Promise<EntityHistory> {
  const rows = await sql.query(
    `select m.observed_at::text as observed_at, m.headroom_mw::text as headroom_mw,
            f.flow_mw::text as flow_mw, l.limit_mw::text as limit_mw,
            reference.transmission_code('margin_state', m.state) as state,
            coalesce(i.native_name,
                     e.native_constraint_name || ' / ' || e.native_contingency_name) as name
       from pipeline.transmission_margins m
       join reference.source_interfaces si on si.id = m.source_interface_id
       join pipeline.transmission_flow_observations f on f.id = m.flow_observation_id
       left join pipeline.transmission_limit_observations l on l.id = m.limit_observation_id
       left join pipeline.transmission_interfaces i on i.id = m.entity_id
       left join pipeline.transmission_elements e on e.id = m.entity_id
      where si.slug = $1 and m.entity_id = $2
      order by m.observed_at desc
      limit $3`,
    [SOURCE_BY_MARKET[market]!, entityId, limit + 1],
  );

  const truncated = rows.rows.length > limit;
  const points = rows.rows.slice(0, limit).map((row) => ({
    observedAt: String(row.observed_at),
    headroomMw: row.headroom_mw == null ? null : Number(row.headroom_mw),
    flowMw: Number(row.flow_mw),
    limitMw: row.limit_mw == null ? null : Number(row.limit_mw),
    state: String(row.state),
  })).reverse();

  return {
    market, entityId,
    name: rows.rows[0] === undefined ? entityId : String(rows.rows[0].name),
    coverageStart: points[0]?.observedAt ?? null,
    coverageEnd: points[points.length - 1]?.observedAt ?? null,
    points, truncated,
    note: market === "ercot"
      ? "ERCOT publishes a rolling seven-day window and no archive, so history begins when Urdais "
        + "first retained it rather than when ERCOT first produced it."
      : "Published observations only. NYISO publishes at irregular instants and sometimes skips "
        + "one; no gap is filled and no value is interpolated.",
  };
}
