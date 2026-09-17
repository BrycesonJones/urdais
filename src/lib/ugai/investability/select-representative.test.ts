import { describe, expect, it } from "vitest";

import {
  selectRepresentative,
  type CandidateListing,
} from "@/lib/ugai/investability/select-representative";

function listing(over: Partial<CandidateListing> = {}): CandidateListing {
  return {
    securityId: "sec-1",
    listingId: "lst-1",
    eligible: true,
    tradedValueState: "measured",
    adtvUsd: "1000000",
    isReceipt: false,
    isIssuerPrimary: false,
    isin: null,
    venueMic: "XNAS",
    ...over,
  };
}

describe("representative-security selection", () => {
  it("chooses exactly one security for an issuer with one eligible line", () => {
    const out = selectRepresentative([listing()], null);
    expect(out.state).toBe("selected");
    expect(out.rule).toBe("sole_eligible_security");
    expect(out.listingId).toBe("lst-1");
  });

  it("retains an eligible incumbent before comparing traded value", () => {
    // The methodology retains an eligible incumbent specifically to avoid switches driven by
    // small liquidity differences, so a larger rival does not move the representative.
    const out = selectRepresentative(
      [
        listing({ listingId: "incumbent", adtvUsd: "1000000", venueMic: "XTAI" }),
        listing({ listingId: "bigger", securityId: "sec-2", adtvUsd: "9000000" }),
      ],
      "incumbent",
    );
    expect(out.rule).toBe("incumbent_retained");
    expect(out.listingId).toBe("incumbent");
  });

  it("chooses the greatest traded value for a new issuer", () => {
    const out = selectRepresentative(
      [
        listing({ listingId: "hk", securityId: "sec-2", adtvUsd: "9000000", venueMic: "XHKG" }),
        listing({ listingId: "us", adtvUsd: "1000000" }),
      ],
      null,
    );
    expect(out.rule).toBe("greatest_traded_value");
    expect(out.listingId).toBe("hk");
  });

  it("is deterministic for a dual listing, whatever order the candidates arrive in", () => {
    const a = listing({ listingId: "adr", securityId: "sec-adr", adtvUsd: "5000000", isReceipt: true, venueMic: "XNYS" });
    const o = listing({ listingId: "ord", securityId: "sec-ord", adtvUsd: "5000000", venueMic: "XHKG" });
    // Exact tie between an ADR and the ordinary line: ordinary equity wins, in both orders.
    expect(selectRepresentative([a, o], null).listingId).toBe("ord");
    expect(selectRepresentative([o, a], null).listingId).toBe("ord");
    expect(selectRepresentative([a, o], null).rule).toBe("tiebreak_ordinary_over_receipt");
  });

  it("lets a receipt win on traded value, because the tie-break applies only to exact ties", () => {
    const out = selectRepresentative(
      [
        listing({ listingId: "adr", securityId: "sec-adr", adtvUsd: "9000000", isReceipt: true, venueMic: "XNYS" }),
        listing({ listingId: "ord", securityId: "sec-ord", adtvUsd: "5000000", venueMic: "XHKG" }),
      ],
      null,
    );
    expect(out.listingId).toBe("adr");
    expect(out.rule).toBe("greatest_traded_value");
  });

  it("falls through the tie-break order: primary, then ISIN, then MIC", () => {
    const base = { adtvUsd: "5000000", isReceipt: true };
    expect(
      selectRepresentative(
        [
          listing({ ...base, listingId: "a", venueMic: "XNYS" }),
          listing({ ...base, listingId: "b", venueMic: "XHKG", isIssuerPrimary: true }),
        ],
        null,
      ).rule,
    ).toBe("tiebreak_issuer_designated_primary");

    expect(
      selectRepresentative(
        [
          listing({ ...base, listingId: "a", venueMic: "XNYS", isin: "US9999999999" }),
          listing({ ...base, listingId: "b", venueMic: "XHKG", isin: "HK0000000001" }),
        ],
        null,
      ),
    ).toMatchObject({ rule: "tiebreak_ascending_isin", listingId: "b" });

    expect(
      selectRepresentative(
        [
          listing({ ...base, listingId: "a", venueMic: "XNYS" }),
          listing({ ...base, listingId: "b", venueMic: "XHKG" }),
        ],
        null,
      ),
    ).toMatchObject({ rule: "tiebreak_ascending_mic", listingId: "b" });
  });

  it("refuses to decide when any eligible candidate's turnover is unmeasured", () => {
    // The rule this whole module exists to enforce. The measured line is not known to be the
    // largest, and picking it would be choosing the line Urdais has data for.
    const out = selectRepresentative(
      [
        listing({ listingId: "measured", adtvUsd: "5000000" }),
        listing({ listingId: "unknown", securityId: "sec-2", tradedValueState: "unavailable", adtvUsd: null, venueMic: "XHKG" }),
      ],
      null,
    );
    expect(out.state).toBe("undeterminable");
    expect(out.listingId).toBeNull();
    expect(out.basis).toMatch(/line Urdais happens to have data for/);
  });

  it("will not let a suspended line win on stale turnover", () => {
    const out = selectRepresentative(
      [
        listing({ listingId: "suspended", adtvUsd: "9000000", tradedValueState: "stale" }),
        listing({ listingId: "live", securityId: "sec-2", adtvUsd: "1000000", venueMic: "XHKG" }),
      ],
      null,
    );
    expect(out.state).toBe("undeterminable");
  });

  it("ignores an ineligible incumbent rather than retaining it", () => {
    const out = selectRepresentative(
      [
        listing({ listingId: "incumbent", eligible: false, exclusionReason: "delisted" }),
        listing({ listingId: "other", securityId: "sec-2", adtvUsd: "1000000", venueMic: "XHKG" }),
      ],
      "incumbent",
    );
    expect(out.rule).toBe("sole_eligible_security");
    expect(out.listingId).toBe("other");
  });

  it("reports no eligible security rather than selecting an excluded one", () => {
    const out = selectRepresentative(
      [listing({ eligible: false, exclusionReason: "preferred equity is excluded" })],
      null,
    );
    expect(out.state).toBe("no_eligible_security");
    expect(out.securityId).toBeNull();
    expect(out.basis).toMatch(/preferred equity is excluded/);
  });

  it("takes no availability input at all", () => {
    // Availability cannot influence selection, so it is not in the candidate shape. If this ever
    // fails, someone has given the selector a reason to prefer a line it can price.
    const keys = Object.keys(listing());
    expect(keys).not.toContain("priceSourceAvailable");
    expect(keys).not.toContain("available");
  });
});
