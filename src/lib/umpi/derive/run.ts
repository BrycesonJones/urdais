/**
 * Orchestration: read current observations, build the base where one is needed, derive the
 * points, write them.
 *
 * Series A needs no base and publishes as soon as it has observations. Series B publishes
 * nothing at all until the 2020 base exists, and says so rather than substituting anything.
 */

import { UMPI_EXPORT_UV_MIX_WARNING, type UmpiSeriesCode } from "../types";
import type { UmpiSqlExecutor } from "../ingest/store";
import { buildBase } from "./base";
import { derivePoints } from "./points";
import {
  loadCurrentObservations,
  loadLiveBase,
  loadSeriesContext,
  publishPoints,
  upsertBase,
} from "./store";
import type { DerivationOutcome, StoredBase } from "./types";

export async function deriveSeries(sql: UmpiSqlExecutor, seriesCode: UmpiSeriesCode): Promise<DerivationOutcome> {
  try {
    const context = await loadSeriesContext(sql, seriesCode);
    const observations = await loadCurrentObservations(sql, context.seriesId);

    if (observations.length === 0) {
      return { status: "blocked", seriesCode, reason: "no_observations", detail: "no current observations are stored" };
    }

    let base: StoredBase | null = null;
    if (context.levelIsUrdaisDerived) {
      const built = buildBase(observations);
      if (built.state === "blocked") {
        // The intended failure. No Series B level exists until the base does, and nothing is
        // substituted, estimated or carried forward in the meantime.
        return { status: "blocked", seriesCode, reason: built.reason, detail: built.detail };
      }
      const stored = await upsertBase(sql, context, built.months, built.base);
      base = stored.base;
    } else {
      // A series that republishes an agency level must not acquire a Urdais base.
      base = null;
      const stray = await loadLiveBase(sql, context.seriesId);
      if (stray !== null) {
        return {
          status: "blocked",
          seriesCode,
          reason: "unexpected_base",
          detail: `${seriesCode} republishes the agency level and must not have a rebasing base`,
        };
      }
    }

    const points = derivePoints({
      seriesCode,
      observations,
      base,
      baseLabel: context.baseLabel,
      indexBaseId: base?.indexBaseId ?? null,
    });

    const written = await publishPoints(
      sql,
      context,
      points,
      context.mixWarningRequired ? UMPI_EXPORT_UV_MIX_WARNING : null,
    );

    return { status: "derived", seriesCode, points: points.length, base, ...written };
  } catch (error) {
    return {
      status: "failed",
      seriesCode,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

export async function deriveAll(sql: UmpiSqlExecutor): Promise<DerivationOutcome[]> {
  const outcomes: DerivationOutcome[] = [];
  for (const series of ["UMPI-KR-DRAM-PPI", "UMPI-KR-DRAM-EXPORT-UV"] as const) {
    outcomes.push(await deriveSeries(sql, series));
  }
  return outcomes;
}
