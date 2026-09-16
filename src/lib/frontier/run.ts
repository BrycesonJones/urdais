/**
 * The Model Frontier capability run, shared by the scheduled route and the operator script.
 *
 * One implementation, two callers. The cron route and `scripts/frontier/ingest.ts` differ only
 * in how they obtain a connection and what they print; a second copy of the ingestion would be
 * a second thing to keep correct, and the one that runs unattended is the one nobody watches.
 *
 * **Three states, kept apart.** The run distinguishes facts a single boolean would flatten:
 *
 *   `scheduler`  the job ran and completed. A property of Urdais's operations.
 *   `source`     the fetched bundle is what Epoch is serving at that moment.
 *   `rollover`   the bundle's bytes differ from the last ingested ones, so observations moved.
 *
 * An unchanged bundle is a **successful scheduled check with no source rollover**, and saying
 * otherwise would turn a healthy quiet day into a false claim of new data. Epoch publishes
 * when models are evaluated, not on a calendar, so unchanged is the ordinary outcome and has
 * to be reportable as success without being reportable as freshness of the data.
 */

import { createHash } from "node:crypto";

import { benchmarkForFile, observationsFromFile } from "@/lib/frontier/source/bundle";
import { readZipEntries } from "@/lib/frontier/source/zip";
import { resolveIdentity, type PricedModel } from "@/lib/frontier/identity";
import { selectPrice, type PriceRow } from "@/lib/frontier/price";
import {
  applyObservations,
  lastBundleHash,
  recordCheckRun,
  recordRetrieval,
  resolveLineage,
  upsertLink,
  upsertPriceSelection,
  type FrontierLineage,
} from "@/lib/frontier/store";
import {
  EPOCH_BUNDLE_URL,
  EPOCH_CITATION,
  EPOCH_LICENSE,
  EPOCH_SOURCE_SLUG,
  FRONTIER_BENCHMARKS,
  FrontierContractError,
  type CapabilityObservation,
} from "@/lib/frontier/types";
import type { SqlExecutor } from "@/lib/utvi/store";

export const FRONTIER_COLLECTOR_IDENTITY = "urdais-frontier-collector" as const;

/** What one run did. `sourceChanged` is the only field that may be called a rollover. */
export type FrontierRunResult = {
  ok: boolean;
  ranAt: string;
  /** The hash of the bundle this run fetched. */
  bundleHash: string | null;
  /** The hash the previous successful run ingested, or null on a first run. */
  previousHash: string | null;
  /** True only when the fetched bytes differ from the last ingested ones. */
  sourceChanged: boolean;
  bundleByteLength: number | null;
  observations: { created: number; revised: number; unchanged: number } | null;
  identity: { evidenced: number; ambiguous: number; unmapped: number; notApplicable: number } | null;
  priceSelections: { selected: number; excluded: number; reasons: string[] } | null;
  /** Why the run failed, where it did. Never an empty string on a failure. */
  failure: string | null;
};

/** The one-line summary a cron history can carry without anyone opening the payload. */
export function frontierRunSummary(result: FrontierRunResult): string {
  if (!result.ok) return `failed: ${result.failure ?? "unknown"}`;
  if (!result.sourceChanged) {
    return `checked, source unchanged (${result.bundleHash?.slice(0, 12)}); no capability rollover`;
  }
  const o = result.observations;
  return `source rolled over (${result.previousHash?.slice(0, 12) ?? "none"} -> ${result.bundleHash?.slice(0, 12)}); ${o?.created ?? 0} created, ${o?.revised ?? 0} revised`;
}

type RunOptions = {
  /** Injected in tests; production always fetches the published path. */
  fetchBundle?: () => Promise<Buffer>;
  now?: () => Date;
  /** Ingest even when the hash matches. Operator-only; the schedule never sets it. */
  force?: boolean;
  /**
   * Which clock this run proves. Only `scheduled` counts as evidence the schedule is alive --
   * an operator running the script by hand says nothing about whether the cron fired.
   */
  trigger?: "scheduled" | "operator";
};

async function fetchPublishedBundle(): Promise<Buffer> {
  const response = await fetch(EPOCH_BUNDLE_URL);
  if (!response.ok) throw new FrontierContractError(`bundle fetch failed: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Fetch, compare, and ingest only if the source moved.
 *
 * Failures are returned rather than thrown so a caller can report them with the run's other
 * state; a thrown error from a scheduled job tends to become a stack trace nobody reads.
 */
export async function runFrontierCapability(
  sql: SqlExecutor,
  options: RunOptions = {},
): Promise<FrontierRunResult> {
  const now = (options.now ?? (() => new Date()))();
  const base: FrontierRunResult = {
    ok: false,
    ranAt: now.toISOString(),
    bundleHash: null,
    previousHash: null,
    sourceChanged: false,
    bundleByteLength: null,
    observations: null,
    identity: null,
    priceSelections: null,
    failure: null,
  };

  const trigger = options.trigger ?? "operator";
  let lineage: FrontierLineage | null = null;

  try {
    lineage = await resolveLineage(sql, EPOCH_SOURCE_SLUG);
    const archive = await (options.fetchBundle ?? fetchPublishedBundle)();
    const bundleHash = createHash("sha256").update(archive).digest("hex");
    base.bundleHash = bundleHash;
    base.bundleByteLength = archive.length;

    const entries = readZipEntries(archive);

    // The licence travels inside the artifact, so it is checked on every run rather than
    // remembered from the day the source was approved. A bundle that stopped saying it is
    // not one Urdais may republish, and refusing is the only safe response.
    const readme = entries.find((entry) => entry.name.endsWith("README.md"));
    if (readme === undefined || !/Creative Commons Attribution/i.test(readme.data.toString("utf8"))) {
      base.failure = "the bundle README does not state the Creative Commons Attribution licence";
      await recordCheckRun(sql, lineage, {
        ranAt: base.ranAt, trigger, outcome: "failed", bundleHash,
        sourceChanged: false, capabilityRetrievalId: null, created: null, revised: null,
        detail: base.failure,
      });
      return base;
    }

    const previousHash = await lastBundleHash(sql);
    base.previousHash = previousHash;
    base.sourceChanged = previousHash !== bundleHash;

    if (!base.sourceChanged && options.force !== true) {
      // A successful check that ingests nothing: no retrieval row, no observation, no link, no
      // selection. Idempotence is the property, and recording a retrieval here would quietly
      // make every day look like a collection. The heartbeat is the one exception, and carries
      // no capability data -- only the fact that a job ran and found the source unmoved.
      await recordCheckRun(sql, lineage, {
        ranAt: base.ranAt, trigger, outcome: "unchanged", bundleHash,
        sourceChanged: false, capabilityRetrievalId: null, created: null, revised: null,
        detail: null,
      });
      base.ok = true;
      return base;
    }

    const observations: CapabilityObservation[] = [];
    let files = 0;
    for (const benchmark of FRONTIER_BENCHMARKS) {
      const entry = entries.find((candidate) => candidate.name.endsWith(benchmark.sourceFile));
      if (entry === undefined || benchmarkForFile(benchmark.sourceFile) === null) {
        base.failure = `the bundle no longer contains an eligible ${benchmark.sourceFile}; refusing a partial ingestion`;
        await recordCheckRun(sql, lineage, {
          ranAt: base.ranAt, trigger, outcome: "failed", bundleHash,
          sourceChanged: true, capabilityRetrievalId: null, created: null, revised: null,
          detail: base.failure,
        });
        return base;
      }
      files += 1;
      observations.push(...observationsFromFile(benchmark.sourceFile, entry.data.toString("utf8")));
    }

    const retrieval = await recordRetrieval(sql, lineage, {
      bundleHash,
      byteLength: archive.length,
      citation: EPOCH_CITATION,
      license: EPOCH_LICENSE,
      retrievedAt: now.toISOString(),
      fileCount: files,
      rowCount: observations.length,
    });

    base.observations = await applyObservations(
      sql,
      lineage,
      retrieval.capabilityRetrievalId,
      EPOCH_CITATION,
      EPOCH_LICENSE,
      observations,
    );

    // Identity is re-evaluated on every ingestion, so a model Urdais prices for the first time
    // links on the next run without anyone remembering to backfill it.
    const { rows: catalogueRows } = await sql.query(
      `select p.slug as provider_slug, m.provider_model_id
         from reference.models m join reference.providers p on p.id = m.provider_id`,
      [],
    );
    const catalogue: PricedModel[] = catalogueRows.map((row) => ({
      providerSlug: String(row.provider_slug),
      providerModelId: String(row.provider_model_id),
    }));

    const identity = { evidenced: 0, ambiguous: 0, unmapped: 0, notApplicable: 0 };
    const identifiers = new Map(observations.map((o) => [o.sourceModelIdentifier, o.sourceOrganization]));
    for (const [identifier, organization] of identifiers) {
      const link = resolveIdentity(identifier, organization, catalogue);
      if (link.state === "evidenced") identity.evidenced += 1;
      else if (link.state === "ambiguous") identity.ambiguous += 1;
      else if (link.state === "not_applicable") identity.notApplicable += 1;
      else identity.unmapped += 1;
      await upsertLink(sql, lineage, link, FRONTIER_COLLECTOR_IDENTITY);
    }
    base.identity = identity;

    base.priceSelections = await refreshPriceSelections(sql);
    await recordCheckRun(sql, lineage, {
      ranAt: base.ranAt, trigger, outcome: "ingested", bundleHash,
      sourceChanged: true, capabilityRetrievalId: retrieval.capabilityRetrievalId,
      created: base.observations.created, revised: base.observations.revised, detail: null,
    });
    base.ok = true;
    return base;
  } catch (error) {
    base.failure = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    // Best effort: a failure that happened before lineage resolved has nowhere to be recorded,
    // and a heartbeat write that itself fails must not mask the original failure.
    if (lineage !== null) {
      try {
        await recordCheckRun(sql, lineage, {
          ranAt: base.ranAt, trigger, outcome: "failed", bundleHash: base.bundleHash,
          sourceChanged: false, capabilityRetrievalId: null, created: null, revised: null,
          detail: base.failure,
        });
      } catch {
        // Swallowed deliberately; `base.failure` already carries what went wrong.
      }
    }
    return base;
  }
}

/**
 * Re-apply the price selection rule over the current catalogue.
 *
 * Run on every ingestion because Token Price moves on its own schedule: a model whose
 * catalogue changed between capability runs must be re-selected, and a model that became
 * ambiguous must stop being selected rather than keep a stale row.
 */
export async function refreshPriceSelections(
  sql: SqlExecutor,
): Promise<{ selected: number; excluded: number; reasons: string[] }> {
  const { rows } = await sql.query(
    `select p.slug as provider_slug, m.provider_model_id, o.pricing_dimension, o.service_tier,
            o.context_tier, o.region, o.canonical_price_usd_per_1m::float8 as usd,
            o.retrieved_at::date::text as observed_at
       from pipeline.token_price_observations o
       join reference.models m on m.id = o.model_id
       join reference.providers p on p.id = m.provider_id`,
    [],
  );

  const byModel = new Map<string, { slug: string; id: string; rows: PriceRow[] }>();
  for (const row of rows) {
    const key = `${String(row.provider_slug)}/${String(row.provider_model_id)}`;
    const entry = byModel.get(key) ?? { slug: String(row.provider_slug), id: String(row.provider_model_id), rows: [] };
    entry.rows.push({
      dimension: String(row.pricing_dimension),
      serviceTier: row.service_tier === null ? null : String(row.service_tier),
      contextTier: row.context_tier === null ? null : String(row.context_tier),
      region: row.region === null ? null : String(row.region),
      usdPer1m: Number(row.usd),
      observedAt: String(row.observed_at),
    });
    byModel.set(key, entry);
  }

  let selected = 0;
  const reasons: string[] = [];
  for (const { slug, id, rows: priceRows } of byModel.values()) {
    const outcome = selectPrice(slug, id, priceRows);
    if (outcome.kind === "excluded") {
      reasons.push(outcome.reason);
      continue;
    }
    await upsertPriceSelection(sql, outcome.selection);
    selected += 1;
  }
  return { selected, excluded: reasons.length, reasons };
}
