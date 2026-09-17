/**
 * The volatility-instrument waterfall.
 *
 *   1. the parent representative security, where qualifying US-listed options exist on it;
 *   2. otherwise a sponsored same-issuer US-listed depositary receipt;
 *   3. otherwise the issuer is uncovered.
 *
 * **Where both qualify, the representative wins — unconditionally.** Not by deeper strike
 * coverage, not by tighter spreads, not by volume or open interest, and not by which chain the
 * vendor happened to deliver more completely. If liquidity could reverse the order, an issuer's
 * measured volatility could change instrument between one session and the next, and the series
 * would record that switch as a change in volatility. The ordering is carried as `preferenceRank`
 * on the mapping row so that it is data rather than a rule anyone has to remember, and this
 * module sorts by it.
 *
 * The same-issuer condition is checked here as well as by a database trigger. A receipt mapped to
 * the wrong issuer would publish one company's volatility under another company's parent weight,
 * and there is no downstream check that would catch it — the number would be entirely plausible.
 */

import type { UncoveredReason } from "@/lib/uavi/parameters";

export type MappingType = "representative" | "adr";

/** One candidate instrument for one issuer, as the canonical mapping records it. */
export type VolatilityInstrumentMapping = {
  id: string;
  issuerId: string;
  volatilitySecurityId: string;
  mappingType: MappingType;
  /** 1 for the representative route, 2 for the receipt route. */
  preferenceRank: number;
  mappingState: "candidate" | "verified" | "withdrawn";
  isSponsored: boolean | null;
  receiptRatioNumerator: number | null;
  receiptRatioDenominator: number | null;
};

export type InstrumentSelection =
  | { selected: true; mapping: VolatilityInstrumentMapping }
  | { selected: false; reason: Extract<UncoveredReason, "no_volatility_instrument"> };

/**
 * Whether a mapping is usable at all, independent of whether options exist today.
 *
 * Deliberately narrow. This answers "is the mapping itself sound" — same issuer, verified, and,
 * for a receipt, sponsored with a complete fixed ratio. It does not answer "does a qualifying
 * option class exist", which is a per-session test against option data, because option classes
 * come and go and a date-dependent fact cannot be frozen into an effective-dated row.
 */
export function isUsableMapping(
  mapping: VolatilityInstrumentMapping,
  issuerId: string,
): boolean {
  if (mapping.issuerId !== issuerId) return false;
  if (mapping.mappingState !== "verified") return false;
  if (mapping.mappingType === "adr") {
    if (mapping.isSponsored !== true) return false;
    const { receiptRatioNumerator: num, receiptRatioDenominator: den } = mapping;
    if (num === null || den === null) return false;
    if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return false;
  }
  return mapping.preferenceRank === (mapping.mappingType === "representative" ? 1 : 2);
}

/**
 * Select an issuer's volatility instrument.
 *
 * `hasQualifyingOptions` is supplied by the caller and is the per-session test: the engine asks
 * it of each candidate in rank order and takes the first that answers yes. That is what makes the
 * waterfall a waterfall rather than a preference — the receipt is reached only when the
 * representative cannot be used, never because it looked better.
 */
export function selectVolatilityInstrument(
  issuerId: string,
  mappings: readonly VolatilityInstrumentMapping[],
  hasQualifyingOptions: (mapping: VolatilityInstrumentMapping) => boolean,
): InstrumentSelection {
  const usable = mappings
    .filter((m) => isUsableMapping(m, issuerId))
    .sort((a, b) => a.preferenceRank - b.preferenceRank);

  for (const mapping of usable) {
    if (hasQualifyingOptions(mapping)) return { selected: true, mapping };
  }
  return { selected: false, reason: "no_volatility_instrument" };
}
