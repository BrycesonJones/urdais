/**
 * The public UAVI read model: what leaves the server, and what must never.
 *
 * Three rules shape every field here.
 *
 * **Nullable means absent, not zero.** When UAVI is not initialized, `level`, `previousLevel`,
 * `change` and `changePercent` are all null and `points` is `[]`. A zero would render as a value,
 * and "0.00 (0.00%)" on a volatility index is a claim that the market expects no volatility at
 * all — which is not a thing anyone said and not a thing that has ever been true.
 *
 * **Coverage travels with the level, in every state.** UAVI is a measure over a subset of its
 * parent universe and the size of that subset is part of what the number means: the methodology
 * requires that displays show the status and the coverage alongside the value. Coverage is also
 * published where there is no value, because it is the explanation for there being none.
 *
 * **No option data crosses the boundary.** The level is Urdais's own derived output. The quotes,
 * strikes, contracts, forwards and per-strip variances behind it are licensed or licence-bound
 * inputs, and re-serving them would make this a redistribution of somebody else's market data
 * rather than an index over it. The validator refuses a response carrying a field that looks like
 * one — a contract test rather than a convention, because this is the boundary where a licence
 * breach would be invisible until somebody else noticed it.
 */

import type { UaviLifecycle } from "@/lib/uavi/read/lifecycle";

export const UAVI_SYMBOL = "UAVI" as const;
export const UAVI_NAME = "Urdais AI Volatility Index" as const;
/** Annualized volatility points. Not an index level: UAVI has no base value and is not rebased. */
export const UAVI_UNIT = "pts" as const;
export const UAVI_HORIZON_DAYS = 30 as const;

/** One published observation. Only ever a canonical one; there is no synthetic constructor. */
export type UaviSeriesPoint = {
  date: string;
  level: number;
};

export type UaviSourceCategory = {
  category: string;
  description: string;
  rightsNote: string;
};

export type UaviMethodologyRef = {
  version: string;
  status: "draft" | "approved";
  documentPath: string;
  name: string;
};

/**
 * Coverage, as published. Null where no calculation reached the point of measuring it — which is
 * different from a coverage of zero, and the difference is the whole distinction between an index
 * that has not started and one whose universe has gone dark.
 */
export type UaviCoverage = {
  coveredParentWeight: number | null;
  coveredIssuerCount: number | null;
  uncoveredIssuerCount: number | null;
  /** Diagnostics. Neither is a publication gate in V1. */
  maxConstituentWeight: number | null;
  effectiveIssuerCount: number | null;
};

export type UaviReadModel = {
  symbol: typeof UAVI_SYMBOL;
  name: typeof UAVI_NAME;
  unit: typeof UAVI_UNIT;
  horizonDays: typeof UAVI_HORIZON_DAYS;

  lifecycle: UaviLifecycle;
  /** Durable public wording. Empty only when the index is live and has nothing to explain. */
  publicReason: string;

  level: number | null;
  previousLevel: number | null;
  change: number | null;
  changePercent: number | null;
  observationDate: string | null;
  publishedAt: string | null;

  coverage: UaviCoverage;

  methodology: UaviMethodologyRef;
  parentMethodology: UaviMethodologyRef;
  sources: readonly UaviSourceCategory[];
};

export type UaviSeriesModel = {
  symbol: typeof UAVI_SYMBOL;
  lifecycle: UaviLifecycle;
  /** Empty where nothing has been published. Never backfilled to fill a chart. */
  points: readonly UaviSeriesPoint[];
};

export const UAVI_SOURCE_CATEGORIES: readonly UaviSourceCategory[] = [
  {
    category: "Listed option quotes",
    description:
      "End-of-day bid and ask for every qualifying US-listed option contract on each constituent's volatility instrument, taken at a single frozen instant and used as quotes rather than as any vendor's computed volatility.",
    rightsNote:
      "Requires a licensed consolidated options data agreement. Urdais holds none, and retail option-chain webpages are not an acceptable production source, so no constituent is currently measurable.",
  },
  {
    category: "Option contract reference data",
    description:
      "Strikes, expiration instants, exercise and settlement styles, multipliers and deliverables, and whether a series has been adjusted for a corporate action.",
    rightsNote: "Venue contract specifications and clearing-organization adjustment notices.",
  },
  {
    category: "USD risk-free rates",
    description:
      "A continuously compounded rate for each selected expiration, used in the implied forward and in the variance sum.",
    rightsNote:
      "A published sovereign or administered benchmark curve. The curve family is an unresolved launch parameter and is deliberately not chosen in code.",
  },
  {
    category: "Parent universe weights",
    description:
      "The canonical base weights of the AI Equity Universe, inherited unchanged and renormalized over the covered set.",
    rightsNote:
      "Urdais's own parent methodology output. UAVI never recomputes, adjusts, smooths or lags them, and never substitutes UGAI's drifted weights.",
  },
];

/** The read model for a server with no database configured. Not an error state. */
export function unconfiguredUaviReadModel(): UaviReadModel {
  return {
    symbol: UAVI_SYMBOL,
    name: UAVI_NAME,
    unit: UAVI_UNIT,
    horizonDays: UAVI_HORIZON_DAYS,
    lifecycle: "not_initialized",
    publicReason:
      "UAVI has not begun live publication. The AI Equity Universe it measures does not yet have a production weight set, and the licensed options data the calculation requires is not yet in place. No volatility level is published until both are.",
    level: null,
    previousLevel: null,
    change: null,
    changePercent: null,
    observationDate: null,
    publishedAt: null,
    coverage: {
      coveredParentWeight: null,
      coveredIssuerCount: null,
      uncoveredIssuerCount: null,
      maxConstituentWeight: null,
      effectiveIssuerCount: null,
    },
    methodology: {
      version: "0.2.0-draft",
      status: "draft",
      documentPath: "/docs/methodology/uavi",
      name: UAVI_NAME,
    },
    parentMethodology: {
      version: "0.4.0-draft",
      status: "draft",
      documentPath: "/docs/methodology/ai-equity-universe",
      name: "Urdais AI Equity Universe",
    },
    sources: UAVI_SOURCE_CATEGORIES,
  };
}

/**
 * Field names that would mean a licensed option input, or a constituent-level disclosure UAVI
 * does not publish, had escaped into a public response.
 */
const FORBIDDEN_FIELDS = [
  "quotes",
  "chain",
  "optionChain",
  "option_chain",
  "contracts",
  "contractSymbol",
  "contract_symbol",
  "strike",
  "strikes",
  "bid",
  "ask",
  "quoteMid",
  "quote_mid",
  "forward",
  "forwardPrice",
  "k0",
  "termVariance",
  "term_variance",
  "components",
  "constituents",
  "sourcePayload",
  "source_payload",
  "permissionGrantId",
  "permission_grant_id",
  "sourceInterfaceId",
];

/** Validate a public response against its own contract. Returns the reasons it fails. */
export function validatePublicUavi(payload: unknown): string[] {
  const reasons: string[] = [];
  if (typeof payload !== "object" || payload === null) return ["the response is not an object"];
  const model = payload as Record<string, unknown>;

  const lifecycle = model.lifecycle;
  const carriesLevel = lifecycle === "live" || lifecycle === "delayed";

  if (!carriesLevel) {
    // The core rule. A state with no level must not carry one, and must not carry a zero in its
    // place: "0.00" on a volatility index reads as a market expecting no volatility at all.
    for (const field of [
      "level",
      "previousLevel",
      "change",
      "changePercent",
      "observationDate",
      "publishedAt",
    ]) {
      if (model[field] !== null) reasons.push(`${String(lifecycle)} carries a non-null ${field}`);
    }
    if (typeof model.publicReason !== "string" || model.publicReason.trim() === "") {
      reasons.push("a non-live state gives no public reason");
    }
  } else if (typeof model.level !== "number" || !Number.isFinite(model.level) || model.level <= 0) {
    reasons.push("a live state carries no usable level");
  }

  // A change percent that arrived as zero where it should have been null renders identically to a
  // flat day, which is the failure the UGAI and UTVI surfaces already guard against.
  if (model.previousLevel === null && model.changePercent !== null) {
    reasons.push("a change percent exists with no previous level to change from");
  }

  // A published level must carry the coverage that qualifies it, because the coverage is part of
  // what the number means.
  if (carriesLevel) {
    const coverage = model.coverage as Record<string, unknown> | undefined;
    if (coverage === undefined || coverage === null) {
      reasons.push("a live state publishes no coverage");
    } else if (
      typeof coverage.coveredParentWeight !== "number" ||
      typeof coverage.coveredIssuerCount !== "number"
    ) {
      reasons.push("a live state publishes an incomplete coverage figure");
    }
  }

  for (const field of FORBIDDEN_FIELDS) {
    if (field in model) reasons.push(`the response exposes the restricted field ${field}`);
  }

  if (model.symbol !== UAVI_SYMBOL) reasons.push("the response is not UAVI");
  return reasons;
}

/** Validate a series response. */
export function validatePublicUaviSeries(payload: unknown): string[] {
  const reasons: string[] = [];
  if (typeof payload !== "object" || payload === null) return ["the response is not an object"];
  const model = payload as Record<string, unknown>;
  const points = model.points;
  if (!Array.isArray(points)) return ["the series is not an array"];

  // The rule that stops a chart existing before the index does.
  if (model.lifecycle === "not_initialized" && points.length > 0) {
    reasons.push("an uninitialized index served series points");
  }
  for (const point of points as Record<string, unknown>[]) {
    if (typeof point.level !== "number" || !Number.isFinite(point.level) || point.level <= 0) {
      reasons.push("a series point carries no usable level");
      break;
    }
    if (typeof point.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(point.date)) {
      reasons.push("a series point carries no calendar date");
      break;
    }
  }
  if (model.symbol !== UAVI_SYMBOL) reasons.push("the series is not UAVI");
  return reasons;
}
