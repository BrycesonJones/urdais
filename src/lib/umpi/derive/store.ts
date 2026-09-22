/**
 * Reading current observations, and writing bases and publications.
 *
 * Everything written here is append-only and superseded rather than edited, following the same
 * rules the ingestion store follows. A recalculation over unchanged inputs writes nothing.
 */

import { createHash, randomUUID } from "node:crypto";

import { UmpiPersistenceError } from "../ingest/errors";
import type { UmpiSqlExecutor } from "../ingest/store";
import type { UmpiSeriesCode } from "../types";
import type { CurrentObservation, DerivedPoint, StoredBase } from "./types";
import { UMPI_BASE_LABEL, UMPI_BASE_YEAR, UMPI_CALCULATION_VERSION } from "./types";

const text = (value: unknown): string => String(value);
const num = (value: unknown): number | null => (value === null || value === undefined ? null : Number(value));

export type SeriesContext = {
  seriesId: string;
  seriesCode: UmpiSeriesCode;
  sourceSeriesId: string;
  methodologyVersionId: string;
  levelIsUrdaisDerived: boolean;
  mixWarningRequired: boolean;
  attributionText: string;
  baseLabel: string;
  /** Approved and in force today. Publication state follows it; nothing else decides. */
  methodologyApproved: boolean;
  methodologyVersion: string;
};

export async function loadSeriesContext(sql: UmpiSqlExecutor, seriesCode: UmpiSeriesCode): Promise<SeriesContext> {
  const { rows } = await sql.query(
    `select s.id as series_id, s.methodology_version_id, s.level_is_urdais_derived,
            s.mix_warning_required, s.attribution_text, s.base_label, ss.id as source_series_id,
            mv.version as methodology_version,
            (mv.status = 'approved' and mv.effective_from is not null and mv.effective_from <= current_date
             and (mv.effective_to is null or mv.effective_to > current_date)) as methodology_approved
       from reference.umpi_series s
       join reference.umpi_source_series ss on ss.series_id = s.id and ss.is_active
       join reference.methodology_versions mv on mv.id = s.methodology_version_id
      where s.series_code = $1`,
    [seriesCode],
  );
  if (rows.length !== 1) {
    throw new UmpiPersistenceError(`${seriesCode} resolves to ${rows.length} active source identities; exactly one is required`);
  }
  const row = rows[0]!;
  return {
    seriesId: text(row.series_id),
    seriesCode,
    sourceSeriesId: text(row.source_series_id),
    methodologyVersionId: text(row.methodology_version_id),
    levelIsUrdaisDerived: Boolean(row.level_is_urdais_derived),
    mixWarningRequired: Boolean(row.mix_warning_required),
    attributionText: text(row.attribution_text),
    baseLabel: text(row.base_label),
    methodologyApproved: Boolean(row.methodology_approved),
    methodologyVersion: text(row.methodology_version),
  };
}

/** Current vintages only, from the one view that defines "latest". */
export async function loadCurrentObservations(sql: UmpiSqlExecutor, seriesId: string): Promise<CurrentObservation[]> {
  const { rows } = await sql.query(
    `select o.id, o.series_id, o.source_series_id, to_char(o.reference_month, 'YYYY-MM') as reference_month,
            o.vintage_ordinal, o.methodology_version_id, o.index_level, o.index_base_label,
            o.export_value_usd, o.export_weight_kg
       from pipeline.umpi_current_observations o
      where o.series_id = $1
      order by o.reference_month`,
    [seriesId],
  );
  return rows.map((row) => ({
    observationId: text(row.id),
    seriesId: text(row.series_id),
    sourceSeriesId: text(row.source_series_id),
    referenceMonth: text(row.reference_month),
    vintageOrdinal: Number(row.vintage_ordinal),
    methodologyVersionId: text(row.methodology_version_id),
    indexLevel: num(row.index_level),
    indexBaseLabel: row.index_base_label === null ? null : text(row.index_base_label),
    exportValueUsd: num(row.export_value_usd),
    exportWeightKg: num(row.export_weight_kg),
  }));
}

/** The digest of the exact rows a base was built from. A revised month changes it. */
export function baseInputsDigest(months: readonly CurrentObservation[]): string {
  const canonical = JSON.stringify(
    [...months]
      .sort((a, b) => (a.referenceMonth < b.referenceMonth ? -1 : 1))
      .map((m) => [m.referenceMonth, m.observationId, m.vintageOrdinal, m.exportValueUsd, m.exportWeightKg]),
  );
  return createHash("sha256").update(canonical).digest("hex");
}

/**
 * The live base for a series, if one exists.
 *
 * "Live" means un-superseded. A base built from revised inputs supersedes its predecessor, and
 * the predecessor stays readable so the values published under it remain explainable.
 */
export async function loadLiveBase(sql: UmpiSqlExecutor, seriesId: string): Promise<StoredBase | null> {
  const { rows } = await sql.query(
    `select id, base_label, base_value_usd, base_weight_kg, base_unit_value, month_count, inputs_digest
       from pipeline.umpi_index_bases
      where series_id = $1 and superseded_by_id is null
      order by computed_at desc limit 1`,
    [seriesId],
  );
  if (rows.length === 0) return null;
  const row = rows[0]!;
  return {
    indexBaseId: text(row.id),
    baseLabel: text(row.base_label),
    baseValueUsd: Number(row.base_value_usd),
    baseWeightKg: Number(row.base_weight_kg),
    baseUnitValue: Number(row.base_unit_value),
    monthCount: Number(row.month_count),
    inputsDigest: text(row.inputs_digest),
  };
}

/**
 * Write a base, or return the existing one when the inputs are unchanged.
 *
 * A base with the same digest is the same base; writing a second one would create two answers to
 * the question "what is 100". When the digest differs the new base supersedes the live one, and
 * every Series B publication that depended on the old digest will be recomputed, because the
 * base digest is part of each publication's own digest.
 */
export async function upsertBase(
  sql: UmpiSqlExecutor,
  context: SeriesContext,
  months: readonly CurrentObservation[],
  computed: { baseValueUsd: number; baseWeightKg: number; baseUnitValue: number; monthCount: number },
): Promise<{ base: StoredBase; created: boolean }> {
  const digest = baseInputsDigest(months);

  const existing = await sql.query(
    `select id, base_label, base_value_usd, base_weight_kg, base_unit_value, month_count, inputs_digest
       from pipeline.umpi_index_bases
      where series_id = $1 and base_label = $2 and inputs_digest = $3`,
    [context.seriesId, UMPI_BASE_LABEL, digest],
  );
  if (existing.rows.length > 0) {
    const row = existing.rows[0]!;
    return {
      created: false,
      base: {
        indexBaseId: text(row.id),
        baseLabel: text(row.base_label),
        baseValueUsd: Number(row.base_value_usd),
        baseWeightKg: Number(row.base_weight_kg),
        baseUnitValue: Number(row.base_unit_value),
        monthCount: Number(row.month_count),
        inputsDigest: text(row.inputs_digest),
      },
    };
  }

  const live = await loadLiveBase(sql, context.seriesId);
  const inserted = await sql.query(
    `insert into pipeline.umpi_index_bases
       (series_id, methodology_version_id, base_label, base_from_month, base_to_month,
        base_value_usd, base_weight_kg, base_unit_value, month_count, inputs_digest, computed_at)
     values ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10, now())
     returning id`,
    [
      context.seriesId,
      context.methodologyVersionId,
      UMPI_BASE_LABEL,
      `${UMPI_BASE_YEAR}-01-01`,
      `${UMPI_BASE_YEAR}-12-01`,
      computed.baseValueUsd,
      computed.baseWeightKg,
      computed.baseUnitValue,
      computed.monthCount,
      digest,
    ],
  );
  const indexBaseId = text(inserted.rows[0]!.id);

  for (const month of months) {
    await sql.query(
      `insert into pipeline.umpi_index_base_inputs
         (index_base_id, observation_id, reference_month, export_value_usd, export_weight_kg)
       values ($1, $2, $3::date, $4, $5)`,
      [indexBaseId, month.observationId, `${month.referenceMonth}-01`, month.exportValueUsd, month.exportWeightKg],
    );
  }

  if (live !== null) {
    // Supersede rather than replace: values already published under the old base stay
    // explainable, which is the whole point of keeping it.
    await sql.query(
      `update pipeline.umpi_index_bases
          set superseded_by_id = $1, superseded_at = now(),
              supersession_reason = 'recomputed from revised base-year observations'
        where id = $2`,
      [indexBaseId, live.indexBaseId],
    );
  }

  // Read back what the database stored rather than returning the in-memory figures.
  // `base_unit_value` is numeric(24,10), so the stored value is a rounding of the computed
  // double — and a derivation that used the computed one on the first run and the stored one on
  // every run after would produce two different levels for identical inputs. The stored value is
  // the one every later run will see, so it is the one that must be used from the start.
  const persisted = await sql.query(
    `select base_value_usd, base_weight_kg, base_unit_value, month_count
       from pipeline.umpi_index_bases where id = $1`,
    [indexBaseId],
  );
  const stored = persisted.rows[0]!;

  return {
    created: true,
    base: {
      indexBaseId,
      baseLabel: UMPI_BASE_LABEL,
      baseValueUsd: Number(stored.base_value_usd),
      baseWeightKg: Number(stored.base_weight_kg),
      baseUnitValue: Number(stored.base_unit_value),
      monthCount: Number(stored.month_count),
      inputsDigest: digest,
    },
  };
}

export type PublishResult = { written: number; unchanged: number; superseded: number };

/**
 * Write derived points, superseding any live publication whose inputs have changed.
 *
 * Three outcomes per month, and the digest decides which: an identical digest is already
 * published and nothing happens; a different digest supersedes the live row and inserts the new
 * one; no live row at all is a plain insert.
 */
export async function publishPoints(
  sql: UmpiSqlExecutor,
  context: SeriesContext,
  points: readonly DerivedPoint[],
  mixWarning: string | null,
): Promise<PublishResult> {
  const result: PublishResult = { written: 0, unchanged: 0, superseded: 0 };

  try {
    await sql.query("begin", []);
    for (const point of points) {
      const referenceMonth = `${point.referenceMonth}-01`;

      const live = await sql.query(
        `select id, inputs_digest from pipeline.umpi_publications
          where series_id = $1 and reference_month = $2::date and superseded_by_id is null`,
        [context.seriesId, referenceMonth],
      );
      const liveRow = live.rows[0] ?? null;
      if (liveRow !== null && text(liveRow.inputs_digest) === point.inputsDigest) {
        result.unchanged += 1;
        continue;
      }

      // One live publication per series and month is enforced by a partial unique index, which
      // cannot be deferred. So the predecessor is retired *before* the successor is inserted —
      // the foreign key between them is deferrable, so pointing at a row that does not exist yet
      // is legal inside the transaction, but two live rows for one month never are.
      const publicationId = randomUUID();
      if (liveRow !== null) {
        await sql.query(
          `update pipeline.umpi_publications
              set superseded_by_id = $1, superseded_at = now(),
                  supersession_reason = 'recalculated from revised inputs'
            where id = $2`,
          [publicationId, text(liveRow.id)],
        );
        result.superseded += 1;
      }

      await sql.query(
        `insert into pipeline.umpi_publications
           (id, series_id, methodology_version_id, observation_id, index_base_id, reference_month,
            published_level, base_label, mom_change, mom_withheld_reason, unit_value_usd_per_kg,
            source_vintage_ordinal, vintage_published_at, attribution_text, mix_warning,
            calculation_version, inputs_digest, previous_observation_id, publication_state)
         values ($1, $2, $3, $4, $5, $6::date, $7, $8, $9, $10, $11, $12, now(), $13, $14, $15, $16, $17, $18)`,
        [
          publicationId,
          context.seriesId,
          point.methodologyVersionId,
          point.observationId,
          point.indexBaseId,
          referenceMonth,
          point.publishedLevel,
          point.baseLabel,
          point.momChange,
          point.momWithheldReason,
          point.unitValueUsdPerKg,
          point.sourceVintageOrdinal,
          context.attributionText,
          mixWarning,
          UMPI_CALCULATION_VERSION,
          point.inputsDigest,
          point.previousObservationId,
          // A value is publishable only under an approved, effective methodology. Under a draft
          // it is still calculated and still stored — it is simply not public.
          context.methodologyApproved ? "published" : "internal_only",
        ],
      );

      result.written += 1;
    }
    await sql.query("commit", []);
  } catch (error) {
    await sql.query("rollback", []);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    throw error instanceof UmpiPersistenceError
      ? error
      : new UmpiPersistenceError(`the UMPI derivation write path failed for ${context.seriesCode}: ${detail}`, { cause: error });
  }

  return result;
}
