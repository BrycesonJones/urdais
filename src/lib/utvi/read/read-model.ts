/**
 * The public UTVI read model.
 *
 * What this serves is a derived Urdais statistic, not a copy of the source. No permaslug, no
 * per-model row, no residual breakdown by lab reaches this surface — those are the machinery
 * behind the value and re-serving them would turn a licensed derivative into a mirror of
 * somebody else's API, which is a different product decision and not one Phase 1B takes.
 *
 * Three things the surface must never do, each of which the shape here prevents:
 *
 *   present a missing comparison as zero — every change is `number | null`;
 *
 *   present the value without the universe it observed — `universe` is required, and it is
 *   read from the frozen publication rather than from today's configuration;
 *
 *   present the value without the attribution the licence requires — `attribution` is
 *   required, and a value whose citation cannot be rendered does not serve at all.
 */

import { isRequiredCitation, type UtviAttribution } from "@/lib/utvi/attribution";
import { changesForPeriods, type UtviChangePeriod } from "@/lib/utvi/calculate";
import type { SettlementState } from "@/lib/utvi/types";

export type UtviSeriesPoint = {
  date: string;
  /** A decimal string: a token count exceeds what JSON numbers carry exactly. */
  tokensPerDay: string;
  settlementState: SettlementState;
  revisionNumber: number;
};

export type UtviSnapshotView = {
  symbol: string;
  name: string;
  unit: string;
  /** The published level, as a decimal string. */
  tokensPerDay: string;
  asOfDate: string;
  settlementState: SettlementState;
  revisionNumber: number;
  changePercent: Record<UtviChangePeriod, number | null>;
  methodologyVersion: string;
  universe: string;
  attribution: UtviAttribution;
  publishedAt: string;
};

export type UtviReadModel = {
  snapshot: UtviSnapshotView | null;
  series: UtviSeriesPoint[];
  /** Why there is no snapshot, when there is none. Never an empty object with no reason. */
  unavailableReason: string | null;
};

/** One row of the publication table, as the read layer receives it. */
export type PublicationRow = {
  calculationDate: string;
  valueTokensPerDay: string;
  settlementState: SettlementState;
  revisionNumber: number;
  methodologyVersion: string;
  universeDescriptor: string;
  sourceAttribution: string;
  publishedAt: string;
  sourceAsOf: string;
};

/**
 * Build the read model from the live publication history, newest last.
 *
 * Percentage changes are computed here rather than stored, so that adding a period is a read
 * concern and a stored point never disagrees with its own series.
 */
export function buildReadModel(rows: readonly PublicationRow[]): UtviReadModel {
  if (rows.length === 0) {
    return {
      snapshot: null,
      series: [],
      unavailableReason: "no UTVI value has been published",
    };
  }

  const ordered = [...rows].sort((a, b) => a.calculationDate.localeCompare(b.calculationDate));
  const series: UtviSeriesPoint[] = ordered.map((row) => ({
    date: row.calculationDate,
    tokensPerDay: row.valueTokensPerDay,
    settlementState: row.settlementState,
    revisionNumber: row.revisionNumber,
  }));

  const latest = ordered[ordered.length - 1]!;

  // A value whose attribution is not the required citation does not serve. The licence's one
  // condition is attribution, and a paraphrase does not satisfy it.
  if (!isRequiredCitation(latest.sourceAttribution)) {
    return {
      snapshot: null,
      series,
      unavailableReason: "the published value does not carry the source's required citation",
    };
  }

  const history = new Map(ordered.map((row) => [row.calculationDate, BigInt(row.valueTokensPerDay)]));

  return {
    snapshot: {
      symbol: "UTVI",
      name: "Observed Token Volume Index",
      unit: "tokens/day",
      tokensPerDay: latest.valueTokensPerDay,
      asOfDate: latest.calculationDate,
      settlementState: latest.settlementState,
      revisionNumber: latest.revisionNumber,
      changePercent: changesForPeriods(
        latest.calculationDate,
        BigInt(latest.valueTokensPerDay),
        history,
      ),
      methodologyVersion: latest.methodologyVersion,
      universe: latest.universeDescriptor,
      attribution: {
        sourceName: "OpenRouter",
        sourceUrl: "https://openrouter.ai/rankings",
        licenseName: "Creative Commons Attribution 4.0 International (CC BY 4.0)",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        sourceAsOf: latest.sourceAsOf,
        citation: latest.sourceAttribution,
      },
      publishedAt: latest.publishedAt,
    },
    series,
    unavailableReason: null,
  };
}

/**
 * Validate what is about to be served.
 *
 * The same discipline the token surface applies: a response that fails its own contract is a
 * 500 rather than a page showing a number nobody checked. Returns the reasons it failed, so a
 * caller can log which invariant broke.
 */
export function validatePublicUtvi(candidate: unknown): string[] {
  const reasons: string[] = [];
  if (typeof candidate !== "object" || candidate === null) return ["response is not an object"];
  const body = candidate as Record<string, unknown>;

  if (!Array.isArray(body.series)) reasons.push("series is not an array");
  const snapshot = body.snapshot;
  if (snapshot === null) {
    if (typeof body.unavailableReason !== "string" || body.unavailableReason.trim() === "") {
      reasons.push("an absent snapshot must say why");
    }
    return reasons;
  }
  if (typeof snapshot !== "object") return [...reasons, "snapshot is not an object"];
  const s = snapshot as Record<string, unknown>;

  if (typeof s.tokensPerDay !== "string" || !/^\d+$/.test(s.tokensPerDay)) {
    reasons.push("tokensPerDay must be a decimal integer string");
  }
  if (s.unit !== "tokens/day") reasons.push("unit must be tokens/day");
  if (typeof s.universe !== "string" || s.universe.trim() === "") {
    reasons.push("the covered universe must be published with the value");
  }
  if (typeof s.methodologyVersion !== "string" || s.methodologyVersion.trim() === "") {
    reasons.push("methodologyVersion is required");
  }

  const attribution = s.attribution as Record<string, unknown> | undefined;
  if (typeof attribution !== "object" || attribution === null) {
    reasons.push("attribution is required");
  } else {
    for (const field of ["sourceName", "sourceUrl", "licenseName", "licenseUrl", "sourceAsOf", "citation"] as const) {
      if (typeof attribution[field] !== "string" || (attribution[field] as string).trim() === "") {
        reasons.push(`attribution.${field} is required`);
      }
    }
    if (typeof attribution.citation === "string" && !isRequiredCitation(attribution.citation)) {
      reasons.push("attribution.citation is not the source's required citation");
    }
  }

  const changes = s.changePercent as Record<string, unknown> | undefined;
  if (typeof changes !== "object" || changes === null) {
    reasons.push("changePercent is required");
  } else {
    for (const [period, value] of Object.entries(changes)) {
      // The rule that matters: an unavailable comparison is null, never zero.
      if (value !== null && typeof value !== "number") {
        reasons.push(`changePercent.${period} must be a number or null`);
      }
      if (typeof value === "number" && !Number.isFinite(value)) {
        reasons.push(`changePercent.${period} is not finite`);
      }
    }
  }

  return reasons;
}
