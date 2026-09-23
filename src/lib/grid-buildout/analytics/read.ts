/**
 * The public Grid Buildout Velocity surface.
 *
 * This is the whole product contract. If the chart component disappeared tomorrow, what this file
 * returns would still describe Grid Buildout completely: the frontend renders this, it does not
 * define it.
 *
 * The read model consumes the approved analytical layer and recomputes nothing. GBV-3 already
 * calculated M1-M5 under methodology 1.0.0, validated them against their output contract, and
 * stored each payload beside the run that produced it. Recalculating here from canonical rows
 * would create a second, unversioned definition of the product; instead this reads the run and
 * normalises it into a shape an external client can use without knowing the schema.
 *
 * Two markets that measure different things, and are never combined. ERCOT counts what was
 * energised; CAISO measures how far schedules moved. There is no Grid Buildout total.
 */

import {
  CAISO_SOURCE_SLUG, ERCOT_SOURCE_SLUG, METHODOLOGY_SLUG, METHODOLOGY_VERSION,
  SLIP_MINIMUM_PROJECTS, assertMethodologyApproved,
} from "@/lib/grid-buildout/analytics/methodology";
import type { M1, M2, M3, M4, M5 } from "@/lib/grid-buildout/analytics/types";
import {
  gridBuildoutFreshness, unavailableFreshness, type Freshness,
} from "@/lib/grid-buildout/operations/freshness";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export const METHODOLOGY_PATH = "/docs/methodology/grid-buildout-velocity";

export const SEPARATION_NOTE =
  "ERCOT completion throughput and CAISO schedule slip are separate measurements and are never "
  + "combined. ERCOT publishes an actual in-service date; CAISO publishes none. There is no Grid "
  + "Buildout total, index or cross-market figure.";

export type MarketProvenance = {
  marketSlug: "ercot" | "caiso";
  marketName: string;
  sourceName: string;
  attribution: string;
  role: string;
  sourceSlug: string;
  /** The publisher's own vintage key for the artifact these figures came from. */
  snapshotKey: string;
  /** When Urdais retrieved that artifact. Not the page render time. */
  retrievedAt: string;
  /** Analytical projects in this market's universe after methodology 1.0.0 resolution. */
  analyticalProjects: number;
  /** Canonical source occurrences behind them, before any resolution. */
  canonicalOccurrences: number;
};

export type GridBuildoutReadModel = {
  product: { slug: string; title: string; summary: string };
  methodology: {
    slug: string; version: string; documentPath: string; title: string;
    /** Registry approval state at read time, not a claim from a document. */
    approved: boolean;
  };
  /** When the analytics were calculated. Null when nothing has been published. */
  calculatedAt: string | null;
  inputDigest: string | null;
  /** When this payload was assembled. Never presented as the dataset's age. */
  generatedAt: string;
  markets: { ercot: MarketProvenance | null; caiso: MarketProvenance | null };
  /**
   * Whether the pipeline is still confirming this publication. Derived from the last successful
   * publication, never from a request, a render, or a failed attempt.
   */
  freshness: Freshness;
  metrics: {
    m1: M1 | null; m2: M2 | null; m3: M3 | null; m4: M4 | null; m5: M5 | null;
  };
  coverage: {
    ercotUnknownDriver: number;
    caisoUnknownDriver: number;
    caisoDuplicateGroups: number;
    caisoOccurrencesResolvedAway: number;
    excluded: { market: string; reason: string; count: number }[];
  } | null;
  notes: string[];
};

const MARKET_META = {
  ercot: {
    marketName: "ERCOT",
    role: "Completion throughput and backlog",
    sourceName: "ERCOT Transmission Project and Information Tracking (TPIT)",
    attribution: "Source: Electric Reliability Council of Texas, Inc., "
      + "Transmission Project and Information Tracking report.",
    sourceSlug: ERCOT_SOURCE_SLUG,
  },
  caiso: {
    marketName: "CAISO",
    role: "Schedule slip against approved in-service dates",
    sourceName: "CAISO Transmission Development Forum, Approved Projects (Transmission Planning Process)",
    attribution: "Source: California Independent System Operator Corporation, "
      + "Transmission Development Forum approved-projects workbook.",
    sourceSlug: CAISO_SOURCE_SLUG,
  },
} as const;

/**
 * Terms that must never appear in a published payload. A Grid Buildout total does not exist, and
 * neither does any of the capacity vocabulary the retired mock used.
 */
const FORBIDDEN = [
  /\btransfer capacity\b/i,
  /\bGW added\b/i,
  /\bGVA\b/i,
  /\btransformer lead time\b/i,
  /\bcombined total\b/i,
  /\bcross-?market total\b/i,
];

/** The state before anything has been published. Not an outage, and never mock figures. */
export function unavailableGridBuildoutModel(): GridBuildoutReadModel {
  return {
    product: {
      slug: "grid-buildout-velocity",
      title: "Grid Buildout Velocity",
      summary: "How quickly tracked transmission infrastructure reaches service, and how delivery "
        + "schedules move, in each market's own terms.",
    },
    methodology: {
      slug: METHODOLOGY_SLUG, version: METHODOLOGY_VERSION,
      documentPath: METHODOLOGY_PATH, title: "Urdais Grid Buildout Velocity",
      approved: false,
    },
    calculatedAt: null, inputDigest: null, generatedAt: new Date().toISOString(),
    markets: { ercot: null, caiso: null },
    freshness: unavailableFreshness(),
    metrics: { m1: null, m2: null, m3: null, m4: null, m5: null },
    coverage: null,
    notes: [SEPARATION_NOTE],
  };
}

function asIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

/**
 * The latest validated run, with the metric payloads it produced.
 *
 * Fails closed on an unapproved methodology: authorisation is the registry check, and a surface
 * that cannot prove its rules are approved publishes nothing. Returns the unavailable model when
 * no run exists, because a product that has not been calculated yet is not an error.
 */
export async function loadGridBuildoutReadModel(
  sql: CapacitySqlExecutor,
): Promise<GridBuildoutReadModel> {
  const model = unavailableGridBuildoutModel();

  // Registry-backed, before anything is read. No filesystem, so this behaves identically in a
  // serverless bundle that carries no docs/ directory.
  await assertMethodologyApproved(sql);
  model.methodology.approved = true;

  const runs = await sql.query(
    `select r.id, r.input_digest, r.calculated_at, r.coverage,
            r.ercot_projects, r.caiso_projects,
            er.native_snapshot_key as ercot_key, er.observed_at as ercot_observed,
            ca.native_snapshot_key as caiso_key, ca.observed_at as caiso_observed
       from pipeline.buildout_analytics_runs r
       join reference.methodology_versions mv on mv.id = r.methodology_version_id
       join reference.methodologies m on m.id = mv.methodology_id
       join pipeline.buildout_snapshots er on er.id = r.ercot_snapshot_id
       join pipeline.buildout_snapshots ca on ca.id = r.caiso_snapshot_id
      where m.slug = $1 and mv.version = $2 and mv.status = 'approved'
        and r.run_status = 'validated'
      order by r.calculated_at desc, r.created_at desc
      limit 1`,
    [METHODOLOGY_SLUG, METHODOLOGY_VERSION],
  );
  // Asked regardless of whether a run exists: a product that has never published and one whose
  // pipeline has been failing for a week are different conditions and must read differently.
  model.freshness = await gridBuildoutFreshness(sql);

  const run = runs.rows[0];
  if (run === undefined) return model;

  const runId = String(run.id);
  model.calculatedAt = asIso(run.calculated_at);
  model.inputDigest = String(run.input_digest);

  const coverage = (run.coverage ?? {}) as Record<string, unknown>;
  const asCount = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  // Canonical occurrences are read from the run's own coverage record rather than re-counted, so
  // the published 233 is the number the approved calculation actually saw.
  model.markets.ercot = {
    marketSlug: "ercot", ...MARKET_META.ercot,
    snapshotKey: String(run.ercot_key), retrievedAt: asIso(run.ercot_observed),
    analyticalProjects: asCount(run.ercot_projects),
    canonicalOccurrences: asCount(coverage.ercotOccurrencesRead),
  };
  model.markets.caiso = {
    marketSlug: "caiso", ...MARKET_META.caiso,
    snapshotKey: String(run.caiso_key), retrievedAt: asIso(run.caiso_observed),
    analyticalProjects: asCount(run.caiso_projects),
    canonicalOccurrences: asCount(coverage.caisoOccurrencesRead),
  };

  model.coverage = {
    ercotUnknownDriver: asCount(coverage.ercotUnknownDriver),
    caisoUnknownDriver: asCount(coverage.caisoUnknownDriver),
    caisoDuplicateGroups: asCount(coverage.caisoDuplicateGroups),
    caisoOccurrencesResolvedAway: asCount(coverage.caisoOccurrencesResolvedAway),
    excluded: Array.isArray(coverage.excluded)
      ? (coverage.excluded as { market: string; reason: string; count: number }[])
      : [],
  };

  // Deterministic order so two reads of one run serialise identically.
  const results = await sql.query(
    `select metric, payload from pipeline.buildout_metric_results
      where run_id = $1 order by metric`,
    [runId],
  );
  for (const row of results.rows) {
    const payload = row.payload as Record<string, unknown>;
    switch (String(row.metric)) {
      case "m1_projects_entering_service": model.metrics.m1 = payload as unknown as M1; break;
      case "m2_active_backlog": model.metrics.m2 = payload as unknown as M2; break;
      case "m3_completions_decomposition": model.metrics.m3 = payload as unknown as M3; break;
      case "m4_schedule_slip": model.metrics.m4 = payload as unknown as M4; break;
      case "m5_cancellations": model.metrics.m5 = payload as unknown as M5; break;
      default: break;
    }
  }

  return model;
}

function finiteCount(value: unknown, label: string, problems: string[]): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) { problems.push(`${label} is ${String(value)}`); return null; }
  if (!Number.isInteger(parsed) || parsed < 0) {
    problems.push(`${label} is ${parsed}; counts are non-negative integers`);
    return null;
  }
  return parsed;
}

/**
 * The contract the public boundary must satisfy before anything is served.
 *
 * These are methodology invariants, not arbitrary assertions: each one restates a relationship
 * 1.0.0 requires, so a payload that fails is a payload whose meaning has drifted from the approved
 * rules. An empty model passes trivially — nothing published is not a contract failure.
 */
export function validateGridBuildoutModel(model: GridBuildoutReadModel): string[] {
  const problems: string[] = [];
  const { m1, m2, m3, m4, m5 } = model.metrics;
  if (m1 === null && m2 === null && m3 === null && m4 === null && m5 === null) return problems;

  if (model.methodology.version !== METHODOLOGY_VERSION) {
    problems.push(`methodology version is ${model.methodology.version}, expected ${METHODOLOGY_VERSION}`);
  }
  if (!model.methodology.approved) {
    problems.push("methodology is not approved in the registry");
  }
  if (model.calculatedAt === null || Number.isNaN(Date.parse(model.calculatedAt))) {
    problems.push("published metrics carry no valid calculation timestamp");
  }

  const serialised = JSON.stringify({ ...model, notes: [] });
  for (const pattern of FORBIDDEN) {
    if (pattern.test(serialised)) problems.push(`the payload contains a forbidden term: ${pattern}`);
  }

  // M1: periods reconcile to the total.
  if (m1 !== null) {
    let sum = 0;
    for (const period of m1.periods) {
      const count = finiteCount(period.count, `m1 ${period.period}`, problems);
      if (count !== null) sum += count;
    }
    const total = finiteCount(m1.total, "m1 total", problems);
    if (total !== null && sum !== total) {
      problems.push(`m1 periods sum to ${sum}, total says ${total}`);
    }
    finiteCount(m1.excludedSentinelDate, "m1 sentinel exclusions", problems);
    if (m1.unit !== "projects") problems.push(`m1 unit is ${m1.unit}, expected projects`);
  }

  // M2: lifecycle components reconcile to the total.
  if (m2 !== null) {
    let sum = 0;
    for (const item of m2.byLifecycle) {
      const count = finiteCount(item.count, `m2 ${item.lifecycle}`, problems);
      if (count !== null) sum += count;
    }
    const total = finiteCount(m2.total, "m2 total", problems);
    if (total !== null && sum !== total) {
      problems.push(`m2 lifecycle components sum to ${sum}, total says ${total}`);
    }
  }

  // M3: both decompositions describe M1's population.
  if (m3 !== null) {
    const population = finiteCount(m3.population, "m3 population", problems);
    if (population !== null && m1 !== null && population !== m1.total) {
      problems.push(`m3 population ${population} does not equal m1 total ${m1.total}`);
    }
    let works = 0;
    for (const item of m3.byWorksCharacter) {
      const count = finiteCount(item.count, `m3 ${item.character}`, problems);
      if (count !== null) works += count;
      if (!Number.isFinite(item.share) || item.share < 0 || item.share > 1) {
        problems.push(`m3 ${item.character} share ${item.share} is outside 0..1`);
      }
    }
    if (population !== null && works !== population) {
      problems.push(`m3 works character sums to ${works}, population is ${population}`);
    }
    let kv = 0;
    for (const item of m3.byServiceLevelKv) {
      const count = finiteCount(item.count, `m3 ${item.kv} kV`, problems);
      if (count !== null) kv += count;
    }
    const suppressed = finiteCount(m3.suppressedKvProjects, "m3 suppressed kV projects", problems);
    if (population !== null && suppressed !== null && kv + suppressed !== population) {
      problems.push(`m3 kV classes (${kv}) plus suppressed (${suppressed}) do not reconcile to ${population}`);
    }
  }

  // M4: the coverage identity, and a distribution that is whole or absent.
  if (m4 !== null) {
    const published = m4.distribution === null ? 0
      : finiteCount(m4.distribution.count, "m4 count", problems) ?? 0;
    const year = finiteCount(m4.excludedYearPrecision, "m4 year-precision exclusions", problems) ?? 0;
    const missing = finiteCount(m4.excludedMissingEndpoint, "m4 missing-endpoint exclusions", problems) ?? 0;
    const cancelled = finiteCount(m4.excludedCancelled, "m4 cancelled exclusions", problems) ?? 0;
    const universe = model.markets.caiso?.analyticalProjects ?? null;
    if (universe !== null && published + year + missing + cancelled !== universe) {
      problems.push(
        `m4 coverage does not close: ${published} + ${year} + ${missing} + ${cancelled} `
        + `does not equal the ${universe}-project CAISO universe`);
    }
    if (m4.unit !== "days") problems.push(`m4 unit is ${m4.unit}, expected days`);
    if (m4.published) {
      const d = m4.distribution;
      if (d === null) problems.push("m4 is published with no distribution");
      else {
        for (const [label, value] of Object.entries(d)) {
          if (!Number.isFinite(value)) problems.push(`m4 ${label} is ${String(value)}`);
        }
        if (!(d.min <= d.q1 && d.q1 <= d.median && d.median <= d.q3 && d.q3 <= d.max)) {
          problems.push(`m4 quantiles are not ordered: ${d.min}/${d.q1}/${d.median}/${d.q3}/${d.max}`);
        }
        if (d.count < SLIP_MINIMUM_PROJECTS) {
          problems.push(`m4 is published with ${d.count} projects, below the floor of ${SLIP_MINIMUM_PROJECTS}`);
        }
      }
    } else if (m4.distribution !== null) {
      problems.push("m4 is withheld yet carries a distribution");
    }
  }

  // M5: reasons cannot outnumber cancellations, and no on-hold figure exists at 1.0.0.
  if (m5 !== null) {
    const cancelled = finiteCount(m5.cancelled, "m5 cancelled", problems);
    finiteCount(m5.unmappedStatusCount, "m5 unmapped statuses", problems);
    if (cancelled !== null && m5.reasons.length > cancelled) {
      problems.push(`m5 lists ${m5.reasons.length} reasons for ${cancelled} cancellations`);
    }
    if (m5.onHoldReported !== false) problems.push("m5 reports an on-hold figure, which 1.0.0 does not publish");
  }

  // A published payload must not claim to have never published. The gate may say stale — that is
  // an honest state and not a contract failure — but `unavailable` beside real metrics means the
  // ledger and the analytics disagree about whether anything is live.
  if (model.freshness.status === "unavailable") {
    problems.push("metrics are published while freshness reports nothing has ever been published");
  }

  // Resolution can only ever reduce a count, never invent one.
  for (const market of [model.markets.ercot, model.markets.caiso]) {
    if (market === null) continue;
    if (market.attribution.trim() === "") problems.push(`${market.marketSlug} carries no attribution`);
    const analytical = finiteCount(market.analyticalProjects, `${market.marketSlug} analytical projects`, problems);
    const canonical = finiteCount(market.canonicalOccurrences, `${market.marketSlug} canonical occurrences`, problems);
    if (analytical !== null && canonical !== null && analytical > canonical) {
      problems.push(
        `${market.marketSlug} reports ${analytical} analytical projects from ${canonical} canonical `
        + "occurrences; resolution cannot increase a count");
    }
  }

  return problems;
}
