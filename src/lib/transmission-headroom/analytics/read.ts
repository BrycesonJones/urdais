/**
 * The public read model for Transmission Headroom.
 *
 * Two rules shape the whole file, and both are enforced in SQL rather than left to a renderer.
 *
 * A row reaches a caller only if the methodology is approved, the result is marked publishable,
 * the metric is live, and the source's derived-display permission is in force. Four conditions in
 * one `where` clause, so nothing downstream can forget one.
 *
 * And the two markets never meet. There is no combined object, no shared list and no total: the
 * model returns `markets.nyiso` and `markets.ercot` as separate structures, because a NYISO
 * interface margin and an ERCOT constraint margin describe different populations and averaging
 * them would be averaging two different questions.
 */

import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { METHODOLOGY_SLUG, METHODOLOGY_VERSION }
  from "@/lib/transmission-headroom/analytics/methodology";
import type { ResultStatus } from "@/lib/transmission-headroom/analytics/calculate";

export const METHODOLOGY_PATH = "/docs/methodology/transmission-headroom";

export type PublicMetric = {
  metric: string;
  label: string;
  status: ResultStatus;
  value: number | null;
  unit: string;
  /** Always present for a distribution, so a reader sees `n = 16` next to the number. */
  sampleSize: number;
  coverage: Record<string, unknown>;
};

export type PublicEntityRow = {
  entityId: string;
  name: string;
  /** ERCOT only: the outage the limit protects against. */
  contingencyName: string | null;
  contingencyKind: string | null;
  status: ResultStatus;
  headroomMw: number | null;
  utilizationPct: number | null;
  /** Null unless the source's terms permit showing its own value. */
  flowMw: number | null;
  limitMw: number | null;
  /** ERCOT only, from the source shadow price. Never derived from the margin. */
  binding: boolean | null;
  observedAt: string | null;
  /** Why there is no number, in the reader's words. */
  statusReason: string | null;
};

export type PublicMarket = {
  marketSlug: string;
  marketName: string;
  productLabel: string;
  populationDescription: string;
  sourceName: string;
  attribution: string;
  sourceStatus: "current" | "stale" | "unavailable";
  latestObservationAt: string | null;
  retrievedAt: string | null;
  entitiesObserved: number;
  entitiesEligible: number;
  entitiesUnavailable: number;
  summary: PublicMetric[];
  entities: PublicEntityRow[];
  /** Metrics the methodology names but does not approve. Named, never blank. */
  deferredMetrics: { metric: string; label: string; reason: string }[];
  /** ERCOT only. */
  contingencySplit: { baseCase: number; postContingency: number } | null;
  implausibleLimitExcluded: number | null;
};

export type TransmissionReadModel = {
  methodology: { slug: string; version: string; documentPath: string; title: string };
  calculatedAt: string | null;
  inputDigest: string | null;
  generatedAt: string;
  markets: { nyiso: PublicMarket | null; ercot: PublicMarket | null };
  notes: string[];
};

export const SEPARATION_NOTE =
  "NYISO interface headroom and ERCOT constraint margin are separate measurements and are never "
  + "combined. NYISO's population is the interfaces it publishes; ERCOT's is the constraints its "
  + "dispatch was actively tracking. There is no combined figure, and no total for either market.";

const MARKET_META = {
  nyiso: {
    marketName: "NYISO",
    productLabel: "Interface Headroom",
    sourceName: "NYISO External Limits and Flows",
    attribution: "Source: New York Independent System Operator, Inc., External Limits and Flows.",
    populationDescription:
      "The transmission interfaces NYISO publishes in External Limits and Flows, at the instants "
      + "it publishes them. Not every interface in New York, and the source gives no way to "
      + "separate internal transfer interfaces from external scheduled ties.",
    interfaceSlug: "nyiso-external-limits-flows",
  },
  ercot: {
    marketName: "ERCOT",
    productLabel: "Constraint Margin",
    sourceName: "ERCOT SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD)",
    attribution: "Source: Electric Reliability Council of Texas, Inc., "
      + "SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD).",
    populationDescription:
      "The constraints ERCOT SCED was actively tracking. This is not a measure of total ERCOT "
      + "network headroom: a constraint appears only while dispatch is managing it, so elements "
      + "with abundant margin never appear at all.",
    interfaceSlug: "ercot-sced-binding-constraints",
  },
} as const;

/** Reader-facing copy for a status that carries no number. */
export function statusReason(status: ResultStatus, coverage: Record<string, unknown>): string | null {
  if (status === "live") return null;
  const reason = typeof coverage.reason === "string" ? coverage.reason : null;
  switch (reason) {
    case "unmonitored_direction": return "Unmonitored direction";
    case "zero_flow_direction_undetermined": return "Direction undetermined at zero flow";
    case "implausible_limit": return "Source limit outside the plausible range";
    default: break;
  }
  switch (status) {
    case "source_stale": return "Source stale";
    case "insufficient_sample": return "Too few entities to publish";
    case "rights_blocked": return "Not available for public display";
    case "methodology_deferred": return "Deferred by methodology";
    default: return "Not available";
  }
}

export function unavailableTransmissionModel(): TransmissionReadModel {
  return {
    methodology: {
      slug: METHODOLOGY_SLUG, version: METHODOLOGY_VERSION,
      documentPath: METHODOLOGY_PATH, title: "Urdais Transmission Headroom",
    },
    calculatedAt: null, inputDigest: null, generatedAt: new Date().toISOString(),
    markets: { nyiso: null, ercot: null }, notes: [SEPARATION_NOTE],
  };
}

/**
 * The latest validated run, with every publishable result.
 *
 * Returns the unavailable model rather than throwing when nothing has been calculated: a surface
 * that has not been activated is not an outage.
 */
export async function loadTransmissionAnalytics(
  sql: CapacitySqlExecutor | null,
): Promise<TransmissionReadModel> {
  if (sql === null) return unavailableTransmissionModel();

  const runResult = await sql.query(
    `select r.id, r.calculated_at::text as calculated_at, r.input_digest, mv.version, m.name
       from pipeline.transmission_analytics_runs r
       join reference.methodology_versions mv on mv.id = r.methodology_version_id
       join reference.methodologies m on m.id = mv.methodology_id
      where r.run_status = 'validated' and mv.status = 'approved' and m.slug = $1
      order by r.calculated_at desc limit 1`,
    [METHODOLOGY_SLUG],
  );
  const run = runResult.rows[0];
  if (run === undefined) return unavailableTransmissionModel();

  // Four conditions, all in SQL. A row that fails any of them never reaches TypeScript, so no
  // renderer can serialise it by forgetting a filter.
  const rows = await sql.query(
    `select res.metric_code, res.market_slug, res.entity_id, res.entity_label,
            res.contingency_kind, res.observed_at::text as observed_at, res.status,
            res.value::text as value, res.unit, res.sample_size, res.coverage,
            d.label, d.scope
       from pipeline.transmission_metric_results res
       join reference.transmission_metric_definitions d on d.code = res.metric_code
       join pipeline.transmission_analytics_runs r on r.id = res.run_id
       join reference.methodology_versions mv on mv.id = r.methodology_version_id
       join reference.source_use_permissions p
         on p.source_interface_id = res.source_interface_id
        and p.purpose_code = 'public_transmission_headroom_derived_metric_display'
      where res.run_id = $1
        and res.publication_state = 'publishable'
        and res.status <> 'rights_blocked'
        and d.is_live
        and mv.status = 'approved'
        and p.disposition = 'permitted'
      order by res.market_slug, d.scope desc, res.metric_code, res.entity_label`,
    [String(run.id)],
  );

  // Deferred metrics are named, not hidden — but they can never carry a value.
  const deferred = await sql.query(
    `select code, market_slug, label, deferred_reason from reference.transmission_metric_definitions
      where not is_live order by market_slug, code`, []);

  const sources = await sql.query(
    `select si.slug,
            (select max(f.observed_at)::text from pipeline.transmission_flow_observations f
              where f.source_interface_id = si.id) as latest_observation_at,
            (select max(s.observed_at)::text from pipeline.transmission_snapshots s
              where s.source_interface_id = si.id) as retrieved_at,
            (select case when extract(epoch from (now() - max(f.observed_at))) / 3600
                              > mon.stale_after_hours then 'stale' else 'current' end
               from pipeline.transmission_flow_observations f
              where f.source_interface_id = si.id) as source_status
       from reference.source_interfaces si
       join reference.transmission_source_monitors mon on mon.source_interface_id = si.id`,
    [],
  );
  const sourceBySlug = new Map(sources.rows.map((row) => [String(row.slug), row]));

  const markets: TransmissionReadModel["markets"] = { nyiso: null, ercot: null };
  for (const key of ["nyiso", "ercot"] as const) {
    const meta = MARKET_META[key];
    const mine = rows.rows.filter((row) => String(row.market_slug) === key);
    if (mine.length === 0) continue;
    const source = sourceBySlug.get(meta.interfaceSlug);

    const summary: PublicMetric[] = [];
    const entities: PublicEntityRow[] = [];
    const byEntity = new Map<string, PublicEntityRow>();

    for (const row of mine) {
      const coverage = (row.coverage ?? {}) as Record<string, unknown>;
      const status = String(row.status) as ResultStatus;
      const value = row.value == null ? null : Number(row.value);
      if (row.entity_id == null) {
        summary.push({
          metric: String(row.metric_code), label: String(row.label), status, value,
          unit: String(row.unit), sampleSize: Number(row.sample_size), coverage,
        });
        continue;
      }
      const entityId = String(row.entity_id);
      const existing = byEntity.get(entityId) ?? {
        entityId, name: String(row.entity_label),
        contingencyName: null,
        contingencyKind: row.contingency_kind == null ? null : String(row.contingency_kind),
        status, headroomMw: null, utilizationPct: null, flowMw: null, limitMw: null,
        binding: typeof coverage.bindingFromShadowPrice === "boolean"
          ? coverage.bindingFromShadowPrice : null,
        observedAt: row.observed_at == null ? null : String(row.observed_at),
        statusReason: statusReason(status, coverage),
      };
      if (String(row.metric_code).endsWith("_utilization_pct")) existing.utilizationPct = value;
      else { existing.headroomMw = value; existing.status = status;
             existing.statusReason = statusReason(status, coverage); }
      byEntity.set(entityId, existing);
    }
    entities.push(...byEntity.values());

    // ERCOT's constraint label is "NAME / CONTINGENCY"; split it so the UI can show both without
    // re-parsing, and never expose ConstraintID as identity.
    for (const entity of entities) {
      const slash = entity.name.lastIndexOf(" / ");
      if (key === "ercot" && slash > 0) {
        entity.contingencyName = entity.name.slice(slash + 3);
        entity.name = entity.name.slice(0, slash);
      }
    }

    const distribution = summary.find((metric) => metric.metric.endsWith("_median_mw"));
    const coverage = distribution?.coverage ?? {};
    const number = (key: string) =>
      typeof coverage[key] === "number" ? (coverage[key] as number) : 0;

    markets[key] = {
      marketSlug: key, marketName: meta.marketName, productLabel: meta.productLabel,
      populationDescription: meta.populationDescription, sourceName: meta.sourceName,
      attribution: meta.attribution,
      sourceStatus: source?.source_status == null
        ? "unavailable" : String(source.source_status) as PublicMarket["sourceStatus"],
      latestObservationAt: source?.latest_observation_at == null
        ? null : String(source.latest_observation_at),
      retrievedAt: source?.retrieved_at == null ? null : String(source.retrieved_at),
      entitiesObserved: number("entitiesObserved"),
      entitiesEligible: number("entitiesEligible"),
      entitiesUnavailable: number("entitiesObserved") - number("entitiesEligible"),
      summary,
      entities: entities.sort((a, b) =>
        (a.headroomMw ?? Number.POSITIVE_INFINITY) - (b.headroomMw ?? Number.POSITIVE_INFINITY)),
      deferredMetrics: deferred.rows
        .filter((row) => String(row.market_slug) === key)
        .map((row) => ({
          metric: String(row.code), label: String(row.label),
          reason: String(row.deferred_reason ?? ""),
        })),
      contingencySplit: key === "ercot" ? {
        baseCase: number("baseCaseEntities"),
        postContingency: number("postContingencyEntities"),
      } : null,
      implausibleLimitExcluded: key === "ercot" ? number("entitiesImplausibleLimit") : null,
    };
  }

  return {
    methodology: {
      slug: METHODOLOGY_SLUG, version: String(run.version),
      documentPath: METHODOLOGY_PATH, title: String(run.name),
    },
    calculatedAt: String(run.calculated_at),
    inputDigest: String(run.input_digest),
    generatedAt: new Date().toISOString(),
    markets, notes: [SEPARATION_NOTE],
  };
}

/** Terms a public payload must never contain, however they arrive. */
const FORBIDDEN = [
  /total[_ ]?transmission[_ ]?headroom/i, /network[_ ]?headroom/i, /combined[_ ]?headroom/i,
  /combined[_ ]?utilization/i, /cross[_ ]?market/i, /national[_ ]?headroom/i,
  /interfaces[_ ]?at[_ ]?limit/i, /at[_ ]?limit[_ ]?count/i, /average[_ ]?headroom/i,
];

/**
 * The model's own contract, checked before it is served.
 *
 * A response failing this is a bug worth a 500 rather than a page of numbers nobody checked.
 */
export function validateTransmissionModel(model: TransmissionReadModel): string[] {
  const problems: string[] = [];
  const present = [model.markets.nyiso, model.markets.ercot].filter((m) => m !== null);
  if (present.length === 0) return problems;

  if (model.methodology.version !== METHODOLOGY_VERSION) {
    problems.push(`methodology version is ${model.methodology.version}, expected ${METHODOLOGY_VERSION}`);
  }

  // Scan the serialised payload for any forbidden key or label, wherever it was introduced.
  const serialised = JSON.stringify({
    ...model,
    // The separation note and population descriptions legitimately say what is NOT published.
    notes: [], markets: {
      nyiso: model.markets.nyiso === null ? null
        : { ...model.markets.nyiso, populationDescription: "", deferredMetrics: [] },
      ercot: model.markets.ercot === null ? null
        : { ...model.markets.ercot, populationDescription: "", deferredMetrics: [] },
    },
  });
  for (const pattern of FORBIDDEN) {
    if (pattern.test(serialised)) {
      problems.push(`the payload contains a forbidden cross-market or unsupported term: ${pattern}`);
    }
  }

  for (const market of present) {
    if (market!.attribution.trim() === "") problems.push(`${market!.marketSlug} carries no attribution`);
    for (const metric of market!.summary) {
      if ((metric.status === "live") !== (metric.value !== null)) {
        problems.push(`${market!.marketSlug}/${metric.metric} is ${metric.status} with `
          + `${metric.value === null ? "no" : "a"} value`);
      }
      // A percentile without its sample size is a number nobody can weigh.
      if (/_p\d+_|_median_/.test(metric.metric) && metric.status === "live" && metric.sampleSize <= 0) {
        problems.push(`${market!.marketSlug}/${metric.metric} publishes a distribution with no sample size`);
      }
    }
    for (const entity of market!.entities) {
      if ((entity.status === "live") !== (entity.headroomMw !== null)) {
        problems.push(`${market!.marketSlug}/${entity.entityId} is ${entity.status} with `
          + `${entity.headroomMw === null ? "no" : "a"} headroom`);
      }
      if (entity.status !== "live" && entity.statusReason === null) {
        problems.push(`${market!.marketSlug}/${entity.entityId} has no reason for ${entity.status}`);
      }
    }
    for (const deferredMetric of market!.deferredMetrics) {
      if (market!.summary.some((metric) => metric.metric === deferredMetric.metric)) {
        problems.push(`${deferredMetric.metric} is deferred and also published`);
      }
    }
  }
  return problems;
}
