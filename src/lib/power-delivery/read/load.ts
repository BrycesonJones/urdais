import { aggregateCoincidentActualLoad } from "@/lib/power-delivery/aggregate";
import { POWER_DELIVERY_UNIVERSE_SLUG } from "@/lib/power-delivery/universe";
import type { CoincidentAggregatePoint, PowerMetricCode, PowerObservation, PowerSourceMetadata } from "@/lib/power-delivery/types";
import type { PowerSqlExecutor } from "@/lib/power-delivery/store";

const SOURCE: PowerSourceMetadata = {
  provider: "U.S. Energy Information Administration",
  source: "EIA Form 930",
  interfaceSlug: "eia-930-region-data",
  attribution: "Source: U.S. Energy Information Administration, Form EIA-930.",
};

function observation(row: Record<string, unknown>): PowerObservation {
  return {
    id: String(row.id), areaId: String(row.area_id), areaName: String(row.area_name), eiaBaCode: String(row.eia_ba_code),
    metric: String(row.metric) as PowerMetricCode, periodStart: new Date(String(row.period_start)).toISOString(),
    periodEnd: new Date(String(row.period_end)).toISOString(), valueMw: Number(row.value_mw),
    valueStatus: String(row.value_status) as "observed" | "forecast",
    qualityStatus: String(row.quality_status) as "accepted" | "provisional" | "suspect",
    retrievedAt: new Date(String(row.retrieved_at)).toISOString(), source: SOURCE,
  };
}

const SELECT = `select o.id, a.id as area_id, a.display_name as area_name, a.eia_ba_code,
  m.code as metric, o.period_start, o.period_end, o.value_mw::text as value_mw,
  o.value_status, o.quality_status, o.retrieved_at
from pipeline.power_observations o
join reference.grid_areas a on a.id=o.grid_area_id
join reference.power_metrics m on m.id=o.power_metric_id`;

export async function latestHourlyActualLoadByMarket(sql: PowerSqlExecutor): Promise<PowerObservation[]> {
  const { rows } = await sql.query(`${SELECT}
    where m.code='actual_load' and o.superseded_by_id is null
      and o.period_start=(select max(o2.period_start) from pipeline.power_observations o2
        join reference.power_metrics m2 on m2.id=o2.power_metric_id
        where m2.code='actual_load' and o2.superseded_by_id is null)
    order by a.display_name`, []);
  return rows.map(observation);
}

export async function hourlyActualLoadHistory(
  sql: PowerSqlExecutor, areaId: string, start: string, end: string,
): Promise<PowerObservation[]> {
  const { rows } = await sql.query(`${SELECT}
    where m.code='actual_load' and o.superseded_by_id is null and a.id=$1
      and o.period_start >= $2::timestamptz and o.period_start < $3::timestamptz
    order by o.period_start`, [areaId, start, end]);
  return rows.map(observation);
}

export async function latestOperationalDemandForecast(sql: PowerSqlExecutor): Promise<PowerObservation[]> {
  const { rows } = await sql.query(`${SELECT}
    where m.code='operational_demand_forecast' and o.superseded_by_id is null
      and o.period_start >= now()
    order by o.period_start, a.display_name`, []);
  return rows.map(observation);
}

export async function coincidentActualLoad(
  sql: PowerSqlExecutor, start: string, end: string,
): Promise<CoincidentAggregatePoint[]> {
  const membership = await sql.query(
    `select uv.version, uv.effective_to, a.id
       from reference.grid_universes u
       join reference.grid_universe_versions uv on uv.universe_id=u.id
       join reference.grid_area_memberships gm on gm.universe_version_id=uv.id
       join reference.grid_areas a on a.id=gm.grid_area_id
      where u.slug=$1 and uv.effective_from <= $2::timestamptz
        and (uv.effective_to is null or uv.effective_to > $2::timestamptz)
      order by gm.ordinal`,
    [POWER_DELIVERY_UNIVERSE_SLUG, start],
  );
  if (membership.rows.length === 0) throw new Error(`no ${POWER_DELIVERY_UNIVERSE_SLUG} version covers ${start}`);
  const versions = new Set(membership.rows.map((row) => Number(row.version)));
  if (versions.size !== 1) throw new Error("aggregate range resolves ambiguously across universe versions");
  const effectiveTo = membership.rows[0]!.effective_to;
  if (effectiveTo != null && new Date(String(effectiveTo)).valueOf() < new Date(end).valueOf()) {
    throw new Error("aggregate range crosses a universe-version boundary; query each version separately");
  }
  const expected = membership.rows.map((row) => String(row.id));
  const { rows } = await sql.query(`${SELECT}
    where m.code='actual_load' and o.superseded_by_id is null
      and o.period_start >= $1::timestamptz and o.period_start < $2::timestamptz
    order by o.period_start, a.id`, [start, end]);
  return aggregateCoincidentActualLoad(rows.map((row) => ({
    areaId: String(row.area_id), periodStart: new Date(String(row.period_start)).toISOString(),
    periodEnd: new Date(String(row.period_end)).toISOString(), valueMw: Number(row.value_mw),
  })), expected, [...versions][0], { start, end });
}

export type PowerFreshness = { latestActualPeriodStart: string | null; ageHours: number | null; status: "fresh" | "stale" | "unavailable" };

export async function powerFreshness(sql: PowerSqlExecutor, now = new Date()): Promise<PowerFreshness> {
  const { rows } = await sql.query(`select max(o.period_start) as latest
    from pipeline.power_observations o join reference.power_metrics m on m.id=o.power_metric_id
    where m.code='actual_load' and o.superseded_by_id is null`, []);
  const latest = rows[0]?.latest;
  if (latest == null) return { latestActualPeriodStart: null, ageHours: null, status: "unavailable" };
  const iso = new Date(String(latest)).toISOString();
  const ageHours = (now.valueOf() - new Date(iso).valueOf()) / 3_600_000;
  return { latestActualPeriodStart: iso, ageHours, status: ageHours <= 6 ? "fresh" : "stale" };
}
