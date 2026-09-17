/**
 * The public UGAI read model: what leaves the server, and what must never.
 *
 * Two rules shape every field here.
 *
 * Nullable means absent, not zero. When UGAI is not initialized, `level`, `previousLevel`,
 * `change` and `changePercent` are all `null` and `series` is `[]`. A zero would render as a
 * value, and "0.00 (0.00%)" is a statement about the market that nobody made.
 *
 * Nothing licensed crosses the boundary. The index level is Urdais's own derived output and is
 * publishable in principle; the raw official closes, float factors, share counts and per-source
 * payloads behind it are not. So the DTO carries source *categories* rather than source values,
 * and the validator below refuses a response containing a field that looks like a raw input —
 * a contract test rather than a convention, because this is the boundary where a licence breach
 * would be invisible.
 */

import type { UgaiLifecycle } from "@/lib/ugai/read/lifecycle";

export const UGAI_SYMBOL = "UGAI" as const;
export const UGAI_NAME = "Urdais Global AI Index" as const;
export const UGAI_UNIT = "pts" as const;
/** The base level the methodology fixes. Published as context, never as a current value. */
export const UGAI_BASE_LEVEL = 1000 as const;

/** One published observation. Only ever a canonical one; there is no synthetic constructor. */
export type UgaiSeriesPoint = {
  /** ISO date of the calculation day. */
  date: string;
  level: number;
};

/**
 * A source category, named at the level a reader can check without Urdais republishing anything
 * it licensed. "Official exchange closing prices" is useful; the closes themselves are not ours
 * to serve.
 */
export type UgaiSourceCategory = {
  category: string;
  description: string;
  /** Where the right comes from, in a reader's words. Never a grant id or a contract term. */
  rightsNote: string;
};

export type UgaiMethodologyRef = {
  /** e.g. "0.2.0-draft". Presented as the draft it is. */
  version: string;
  status: "draft" | "approved";
  documentPath: string;
  name: string;
};

export type UgaiReadModel = {
  symbol: typeof UGAI_SYMBOL;
  name: typeof UGAI_NAME;
  unit: typeof UGAI_UNIT;
  baseLevel: typeof UGAI_BASE_LEVEL;

  lifecycle: UgaiLifecycle;
  /** Durable public wording. Empty only when the index is live and has nothing to explain. */
  publicReason: string;

  /** Null unless the lifecycle carries a level. Never zero as a stand-in. */
  level: number | null;
  previousLevel: number | null;
  change: number | null;
  changePercent: number | null;
  /** The observation's own date, never the time the page was rendered. */
  observationDate: string | null;
  publishedAt: string | null;

  /** UGAI's own methodology, and the parent that defines who is in the universe. */
  methodology: UgaiMethodologyRef;
  parentMethodology: UgaiMethodologyRef;
  sources: readonly UgaiSourceCategory[];
};

export type UgaiSeriesModel = {
  symbol: typeof UGAI_SYMBOL;
  lifecycle: UgaiLifecycle;
  /** Empty where nothing has been published. Never backfilled to fill a chart. */
  points: readonly UgaiSeriesPoint[];
};

/** The source categories, at the granularity a reader can verify and Urdais may publish. */
export const UGAI_SOURCE_CATEGORIES: readonly UgaiSourceCategory[] = [
  {
    category: "Equity closing prices",
    description:
      "Official end-of-day closing prices published by each constituent's own exchange, used exactly as published and never back-adjusted.",
    rightsNote:
      "Collected only from venues whose published terms permit it. Where a venue does not, Urdais records the gap rather than sourcing the price elsewhere.",
  },
  {
    category: "Shares and capitalization",
    description:
      "Outstanding share counts from issuers' own statutory filings, with the free-float and accessibility inputs the weighting requires.",
    rightsNote: "Public regulatory filings and official exchange company data.",
  },
  {
    category: "Exchange rates",
    description:
      "Daily reference rates used to convert each constituent's local closing price into US dollars.",
    rightsNote:
      "European Central Bank euro reference rates and the Central Bank of the Republic of China (Taiwan) interbank closing rate, both published openly with attribution.",
  },
  {
    category: "Corporate actions",
    description:
      "Splits, dividends, rights issues and other events, recorded from venue and issuer announcements and applied through index shares and the divisor rather than by rewriting prices.",
    rightsNote: "Official exchange and issuer announcements.",
  },
  {
    category: "Eligibility evidence",
    description:
      "Statutory annual and interim filings that establish each issuer's qualifying role in the AI value chain.",
    rightsNote: "Public regulatory filings, quoted with attribution and never republished whole.",
  },
];

/** The read model for a server with no database configured. Not an error state. */
export function unconfiguredUgaiReadModel(): UgaiReadModel {
  return {
    symbol: UGAI_SYMBOL,
    name: UGAI_NAME,
    unit: UGAI_UNIT,
    baseLevel: UGAI_BASE_LEVEL,
    lifecycle: "not_initialized",
    publicReason:
      "UGAI has not yet begun live publication. Methodology parameters and data-source validation are still being completed, and no index level is published until they are.",
    level: null,
    previousLevel: null,
    change: null,
    changePercent: null,
    observationDate: null,
    publishedAt: null,
    methodology: {
      version: "0.2.0-draft",
      status: "draft",
      documentPath: "/docs/methodology/ugai",
      name: "Urdais Global AI Index",
    },
    parentMethodology: {
      version: "0.4.0-draft",
      status: "draft",
      documentPath: "/docs/methodology/ai-equity-universe",
      name: "Urdais AI Equity Universe",
    },
    sources: UGAI_SOURCE_CATEGORIES,
  };
}

/** Field names that would mean a licensed input had escaped into a public response. */
const FORBIDDEN_FIELDS = [
  "closePrice",
  "close_price",
  "localPrice",
  "local_price",
  "freeFloatFactor",
  "free_float_factor",
  "accessibleFloatFactor",
  "shareCount",
  "share_count",
  "indexShares",
  "index_shares",
  "divisor",
  "marketValueUsd",
  "market_value_usd",
  "sourcePayload",
  "source_payload",
  "permissionGrantId",
  "permission_grant_id",
  "sourceInterfaceId",
  "attribution",
];

/**
 * Validate a public response against its own contract.
 *
 * Returns the reasons it fails, empty where it passes. The route answers 500 on a non-empty
 * result rather than serving it: a response that contradicts its own rules is worse than no
 * response, because nobody downstream will notice.
 */
export function validatePublicUgai(payload: unknown): string[] {
  const reasons: string[] = [];
  if (typeof payload !== "object" || payload === null) return ["the response is not an object"];
  const model = payload as Record<string, unknown>;

  const lifecycle = model.lifecycle;
  const carriesLevel = lifecycle === "live" || lifecycle === "delayed";

  if (!carriesLevel) {
    // The core rule. A state that has no level must not carry one, and must not carry a zero
    // in its place -- "0.00 (0.00%)" is a claim about the market that nobody made.
    for (const field of ["level", "previousLevel", "change", "changePercent", "observationDate", "publishedAt"]) {
      if (model[field] !== null) {
        reasons.push(`${String(lifecycle)} carries a non-null ${field}`);
      }
    }
    if (typeof model.publicReason !== "string" || model.publicReason.trim() === "") {
      reasons.push("a non-live state gives no public reason");
    }
  } else if (typeof model.level !== "number" || !Number.isFinite(model.level) || model.level <= 0) {
    reasons.push("a live state carries no usable level");
  }

  // A percentage change that arrived as zero where it should have been null is the specific
  // failure the UTVI surface already guards against, and it renders identically to a flat day.
  if (model.previousLevel === null && model.changePercent !== null) {
    reasons.push("a change percent exists with no previous level to change from");
  }

  for (const field of FORBIDDEN_FIELDS) {
    if (field in model) reasons.push(`the response exposes the restricted field ${field}`);
  }

  if (model.symbol !== UGAI_SYMBOL) reasons.push("the response is not UGAI");
  return reasons;
}

/** Validate a series response. */
export function validatePublicUgaiSeries(payload: unknown): string[] {
  const reasons: string[] = [];
  if (typeof payload !== "object" || payload === null) return ["the response is not an object"];
  const model = payload as Record<string, unknown>;
  const points = model.points;
  if (!Array.isArray(points)) return ["the series is not an array"];

  if (model.lifecycle === "not_initialized" && points.length > 0) {
    // The rule that stops a chart existing before the index does.
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
  return reasons;
}
