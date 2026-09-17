/**
 * Representative-security selection: one issuer, one membership, one security.
 *
 * The methodology's order, applied exactly:
 *
 *   1. Retain the incumbent if it remains eligible — "avoiding switches driven by small liquidity
 *      differences", so incumbency is checked before turnover is even compared.
 *   2. Otherwise the eligible listing with the greatest average daily traded value in USD over the
 *      window used by the liquidity screen.
 *   3. On an exact tie only: ordinary equity over a receipt, then the issuer-designated primary
 *      listing, then ascending ISIN, then ascending exchange MIC.
 *
 * The rule this module exists to refuse is the one nobody writes down: choosing the line Urdais
 * happens to have data for. So an unmeasured candidate is never treated as having zero turnover,
 * and a comparison in which any eligible candidate is unmeasured returns `undeterminable` rather
 * than crowning whichever line was measured. A larger unmeasured line would have won.
 *
 * Availability is not an input here at all. The methodology is explicit that a selection resolving
 * to an unsupported venue "produces an availability constraint ... not a change of representative
 * security to a more convenient line", so nothing in this signature exposes whether a listing can
 * be priced.
 */

export type CandidateListing = {
  securityId: string;
  listingId: string;
  /** Security-screen outcome. An excluded candidate cannot win on any tie-break. */
  eligible: boolean;
  exclusionReason?: string;
  /** Turnover state. "stale" is a suspended line's historical turnover, which cannot win. */
  tradedValueState: "measured" | "unavailable" | "stale";
  adtvUsd: string | null;
  isReceipt: boolean;
  isIssuerPrimary: boolean;
  isin: string | null;
  venueMic: string;
};

export type SelectionOutcome = {
  state: "selected" | "undeterminable" | "no_eligible_security";
  securityId: string | null;
  listingId: string | null;
  rule:
    | "incumbent_retained"
    | "sole_eligible_security"
    | "greatest_traded_value"
    | "tiebreak_ordinary_over_receipt"
    | "tiebreak_issuer_designated_primary"
    | "tiebreak_ascending_isin"
    | "tiebreak_ascending_mic"
    | null;
  basis: string;
};

function compareDecimal(a: string, b: string): number {
  const norm = (v: string) => {
    const [w = "0", f = ""] = v.split(".");
    return { w: BigInt(w), f };
  };
  const x = norm(a);
  const y = norm(b);
  if (x.w !== y.w) return x.w < y.w ? -1 : 1;
  const len = Math.max(x.f.length, y.f.length);
  const xf = BigInt(x.f.padEnd(len, "0") || "0");
  const yf = BigInt(y.f.padEnd(len, "0") || "0");
  if (xf === yf) return 0;
  return xf < yf ? -1 : 1;
}

/**
 * Select the representative security for one issuer.
 *
 * `incumbentListingId` is the previous selection, if any.
 */
export function selectRepresentative(
  candidates: readonly CandidateListing[],
  incumbentListingId: string | null,
): SelectionOutcome {
  const eligible = candidates.filter((c) => c.eligible);

  if (eligible.length === 0) {
    return {
      state: "no_eligible_security",
      securityId: null,
      listingId: null,
      rule: null,
      basis:
        candidates.length === 0
          ? "No listing was considered for this issuer."
          : `No candidate passed the security screens: ${candidates
              .map((c) => `${c.venueMic} (${c.exclusionReason ?? "excluded"})`)
              .join("; ")}.`,
    };
  }

  // 1. Incumbency, before any turnover comparison. The methodology retains an eligible incumbent
  //    precisely so that a small liquidity difference cannot move the representative.
  const incumbent = incumbentListingId
    ? eligible.find((c) => c.listingId === incumbentListingId)
    : undefined;
  if (incumbent) {
    return {
      state: "selected",
      securityId: incumbent.securityId,
      listingId: incumbent.listingId,
      rule: "incumbent_retained",
      basis:
        "The incumbent representative remains eligible and is retained without comparing traded value, which is what stops small liquidity differences moving the representative security.",
    };
  }

  if (eligible.length === 1) {
    const only = eligible[0]!;
    return {
      state: "selected",
      securityId: only.securityId,
      listingId: only.listingId,
      rule: "sole_eligible_security",
      basis: `One eligible listing (${only.venueMic}); no traded-value comparison was required.`,
    };
  }

  // 2. Greatest traded value — but only if every eligible candidate was actually measured. A
  //    candidate whose turnover is unknown might be the largest, so a comparison that silently
  //    omits it is not a comparison. Stale turnover on a suspended line cannot win either.
  const unmeasured = eligible.filter((c) => c.tradedValueState !== "measured" || c.adtvUsd === null);
  if (unmeasured.length > 0) {
    return {
      state: "undeterminable",
      securityId: null,
      listingId: null,
      rule: null,
      basis: `Traded value is not measured for ${unmeasured
        .map((c) => `${c.venueMic} (${c.tradedValueState})`)
        .join(", ")}, so the greatest-traded-value comparison cannot be made. An unmeasured listing is not a listing with zero turnover, and selecting a measured one here would choose the line Urdais happens to have data for.`,
    };
  }

  const ranked = [...eligible].sort((a, b) => compareDecimal(b.adtvUsd!, a.adtvUsd!));
  const top = ranked[0]!;
  const tied = ranked.filter((c) => compareDecimal(c.adtvUsd!, top.adtvUsd!) === 0);

  if (tied.length === 1) {
    return {
      state: "selected",
      securityId: top.securityId,
      listingId: top.listingId,
      rule: "greatest_traded_value",
      basis: `Greatest average daily traded value in USD: ${top.venueMic} at ${top.adtvUsd}, against ${ranked
        .slice(1)
        .map((c) => `${c.venueMic} at ${c.adtvUsd}`)
        .join(", ")}.`,
    };
  }

  // 3. Exact ties only, in the methodology's stated order.
  const ordinaries = tied.filter((c) => !c.isReceipt);
  if (ordinaries.length === 1) {
    const winner = ordinaries[0]!;
    return {
      state: "selected",
      securityId: winner.securityId,
      listingId: winner.listingId,
      rule: "tiebreak_ordinary_over_receipt",
      basis: `Exact tie at ${top.adtvUsd}; ordinary equity preferred over a receipt. A receipt never relocates the business.`,
    };
  }
  const pool = ordinaries.length > 1 ? ordinaries : tied;

  const primaries = pool.filter((c) => c.isIssuerPrimary);
  if (primaries.length === 1) {
    const winner = primaries[0]!;
    return {
      state: "selected",
      securityId: winner.securityId,
      listingId: winner.listingId,
      rule: "tiebreak_issuer_designated_primary",
      basis: `Exact tie at ${top.adtvUsd}; the issuer-designated primary listing is preferred.`,
    };
  }

  const withIsin = pool.filter((c) => c.isin !== null);
  if (withIsin.length > 0) {
    const winner = [...withIsin].sort((a, b) => a.isin!.localeCompare(b.isin!))[0]!;
    return {
      state: "selected",
      securityId: winner.securityId,
      listingId: winner.listingId,
      rule: "tiebreak_ascending_isin",
      basis: `Exact tie at ${top.adtvUsd}; resolved on ascending ISIN (${winner.isin}).`,
    };
  }

  const winner = [...pool].sort((a, b) => a.venueMic.localeCompare(b.venueMic))[0]!;
  return {
    state: "selected",
    securityId: winner.securityId,
    listingId: winner.listingId,
    rule: "tiebreak_ascending_mic",
    basis: `Exact tie at ${top.adtvUsd} with no ISIN recorded; resolved on ascending exchange MIC (${winner.venueMic}).`,
  };
}
