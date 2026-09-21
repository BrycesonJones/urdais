/**
 * Persisting a calculation run.
 *
 * The idempotence rule lives here and is simple: a run is identified by the methodology version
 * and a digest of the canonical inputs it read. Recomputing unchanged inputs under an unchanged
 * methodology resolves to the run already recorded and writes nothing — not a second copy of the
 * same numbers, and not a revision of them.
 *
 * Results are append-only. A metric that changes because its inputs changed produces a new run
 * with its own results; the earlier run keeps its numbers and its snapshot set, so a figure that
 * was published last month can still be reconstructed exactly.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { assertMethodologyDocument, METHODOLOGY_DOCUMENT_PATH, METHODOLOGY_SLUG, METHODOLOGY_VERSION }
  from "@/lib/interconnection-queue/analytics/methodology";
import type { AnalyticsRun } from "@/lib/interconnection-queue/analytics/calculate";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";

export const ANALYTICS_WRITE_BATCH_SIZE = 500;

export type AnalyticsWriteResult = {
  runId: string;
  run: "created" | "existing";
  methodologyVersion: string;
  inputDigest: string;
  resultsInserted: number;
  liveResults: number;
  blockedResults: number;
  deferredResults: number;
  statements: number;
};

function chunk<T>(items: readonly T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function placeholders(rows: number, columns: number): string {
  const groups: string[] = [];
  for (let row = 0; row < rows; row += 1) {
    const slots: string[] = [];
    for (let column = 0; column < columns; column += 1) slots.push(`$${row * columns + column + 1}`);
    groups.push(`(${slots.join(",")})`);
  }
  return groups.join(",");
}

/**
 * The approved methodology version, and proof the document behind it has not moved.
 *
 * Reading the file here rather than trusting a constant is the whole guard: an approved version
 * and its document are one thing, and a calculation running against a changed specification is a
 * calculation nobody approved.
 */
export async function resolveMethodologyVersion(
  sql: CapacitySqlExecutor, options: { repoRoot?: string } = {},
): Promise<{ id: string; version: string; contentHash: string }> {
  const root = options.repoRoot ?? process.cwd();
  assertMethodologyDocument(readFileSync(resolve(root, METHODOLOGY_DOCUMENT_PATH)));

  const result = await sql.query(
    `select mv.id, mv.version, mv.content_hash
       from reference.methodology_versions mv
       join reference.methodologies m on m.id = mv.methodology_id
      where m.slug = $1 and mv.version = $2 and mv.status = 'approved'`,
    [METHODOLOGY_SLUG, METHODOLOGY_VERSION],
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new Error(`${METHODOLOGY_SLUG} ${METHODOLOGY_VERSION} is not an approved methodology version`);
  }
  return { id: String(row.id), version: String(row.version), contentHash: String(row.content_hash) };
}

export async function persistAnalyticsRun(
  sql: CapacitySqlExecutor, run: AnalyticsRun, options: { batchSize?: number; repoRoot?: string } = {},
): Promise<AnalyticsWriteResult> {
  const batchSize = options.batchSize ?? ANALYTICS_WRITE_BATCH_SIZE;
  let statements = 0;
  const count = () => { statements += 1; };

  const methodology = await resolveMethodologyVersion(sql,
    options.repoRoot === undefined ? {} : { repoRoot: options.repoRoot });
  count();

  const result: AnalyticsWriteResult = {
    runId: "", run: "existing", methodologyVersion: methodology.version,
    inputDigest: run.inputDigest, resultsInserted: 0,
    liveResults: run.results.filter((item) => item.status === "live").length,
    blockedResults: run.results.filter((item) => item.status === "rights_blocked").length,
    deferredResults: run.results.filter((item) => item.status === "methodology_deferred").length,
    statements: 0,
  };

  count();
  await sql.query("begin", []);
  try {
    count();
    const inserted = await sql.query(
      `insert into pipeline.interconnection_analytics_runs
         (methodology_version_id, calculated_at, input_digest, snapshot_ids,
          request_count, observation_count, run_status)
       values ($1,$2,$3,$4::uuid[],$5,$6,'validated')
       on conflict (methodology_version_id, input_digest) do nothing
       returning id`,
      [methodology.id, run.calculatedAt, run.inputDigest, run.snapshotIds,
        run.requestCount, run.observationCount],
    );

    if (inserted.rows[0] === undefined) {
      // The same methodology over the same inputs. The answer is already recorded.
      count();
      const existing = await sql.query(
        `select id from pipeline.interconnection_analytics_runs
          where methodology_version_id = $1 and input_digest = $2`,
        [methodology.id, run.inputDigest],
      );
      if (!existing.rows[0]) throw new Error("the run was neither inserted nor found");
      result.runId = String(existing.rows[0]!.id);
      count();
      await sql.query("commit", []);
      result.statements = statements;
      return result;
    }

    result.runId = String(inserted.rows[0]!.id);
    result.run = "created";

    const areas = await sql.query(`select id, slug from reference.grid_areas`, []);
    count();
    const areaIds = new Map<string, string>();
    for (const area of areas.rows) areaIds.set(String(area.slug), String(area.id));

    const rows = run.results.map((item) => {
      const areaId = areaIds.get(item.marketSlug);
      if (areaId === undefined) throw new Error(`grid area ${item.marketSlug} is not registered`);
      return [
        result.runId, item.metricCode, areaId, item.dimensionKind, item.dimensionValue,
        item.status, item.value === null ? null : String(item.value), item.unit,
        item.nativeField, item.basis, item.sampleSize, item.populationSize, item.excludedCount,
        JSON.stringify(item.coverage), item.publicationState, item.rightsReason,
      ];
    });

    for (const batch of chunk(rows, batchSize)) {
      count();
      const written = await sql.query(
        `insert into pipeline.interconnection_metric_results
           (run_id, metric_code, grid_area_id, dimension_kind, dimension_value, status, value,
            unit, native_field, basis, sample_size, population_size, excluded_count, coverage,
            publication_state, rights_reason)
         select v.run_id::uuid, v.metric_code, v.grid_area_id::uuid, v.dimension_kind,
                v.dimension_value, v.status, v.value::numeric, v.unit, v.native_field, v.basis,
                v.sample_size::integer, v.population_size::integer, v.excluded_count::integer,
                v.coverage::jsonb, v.publication_state, v.rights_reason
           from (values ${placeholders(batch.length, 16)}) as v(run_id, metric_code, grid_area_id,
                 dimension_kind, dimension_value, status, value, unit, native_field, basis,
                 sample_size, population_size, excluded_count, coverage, publication_state, rights_reason)
         returning id`,
        batch.flat(),
      );
      result.resultsInserted += written.rows.length;
    }

    count();
    await sql.query("commit", []);
    result.statements = statements;
    return result;
  } catch (error) {
    await sql.query("rollback", []);
    throw error;
  }
}
