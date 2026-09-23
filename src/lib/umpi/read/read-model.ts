/**
 * The public UMPI read model.
 *
 * What it serves is two independent monthly index series and the metadata a client needs to
 * describe them honestly. What it does not serve is everything that made them: observation and
 * retrieval identifiers, database keys, provenance digests, rejected rows, superseded
 * calculations, and the internal rights-review state. Those are the machinery behind the value,
 * and re-serving them would turn a published index into a mirror of an internal pipeline.
 *
 * **There is no composite.** The family holds two series; neither is a component of the other and
 * no headline number is derived from both. A price index and a unit-value index are different
 * kinds of measurement, and averaging them would produce a figure with no referent.
 */

import { UMPI_EXPORT_UV_MIX_WARNING, type UmpiSeriesCode } from "../types";
import type { UmpiFreshnessState } from "@/lib/umpi/ops/freshness";
import type { UmpiSeriesFreshness } from "@/lib/umpi/ops/read";

/** A published monthly point. `change` is month-over-month, or null where it was withheld. */
export type UmpiPoint = {
  /** `YYYY-MM`. The month the value describes, never the day it was read. */
  referenceMonth: string;
  level: number;
  /** Month-over-month, as a fraction. Null when withheld; never zero as a filler. */
  change: number | null;
  /** Why the change is absent, for a client that wants to say so rather than show a blank. */
  changeWithheldReason: string | null;
  /** Series B only: the trade unit value the index was rebased from. */
  tradeUnitValueUsdPerKg: number | null;
};

export type UmpiAttribution = {
  agency: string;
  /** The agency's own name for the dataset. */
  dataset: string;
  /** The identifiers a reader can use to find the same numbers at the source. */
  sourceIdentity: string;
  /** Attribution text the agency's terms require, verbatim. */
  notice: string;
};

export type UmpiSeriesView = {
  seriesCode: UmpiSeriesCode;
  name: string;
  description: string;
  /**
   * `official_price_index` is produced by a statistical agency under its own method.
   * `derived_unit_value_index` is value over quantity and moves on composition as well as price.
   */
  kind: "official_price_index" | "derived_unit_value_index";
  unit: "index_points";
  base: string;
  frequency: "monthly";
  changeLabel: "MoM";
  methodologyVersion: string;
  methodologyEffectiveFrom: string;
  methodologyPath: string;
  attribution: UmpiAttribution;
  /**
   * The semantic caveat that must travel with the series. Present on the unit-value index and
   * null on the price index, where it would be false.
   */
  semanticWarning: string | null;
  /** The most recent published month, or null where the series has no published point. */
  latest: UmpiPoint | null;
  /** When Urdais last published a point for this series. Not a claim about the data's recency. */
  lastPublishedAt: string | null;
  points: UmpiPoint[];
  unavailableReason: string | null;
  /**
   * How current this series is, or null where the model was built without operational evidence.
   *
   * Carried on the series rather than only on the family because the two series are independent:
   * the Bank of Korea missing a release says nothing about Korea Customs, and a single family
   * verdict would let one series' staleness hide behind the other's health.
   */
  freshness: UmpiSeriesFreshness | null;
};

export type UmpiReadModel = {
  family: {
    code: "UMPI";
    name: string;
    description: string;
    /** Stated in the payload so a client cannot infer a headline that does not exist. */
    hasCompositeLevel: false;
  };
  series: UmpiSeriesView[];
  unavailableReason: string | null;
  /**
   * The pessimistic summary of the two series' freshness, never a replacement for them. Null
   * where the model was built without operational evidence.
   */
  freshness: UmpiFreshnessState | null;
};

/** One publishable row, as the loader reads it. Internal identifiers never reach this shape. */
export type PublicationRow = {
  seriesCode: UmpiSeriesCode;
  referenceMonth: string;
  level: number;
  change: number | null;
  changeWithheldReason: string | null;
  tradeUnitValueUsdPerKg: number | null;
  publishedAt: string;
  methodologyVersion: string;
  methodologyEffectiveFrom: string;
  base: string;
  attributionNotice: string;
};

const SERIES_DESCRIPTORS: Record<
  UmpiSeriesCode,
  Omit<UmpiSeriesView, "methodologyVersion" | "methodologyEffectiveFrom" | "base" | "latest" | "points" | "lastPublishedAt" | "unavailableReason" | "attribution" | "freshness"> & {
    attribution: Omit<UmpiAttribution, "notice">;
  }
> = {
  "UMPI-KR-DRAM-PPI": {
    seriesCode: "UMPI-KR-DRAM-PPI",
    name: "UMPI-KR DRAM PPI",
    description:
      "The Bank of Korea's official producer price index for DRAM, published as a cited agency series. Urdais calculates only the month-over-month change.",
    kind: "official_price_index",
    unit: "index_points",
    frequency: "monthly",
    changeLabel: "MoM",
    methodologyPath: "/docs/methodology/umpi-kr-dram",
    semanticWarning: null,
    attribution: {
      agency: "Bank of Korea",
      dataset: "Economic Statistics System (ECOS), Producer Price Index by Item",
      sourceIdentity: "404Y016 / 30911201AA / M — DRAM, 2020=100",
    },
  },
  "UMPI-KR-DRAM-EXPORT-UV": {
    seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
    name: "UMPI-KR DRAM Export Unit-Value Index",
    description:
      "Korea's monthly DRAM-chip export value divided by export weight, rebased to the 2020 calendar-year aggregate. A trade unit value, calculated by Urdais from official customs figures.",
    kind: "derived_unit_value_index",
    unit: "index_points",
    frequency: "monthly",
    changeLabel: "MoM",
    methodologyPath: "/docs/methodology/umpi-kr-dram",
    semanticWarning: UMPI_EXPORT_UV_MIX_WARNING,
    attribution: {
      agency: "Korea Customs Service",
      dataset: "수출입무역통계 (trade statistics)",
      sourceIdentity: "HSK 8542321010 — DRAM, Korea-wide monthly exports",
    },
  },
};

export const UMPI_FAMILY = {
  code: "UMPI" as const,
  name: "Urdais Memory Price Index",
  description:
    "Two independent monthly DRAM index series built from Korean official statistics. They measure different things and are never combined.",
  hasCompositeLevel: false as const,
};

function pointOf(row: PublicationRow): UmpiPoint {
  return {
    referenceMonth: row.referenceMonth,
    level: row.level,
    change: row.change,
    changeWithheldReason: row.changeWithheldReason,
    tradeUnitValueUsdPerKg: row.tradeUnitValueUsdPerKg,
  };
}

/**
 * Build the public model from publishable rows.
 *
 * A series with no rows is present and empty with a stated reason, rather than absent: "this
 * series has published nothing yet" and "this series does not exist" are different answers.
 */
export function buildUmpiReadModel(rows: readonly PublicationRow[]): UmpiReadModel {
  const series = (Object.keys(SERIES_DESCRIPTORS) as UmpiSeriesCode[]).map((code) => {
    const descriptor = SERIES_DESCRIPTORS[code];
    const own = rows
      .filter((row) => row.seriesCode === code)
      .slice()
      .sort((a, b) => (a.referenceMonth < b.referenceMonth ? -1 : a.referenceMonth > b.referenceMonth ? 1 : 0));

    if (own.length === 0) {
      return {
        ...descriptor,
        attribution: { ...descriptor.attribution, notice: "" },
        methodologyVersion: "",
        methodologyEffectiveFrom: "",
        base: "",
        latest: null,
        lastPublishedAt: null,
        points: [],
        unavailableReason: "no published observations",
        // Attached by the loader from the operational record; a pure build has no evidence.
        freshness: null,
      } satisfies UmpiSeriesView;
    }

    const newest = own[own.length - 1]!;
    return {
      ...descriptor,
      attribution: { ...descriptor.attribution, notice: newest.attributionNotice },
      methodologyVersion: newest.methodologyVersion,
      methodologyEffectiveFrom: newest.methodologyEffectiveFrom,
      base: newest.base,
      latest: pointOf(newest),
      // The moment Urdais published, kept apart from the reference month so a client cannot
      // render an August figure as "updated today".
      lastPublishedAt: newest.publishedAt,
      points: own.map(pointOf),
      unavailableReason: null,
      freshness: null,
    } satisfies UmpiSeriesView;
  });

  return {
    family: UMPI_FAMILY,
    series,
    unavailableReason: series.every((s) => s.points.length === 0) ? "no published observations" : null,
    freshness: null,
  };
}

/**
 * The model served when no database is configured. Empty, and explicit about why.
 *
 * Its freshness is `unknown` rather than null: with no database there is no operational evidence,
 * and "we cannot vouch for this" is a definite and correct answer where null would read as a
 * field nobody filled in.
 */
export function unconfiguredUmpiReadModel(): UmpiReadModel {
  const model = buildUmpiReadModel([]);
  return {
    ...model,
    unavailableReason: "no database is configured",
    freshness: "unknown",
    series: model.series.map((series) => ({ ...series, freshness: null })),
  };
}

const DEMO_TERMS = [
  "DDR5",
  "DDR4",
  "DDR3",
  "eTT",
  "HBM",
  "$/part",
  "USD/chip",
  "per chip",
  "spot price",
  "chip price",
];

/**
 * The response's own contract, checked before it is served.
 *
 * Two classes of failure are worth a 500 rather than a wrong number: a leak of internal
 * provenance, and any demo vocabulary reaching a production payload. The second is the reason
 * this exists — the repository still carries a memory market of invented DDR and HBM instruments,
 * and the production path must be incapable of serving them.
 */
export function validatePublicUmpi(candidate: unknown): string[] {
  const reasons: string[] = [];
  if (candidate === null || typeof candidate !== "object") return ["response is not an object"];
  const model = candidate as UmpiReadModel;

  if (model.family?.code !== "UMPI") reasons.push("family code is not UMPI");
  if (model.family?.hasCompositeLevel !== false) reasons.push("the family claims a composite level");
  if (!Array.isArray(model.series)) return [...reasons, "series is not an array"];
  if (model.series.length !== 2) reasons.push(`expected two series, found ${model.series.length}`);

  const serialized = JSON.stringify(model);
  for (const leaked of ["observationId", "retrievalId", "inputsDigest", "provenanceHash", "founder_accepted_risk", "ambiguous_requires_legal_review"]) {
    if (serialized.includes(leaked)) reasons.push(`response leaks internal field ${leaked}`);
  }
  // A uuid anywhere in a public payload means a database key escaped.
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) {
    reasons.push("response contains a database identifier");
  }

  for (const series of model.series) {
    // A freshness verdict that contradicts the data beside it is worse than none: it is the one
    // field a reader would trust to tell them the number is current.
    if (series.freshness !== null) {
      if (series.freshness.state === "fresh" && series.points.length === 0) {
        reasons.push(`${series.seriesCode} claims to be fresh with no published points`);
      }
      if (series.freshness.latestReferenceMonth !== (series.latest?.referenceMonth ?? null)) {
        reasons.push(`${series.seriesCode} freshness describes a different month from its latest point`);
      }
    }
    if (series.unit !== "index_points") reasons.push(`${series.seriesCode} unit is ${series.unit}`);
    if (series.frequency !== "monthly") reasons.push(`${series.seriesCode} frequency is ${series.frequency}`);
    if (series.changeLabel !== "MoM") reasons.push(`${series.seriesCode} change label is ${series.changeLabel}`);

    if (series.kind === "derived_unit_value_index" && !series.semanticWarning) {
      reasons.push(`${series.seriesCode} is a unit-value index and carries no warning`);
    }
    if (series.kind === "official_price_index" && series.semanticWarning !== null) {
      reasons.push(`${series.seriesCode} is a price index and must not carry a mix warning`);
    }

    for (const point of series.points) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(point.referenceMonth)) {
        reasons.push(`${series.seriesCode} has a point that is not a reference month`);
      }
      if (point.change !== null && point.changeWithheldReason !== null) {
        reasons.push(`${series.seriesCode} ${point.referenceMonth} has both a change and a withholding reason`);
      }
      if (!Number.isFinite(point.level)) reasons.push(`${series.seriesCode} ${point.referenceMonth} has a non-finite level`);
    }

    // Months strictly ascending and unique: one current publication per month, in order.
    const months = series.points.map((p) => p.referenceMonth);
    if (months.some((m, i) => i > 0 && m <= months[i - 1]!)) {
      reasons.push(`${series.seriesCode} points are not strictly ascending by month`);
    }
  }

  const prose = JSON.stringify({ family: model.family, series: model.series.map((s) => ({ ...s, points: [] })) });
  for (const term of DEMO_TERMS) {
    // The warning names what the series is *not*, so it is exempt from the vocabulary check.
    const withoutWarnings = prose.split(UMPI_EXPORT_UV_MIX_WARNING).join("");
    if (withoutWarnings.includes(term)) reasons.push(`response contains demo vocabulary: ${term}`);
  }

  return reasons;
}
