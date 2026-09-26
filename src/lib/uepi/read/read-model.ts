/**
 * The public UEPI read model.
 *
 * What it serves is released daily benchmark prices and the §I.2 metadata a reader needs to
 * know what each one measures. What it does not serve is everything that made them: retrieval
 * and observation identifiers, input digests, raw payloads, superseded calculations, the
 * internal rights-review state, and -- decisively -- the four markets Urdais stores but does not
 * publish. A blocked market is *absent* here, never present carrying a null value: "we do not
 * publish this" and "this has no value today" are different statements, and only one of them is
 * true of MISO.
 *
 * Two rules from the frozen specification are enforced in this file rather than left to a
 * surface's discretion, because a surface that forgets either renders a plausible wrong number:
 *
 *   §D  A percentage change exists only between two strictly positive endpoints. Otherwise the
 *       change is the signed dollar amount and a reason code, and direction still comes from the
 *       sign of that amount. Wholesale power goes negative; this is not a display preference.
 *   §E  A range's base is the last released day at or before the window start, bounded by one
 *       further window, and a range with no base in reach is unavailable rather than stretched.
 *
 * The dollar change is computed in exact decimal, not in `number`. A UEPI value carries six
 * decimal places, and float subtraction of two of them produces figures like
 * 35.67 - 35.65 = 0.020000000000003126 -- which is how a tolerance comparison withheld valid
 * NYISO days in production before PR #202. A displayed change deserves the same arithmetic as
 * a released one.
 */

import { directionOf, isPercentagePublishable, type ChangeDirection } from "@/lib/market-change";
import { formatDecimal, parseDecimal, sumDecimal } from "@/lib/uepi/decimal";
import {
  RELEASED_VALUE_DECIMAL_PLACES,
  SPECIFICATION_DIGEST,
  SPECIFICATION_VERSION,
  UEPI_UNIT,
} from "@/lib/uepi/methodology";
import { UEPI_SERIES_IDS, type PriceConstruct, type UepiSeriesId } from "@/lib/uepi/types";
import type { RightsClassification } from "@/lib/rights/publication";

/** Where the methodology document lives, for the link every value carries (§I.2). */
export const UEPI_METHODOLOGY_HREF = "/docs/methodology/uepi";

/**
 * The demo instrument ids UEPI-3 retired (§I.1).
 *
 * They were the seven generated wholesale-power walks' ids, and one of them appearing in a
 * response would mean the mock path had come back -- with a fabricated price where a real one
 * belongs. Named exactly rather than matched by prefix, because `power-analytics` is a live
 * route this payload may legitimately reference.
 */
export const RETIRED_DEMO_INSTRUMENT_IDS: readonly string[] = [
  "power-ercot", "power-pjm", "power-caiso", "power-miso", "power-iso-ne", "power-nyiso", "power-spp",
];

/** The series ids Urdais stores and does not publish. Their absence from a payload is asserted. */
export const NON_PUBLIC_UEPI_SERIES_IDS: readonly string[] = ["uepi-pjm", "uepi-miso", "uepi-spp", "uepi-iso-ne"];

/* ------------------------------------------------------------------ change (§D) */

/** Which quantity is the movement. `unavailable` means no comparison exists at all (§D.4 rows 13-14). */
export type UepiChangeBasis = "percent" | "absolute" | "unavailable";

/**
 * A change between two released days, under §D.
 *
 * `absoluteChangeUsdPerMwh` is present whenever both endpoints exist, in every sign combination.
 * `percentChange` is present only alongside `basis: "percent"`. `direction` survives a suppressed
 * percentage, which is the whole point of §D.4 rows 8 and 9: -$10 to -$5 is a rise.
 */
export type UepiChange = {
  basis: UepiChangeBasis;
  absoluteChangeUsdPerMwh: number | null;
  percentChange: number | null;
  direction: ChangeDirection | null;
  /** From §D.4 where a percentage was suppressed, or §E where no base was in reach. */
  reason: string | null;
  /** §E.3: the label never outruns the data, so the dates the comparison actually used travel with it. */
  baseOperatingDate: string | null;
  latestOperatingDate: string | null;
};

export function unavailableChange(reason: string): UepiChange {
  return {
    basis: "unavailable",
    absoluteChangeUsdPerMwh: null,
    percentChange: null,
    direction: null,
    reason,
    baseOperatingDate: null,
    latestOperatingDate: null,
  };
}

/**
 * The §D change between two released days, with the dollar amount computed exactly.
 *
 * The percentage is a ratio and is therefore a `number`; that is fine, because §D only permits
 * one where both endpoints are strictly positive, and a ratio of two positive prices has no sign
 * to invert and no zero to divide by. The dollar amount is the figure a reader acts on, so it is
 * differenced as scaled integers and only then converted.
 */
export function changeBetweenDays(
  base: { operatingDate: string; valueUsdPerMwh: string },
  latest: { operatingDate: string; valueUsdPerMwh: string },
): UepiChange {
  const exact = sumDecimal([
    { value: latest.valueUsdPerMwh, sign: 1 },
    { value: base.valueUsdPerMwh, sign: -1 },
  ]);
  const absoluteChangeUsdPerMwh = Number(exact);
  const baseValue = Number(base.valueUsdPerMwh);
  const latestValue = Number(latest.valueUsdPerMwh);
  const dates = { baseOperatingDate: base.operatingDate, latestOperatingDate: latest.operatingDate };
  const direction = directionOf(absoluteChangeUsdPerMwh);

  if (!isPercentagePublishable(baseValue, latestValue)) {
    // Which endpoint disqualified it, in the order §D.4 examines them: a bad base makes the
    // newer value's sign irrelevant, and it is the case that would otherwise invert direction.
    const reason = baseValue === 0 ? "base_zero" : baseValue < 0 ? "base_negative" : "new_not_positive";
    return { basis: "absolute", absoluteChangeUsdPerMwh, percentChange: null, direction, reason, ...dates };
  }
  return {
    basis: "percent",
    absoluteChangeUsdPerMwh,
    percentChange: ((latestValue - baseValue) / baseValue) * 100,
    direction,
    reason: null,
    ...dates,
  };
}

/* ------------------------------------------------------------------ the model */

/** One released operating day. The value is signed and may be zero or negative. */
export type UepiPoint = {
  /** The market's own calendar date, `YYYY-MM-DD`. Stamped at 00:00:00 UTC on the series (§E.1). */
  operatingDate: string;
  valueUsdPerMwh: number;
  /** How many hours the mean was taken over, and how many the day should have had (§C.6). */
  observationCount: number;
  expectedObservationCount: number;
};

/** The attribution and unresolved-rights text a public surface is obliged to render (§J). */
export type UepiNotice = {
  attribution: string | null;
  conditions: string | null;
  unresolvedIssue: string | null;
  rightsClassification: RightsClassification | null;
};

/** The §I.2 metadata card. Every field is mandatory; a series that cannot fill one does not publish. */
export type UepiSeriesView = {
  seriesId: UepiSeriesId;
  market: string;
  /** `UEPI-ERCOT`. The display symbol, matching the product design (§I.1). */
  displaySymbol: string;
  name: string;
  unit: typeof UEPI_UNIT;
  /**
   * What the price contains. Never flattened away: a delivered price includes congestion and a
   * system energy component does not, and two series that differ only in this are not comparable
   * as prices however similar their charts look.
   */
  priceConstruct: PriceConstruct;
  benchmarkDefinition: string;
  /** What the construct leaves out, verbatim. Empty for a delivered price. */
  excludes: readonly string[];
  geographicScope: string;
  sourceName: string;
  sourceUrl: string;
  sourceGranularity: "hourly";
  /** IANA zone of the operating day. MISO's fixed offset is a fact about MISO, not a bug. */
  operatingTimezone: string;
  hourConvention: string;
  dailyAggregation: "arithmetic_mean_of_valid_hours";
  updateFrequency: "daily_one_value_per_operating_day";
  methodologyVersion: string;
  methodologyDigest: string;
  methodologyHref: string;
  notice: UepiNotice;
  knownLimitations: readonly string[];
  /** Always `production`. A UEPI series is never rendered beside a demo one (§I.2). */
  provenance: "production";
  latest: UepiPoint | null;
  /** When Urdais released the latest value. Not a claim about when the hours occurred. */
  latestReleasedAt: string | null;
  /** Day-over-day, under §D. `unavailable` where the previous operating day did not release. */
  change1d: UepiChange;
  /** Released days in operating-date order. Empty on the family route, which carries only latest. */
  points: readonly UepiPoint[];
  /** Why this series has no value, where it has none. Null when it does. */
  unavailableReason: string | null;
};

export type UepiReadModel = {
  family: {
    code: "UEPI";
    name: string;
    unit: typeof UEPI_UNIT;
    /**
     * False, always. §C.14: UEPI publishes no composite and no cross-market statistic. Seven
     * markets in four timezones measuring two different price constructs have no average that
     * means anything, and a headline number would be that average wearing a name.
     */
    hasCompositeLevel: false;
    specificationVersion: string;
    specificationDigest: string;
    methodologyHref: string;
  };
  series: readonly UepiSeriesView[];
  /** Why the model is empty, where it is. Null when at least one series published. */
  unavailableReason: string | null;
};

export const UEPI_FAMILY_NAME = "Urdais Energy & Power Index";

function family(): UepiReadModel["family"] {
  return {
    code: "UEPI",
    name: UEPI_FAMILY_NAME,
    unit: UEPI_UNIT,
    hasCompositeLevel: false,
    specificationVersion: SPECIFICATION_VERSION,
    specificationDigest: SPECIFICATION_DIGEST,
    methodologyHref: UEPI_METHODOLOGY_HREF,
  };
}

/**
 * The model a caller gets when no database is configured or the read failed.
 *
 * Empty, with a reason, and never a cached or demo value. A surface rendering this says Urdais
 * cannot answer right now, which is true; the alternative -- falling back to the illustrative
 * walk this phase retired -- would put a fabricated $36.40 where a real price belongs.
 */
export function unconfiguredUepiReadModel(
  reason = "no database is configured for this environment",
): UepiReadModel {
  return { family: family(), series: [], unavailableReason: reason };
}

export function buildUepiReadModel(series: readonly UepiSeriesView[]): UepiReadModel {
  return {
    family: family(),
    series,
    unavailableReason: series.some((candidate) => candidate.latest !== null)
      ? null
      : "no UEPI series has a released value",
  };
}

/* ------------------------------------------------------------------ helpers shared by loaders */

/** `uepi-ercot` -> `UEPI-ERCOT` (§I.1). Derived, so the two spellings cannot drift apart. */
export function displaySymbolFor(seriesId: UepiSeriesId): string {
  return seriesId.toUpperCase();
}

/** A released value as the surface's number, from its exact decimal string. */
export function pointValue(valueUsdPerMwh: string): number {
  // Re-formatted through the decimal parser first, so a value that is not a decimal at six
  // places fails here rather than silently becoming a rounded float on a public surface.
  return Number(formatDecimal({ ...parseDecimal(valueUsdPerMwh) }));
}

export { RELEASED_VALUE_DECIMAL_PLACES };

/* ------------------------------------------------------------------ the contract validator */

/**
 * Whether a candidate payload is something Urdais may serve, returning every reason it is not.
 *
 * This runs on the response, not on the inputs, and it is the last gate before a number reaches a
 * reader. It exists because every other check in this phase is a check on code that was written
 * correctly; this one catches the case where it was not. A leaked internal-only series, a
 * database identifier, a demo instrument id, a specification digest that is not the frozen one,
 * or a percentage sitting beside a non-positive endpoint all answer 500 rather than shipping.
 */
export function validatePublicUepi(candidate: unknown): string[] {
  const reasons: string[] = [];
  if (candidate === null || typeof candidate !== "object") return ["response is not an object"];
  const model = candidate as UepiReadModel;

  if (model.family?.code !== "UEPI") reasons.push("family code is not UEPI");
  if (model.family?.hasCompositeLevel !== false) reasons.push("the family claims a composite level");
  if (model.family?.specificationVersion !== SPECIFICATION_VERSION) {
    reasons.push(`family specification version is ${model.family?.specificationVersion}`);
  }
  if (model.family?.specificationDigest !== SPECIFICATION_DIGEST) {
    reasons.push("family specification digest is not the frozen one");
  }
  if (!Array.isArray(model.series)) return [...reasons, "series is not an array"];

  const serialized = JSON.stringify(model);
  for (const blocked of NON_PUBLIC_UEPI_SERIES_IDS) {
    if (serialized.includes(blocked)) reasons.push(`response exposes non-public series ${blocked}`);
  }
  for (const leaked of ["inputDigest", "retrievalId", "benchmarkId", "rawPayload", "superseded", "recordHash"]) {
    if (serialized.includes(leaked)) reasons.push(`response leaks internal field ${leaked}`);
  }
  // The retired demo instrument ids, named exactly. A looser `power-\w+` pattern would also
  // match `power-analytics`, which is a real route this payload may legitimately link to.
  if (RETIRED_DEMO_INSTRUMENT_IDS.some((id) => serialized.includes(id))) {
    reasons.push("response carries a demo instrument id");
  }
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(serialized)) {
    reasons.push("response contains a database identifier");
  }

  const seen = new Set<string>();
  for (const series of model.series) {
    if (!(UEPI_SERIES_IDS as readonly string[]).includes(series.seriesId)) {
      reasons.push(`${series.seriesId} is not a UEPI series id`);
    }
    if (seen.has(series.seriesId)) reasons.push(`${series.seriesId} appears twice`);
    seen.add(series.seriesId);

    if (series.unit !== UEPI_UNIT) reasons.push(`${series.seriesId} unit is ${series.unit}`);
    if (series.provenance !== "production") reasons.push(`${series.seriesId} provenance is ${series.provenance}`);
    if (series.methodologyVersion !== SPECIFICATION_VERSION) {
      reasons.push(`${series.seriesId} carries methodology version ${series.methodologyVersion}`);
    }
    if (series.methodologyDigest !== SPECIFICATION_DIGEST) {
      reasons.push(`${series.seriesId} carries a specification digest that is not the frozen one`);
    }
    if (series.knownLimitations.length === 0) reasons.push(`${series.seriesId} publishes no limitations`);
    // §I.2: every field is mandatory, and these are the ones a reader cannot do without.
    for (const field of ["benchmarkDefinition", "geographicScope", "sourceName", "sourceUrl"] as const) {
      if (typeof series[field] !== "string" || series[field].length === 0) {
        reasons.push(`${series.seriesId} has no ${field}`);
      }
    }
    if (series.priceConstruct === "system_energy_component" && series.excludes.length === 0) {
      // A system energy component that does not say what it excludes overclaims: a reader would
      // read it as the price of electricity in that market, which it is not.
      reasons.push(`${series.seriesId} is an energy component and states no exclusions`);
    }

    for (const point of [...series.points, ...(series.latest ? [series.latest] : [])]) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(point.operatingDate)) {
        reasons.push(`${series.seriesId} has a point that is not an operating date`);
      }
      if (!Number.isFinite(point.valueUsdPerMwh)) {
        reasons.push(`${series.seriesId} has a point with no finite value`);
      }
      // §C.6/§G.2: there is no partial day. A released value covers every hour of its day.
      if (point.observationCount !== point.expectedObservationCount) {
        reasons.push(`${series.seriesId} ${point.operatingDate} is a partial day`);
      }
    }

    reasons.push(...changeReasons(`${series.seriesId} change1d`, series.change1d));
  }
  return reasons;
}

/** The §D invariants one change object must satisfy, wherever it appears. */
export function changeReasons(label: string, change: UepiChange): string[] {
  const reasons: string[] = [];
  if (change.basis === "percent") {
    if (change.percentChange === null) reasons.push(`${label} claims a percentage and carries none`);
    if (change.reason !== null) reasons.push(`${label} is a percentage and carries a suppression reason`);
  } else {
    if (change.percentChange !== null) reasons.push(`${label} carries a percentage it may not publish`);
    if (change.reason === null) reasons.push(`${label} withholds a percentage without saying why`);
  }
  if (change.basis === "unavailable") {
    if (change.absoluteChangeUsdPerMwh !== null) reasons.push(`${label} is unavailable and carries an amount`);
    if (change.direction !== null) reasons.push(`${label} is unavailable and claims a direction`);
  } else {
    // §D.2: the dollar change is always defined, and direction always comes from its sign.
    if (change.absoluteChangeUsdPerMwh === null) reasons.push(`${label} has endpoints and no dollar change`);
    if (change.direction !== directionOf(change.absoluteChangeUsdPerMwh ?? Number.NaN)) {
      reasons.push(`${label} direction does not follow the sign of its dollar change`);
    }
    if (change.baseOperatingDate === null || change.latestOperatingDate === null) {
      reasons.push(`${label} does not state the dates it measured between`);
    }
  }
  return reasons;
}
