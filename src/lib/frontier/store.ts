/**
 * Persisting capability retrievals, observations, identity links and price selections.
 *
 * Two behaviours here are the whole of the ingestion contract.
 *
 * **Idempotence is by content, not by schedule.** The bundle is served from one unversioned
 * path, so the only identity it has is the hash of its bytes. A retrieval whose hash matches
 * the last successful one writes no observations and says so — which is what lets a daily
 * check be cheap and honest at the same time, and what distinguishes "checked, unchanged"
 * from "new data" in the freshness gate.
 *
 * **A revision supersedes; it never overwrites.** When a row's content hash changes, the old
 * observation is marked superseded by the new one and both remain. The live unique index
 * allows one active row per benchmark and identifier, so the old row has to be superseded
 * *before* the new one lands — the same deferred-reference ordering UTVI uses, and for the
 * same reason.
 */

import { randomUUID } from "node:crypto";

import type { SqlExecutor } from "@/lib/utvi/store";
import type { CapabilityObservation, IdentityLink, PriceSelection } from "@/lib/frontier/types";
import { FrontierContractError } from "@/lib/frontier/types";

export type FrontierLineage = { sourceInterfaceId: string; permissionGrantId: string; providerId: string };

function one<T extends Record<string, unknown>>(rows: T[], what: string): T {
  if (rows.length !== 1) throw new FrontierContractError(`expected exactly one ${what}, found ${rows.length}`);
  return rows[0]!;
}

export async function resolveLineage(sql: SqlExecutor, sourceSlug: string): Promise<FrontierLineage> {
  const row = one(
    (
      await sql.query(
        `select si.id as source_interface_id, si.provider_id,
                (select pg.id from reference.permission_grants pg
                  where pg.source_interface_id = si.id and pg.covers_collection and pg.covers_index_use
                  order by pg.effective_from desc limit 1) as permission_grant_id
           from reference.source_interfaces si
          where si.slug = $1 and si.production_access_state = 'production_approved'`,
        [sourceSlug],
      )
    ).rows,
    `production-approved source interface '${sourceSlug}'`,
  );
  if (row.permission_grant_id === null) {
    throw new FrontierContractError(`${sourceSlug} has no grant covering both collection and index use`);
  }
  return {
    sourceInterfaceId: String(row.source_interface_id),
    permissionGrantId: String(row.permission_grant_id),
    providerId: String(row.provider_id),
  };
}

/** The hash of the last bundle successfully ingested, or null. The idempotence check. */
export async function lastBundleHash(sql: SqlExecutor): Promise<string | null> {
  const { rows } = await sql.query(
    `select bundle_content_hash from pipeline.capability_retrievals
      where outcome = 'succeeded' order by retrieved_at desc limit 1`,
    [],
  );
  return rows[0] === undefined ? null : String(rows[0].bundle_content_hash);
}

export type RecordedRetrieval = { capabilityRetrievalId: string; sourceRetrievalId: string };

export async function recordRetrieval(
  sql: SqlExecutor,
  lineage: FrontierLineage,
  input: {
    bundleHash: string;
    byteLength: number;
    citation: string;
    license: string;
    retrievedAt: string;
    fileCount: number;
    rowCount: number;
  },
): Promise<RecordedRetrieval> {
  const source = one(
    (
      await sql.query(
        `insert into pipeline.source_retrievals (
           source_interface_id, idempotency_key, requested_at, completed_at, request_method,
           request_url, request_parameters, response_status, response_hash, enumeration_assessment,
           retrieval_purpose, permission_grant_id
         ) values ($1,$2,$3,$3,'GET',$4,'{}'::jsonb,200,$5,'complete','production',$6)
         returning id`,
        [
          lineage.sourceInterfaceId,
          `epoch-bundle-${input.bundleHash.slice(0, 16)}-${input.retrievedAt}`,
          input.retrievedAt,
          "https://epoch.ai/data/benchmark_data.zip",
          input.bundleHash,
          lineage.permissionGrantId,
        ],
      )
    ).rows,
    "the inserted source retrieval",
  );

  const capability = one(
    (
      await sql.query(
        `insert into pipeline.capability_retrievals (
           source_retrieval_id, source_interface_id, bundle_content_hash, bundle_byte_length,
           source_citation, source_license, retrieved_at, outcome, benchmark_file_count, row_count
         ) values ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9) returning id`,
        [
          String(source.id),
          lineage.sourceInterfaceId,
          input.bundleHash,
          input.byteLength,
          input.citation,
          input.license,
          input.retrievedAt,
          input.fileCount,
          input.rowCount,
        ],
      )
    ).rows,
    "the inserted capability retrieval",
  );

  return { capabilityRetrievalId: String(capability.id), sourceRetrievalId: String(source.id) };
}

/**
 * Record that a check ran, whatever it found.
 *
 * The one write an unchanged run makes. Without it, a healthy quiet week and a scheduler that
 * stopped are the same row count, and the product would go on rendering the last good chart
 * with nothing anywhere saying it had gone still.
 */
export async function recordCheckRun(
  sql: SqlExecutor,
  lineage: FrontierLineage,
  run: {
    ranAt: string;
    trigger: "scheduled" | "operator";
    outcome: "unchanged" | "ingested" | "failed";
    bundleHash: string | null;
    sourceChanged: boolean;
    capabilityRetrievalId: string | null;
    created: number | null;
    revised: number | null;
    detail: string | null;
  },
): Promise<void> {
  await sql.query(
    `insert into pipeline.capability_check_runs (
       source_interface_id, ran_at, trigger, outcome, bundle_content_hash, source_changed,
       capability_retrieval_id, observations_created, observations_revised, detail
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      lineage.sourceInterfaceId,
      run.ranAt,
      run.trigger,
      run.outcome,
      run.bundleHash,
      run.sourceChanged,
      run.capabilityRetrievalId,
      run.created,
      run.revised,
      run.detail,
    ],
  );
}

/** When the *schedule* last completed a run that did not fail. Null when it never has. */
export async function lastScheduledCheckAt(sql: SqlExecutor): Promise<string | null> {
  const { rows } = await sql.query(
    `select ran_at from pipeline.capability_check_runs
      where trigger = 'scheduled' and outcome <> 'failed'
      order by ran_at desc limit 1`,
    [],
  );
  return rows[0] === undefined ? null : new Date(String(rows[0].ran_at)).toISOString();
}

export type ObservationOutcome = { created: number; revised: number; unchanged: number };

/**
 * Apply one retrieval's observations.
 *
 * Per row: unchanged content confirms and writes nothing; changed content supersedes the live
 * row and inserts the replacement; an unseen identifier is created. Nothing is deleted and
 * nothing is updated in place, so the history of what was published stays readable.
 */
export async function applyObservations(
  sql: SqlExecutor,
  lineage: FrontierLineage,
  capabilityRetrievalId: string,
  citation: string,
  license: string,
  observations: readonly CapabilityObservation[],
): Promise<ObservationOutcome> {
  const outcome: ObservationOutcome = { created: 0, revised: 0, unchanged: 0 };

  const { rows: liveRows } = await sql.query(
    `select id, benchmark_slug, source_model_identifier, row_content_hash
       from pipeline.capability_observations where superseded_by_id is null`,
    [],
  );
  const live = new Map(
    liveRows.map((row) => [
      `${String(row.benchmark_slug)}|${String(row.source_model_identifier)}`,
      { id: String(row.id), hash: String(row.row_content_hash) },
    ]),
  );

  for (const observation of observations) {
    const key = `${observation.benchmarkSlug}|${observation.sourceModelIdentifier}`;
    const existing = live.get(key);
    if (existing !== undefined && existing.hash === observation.rowContentHash) {
      outcome.unchanged += 1;
      continue;
    }

    const newId = randomUUID();
    await sql.query("begin", []);
    try {
      if (existing !== undefined) {
        // Supersede first: one live row per benchmark and identifier is a partial unique
        // index, and the deferred self-reference lets the old row name its replacement
        // before that replacement exists.
        await sql.query(
          `update pipeline.capability_observations
              set superseded_by_id = $2, superseded_at = now(), supersession_reason = $3
            where id = $1`,
          [
            existing.id,
            newId,
            `source revised ${observation.benchmarkSlug}/${observation.sourceModelIdentifier}: row hash ${existing.hash.slice(0, 12)} became ${observation.rowContentHash.slice(0, 12)}`,
          ],
        );
      }
      await sql.query(
        `insert into pipeline.capability_observations (
           id, capability_retrieval_id, source_interface_id, benchmark_slug, source_benchmark_name,
           source_benchmark_file, source_model_identifier, source_configuration, source_organization,
           score, score_min, score_max, capability_as_of, source_citation, source_license, row_content_hash
         ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          newId,
          capabilityRetrievalId,
          lineage.sourceInterfaceId,
          observation.benchmarkSlug,
          observation.sourceBenchmarkName,
          observation.sourceBenchmarkFile,
          observation.sourceModelIdentifier,
          observation.sourceConfiguration,
          observation.sourceOrganization,
          observation.score,
          observation.scoreMin,
          observation.scoreMax,
          observation.capabilityAsOf,
          citation,
          license,
          observation.rowContentHash,
        ],
      );
      await sql.query("commit", []);
    } catch (error) {
      await sql.query("rollback", []);
      throw error;
    }

    if (existing === undefined) outcome.created += 1;
    else outcome.revised += 1;
  }

  return outcome;
}

/** Upsert one identity link. The evidence is rewritten with the link, never left stale. */
export async function upsertLink(
  sql: SqlExecutor,
  lineage: FrontierLineage,
  link: IdentityLink,
  linkedBy: string,
): Promise<void> {
  await sql.query(
    `insert into reference.capability_model_links
       (source_interface_id, source_model_identifier, model_id, source_configuration,
        link_state, evidence, linked_by, linked_at)
     select $1, $2,
            case when $5 = 'evidenced'
                 then (select m.id from reference.models m
                        join reference.providers p on p.id = m.provider_id
                       where m.provider_model_id = $3 and p.slug = $4)
                 else null end,
            $6, $5, $7, $8, now()
     on conflict (source_interface_id, source_model_identifier) do update
       set model_id = excluded.model_id,
           source_configuration = excluded.source_configuration,
           link_state = excluded.link_state,
           evidence = excluded.evidence,
           linked_by = excluded.linked_by,
           linked_at = now()`,
    [
      lineage.sourceInterfaceId,
      link.sourceModelIdentifier,
      link.providerModelId,
      link.providerSlug,
      link.state,
      link.sourceConfiguration,
      link.evidence,
      linkedBy,
    ],
  );
}

/** Upsert one price selection. The trigger refuses anything that does not resolve to one pair. */
export async function upsertPriceSelection(sql: SqlExecutor, selection: PriceSelection): Promise<void> {
  await sql.query(
    `insert into reference.model_price_selections
       (model_id, service_tier, context_tier, region, rationale, effective_from)
     select m.id, $3, $4, $5, $6, current_date
       from reference.models m
       join reference.providers p on p.id = m.provider_id
      where m.provider_model_id = $2 and p.slug = $1
     on conflict (model_id) do update
       set service_tier = excluded.service_tier,
           context_tier = excluded.context_tier,
           region = excluded.region,
           rationale = excluded.rationale`,
    [
      selection.providerSlug,
      selection.providerModelId,
      selection.serviceTier,
      selection.contextTier,
      selection.region,
      selection.rationale,
    ],
  );
}
