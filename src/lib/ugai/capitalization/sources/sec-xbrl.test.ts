import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parsePublicFloatEvidence,
  parseSharesOutstanding,
} from "@/lib/ugai/capitalization/sources/sec-xbrl";
import { CapitalizationContractError } from "@/lib/ugai/capitalization/types";

const dir = join(process.cwd(), "src/lib/ugai/capitalization/fixtures");
const shares = JSON.parse(readFileSync(join(dir, "sec-nvda-shares-outstanding.json"), "utf8")) as unknown;
const publicFloat = JSON.parse(readFileSync(join(dir, "sec-nvda-public-float.json"), "utf8")) as unknown;

describe("SEC shares outstanding", () => {
  it("parses the cover-page count with both of its dates", () => {
    const parsed = parseSharesOutstanding(shares);
    const latest = parsed[parsed.length - 1]!;
    expect(latest).toEqual({
      shareCountType: "outstanding",
      shareCount: "24100000000",
      countUnit: "shares",
      effectiveDate: "2026-08-21",
      asReportedDate: "2026-08-26",
      sourceConcept: "dei:EntityCommonStockSharesOutstanding",
      sourcePayload: expect.objectContaining({ form: "10-Q" }),
    });
    // The two dates are different and neither is derived from the other. A calculation for
    // 22 August must not use a count published on 26 August as though it were knowable then.
    expect(latest.effectiveDate).not.toBe(latest.asReportedDate);
  });

  it("returns the whole reported series, not just the newest period", () => {
    const parsed = parseSharesOutstanding(shares);
    expect(parsed.length).toBeGreaterThan(1);
    expect(parsed.map((p) => p.shareCount)).toEqual(["24300000000", "24200000000", "24100000000"]);
  });

  it("always states the count type, and never guesses it", () => {
    for (const p of parseSharesOutstanding(shares)) expect(p.shareCountType).toBe("outstanding");
  });

  it("refuses an EPS denominator, which is not a point-in-time count", () => {
    // A weighted average over a period is the one thing most likely to be mistaken for shares
    // outstanding, because it is the number that appears next to earnings.
    const eps = { taxonomy: "us-gaap", tag: "WeightedAverageNumberOfSharesOutstandingBasic", units: { shares: [{ val: 1, end: "2026-06-30" }] } };
    expect(() => parseSharesOutstanding(eps)).toThrow(/not a point-in-time capitalization count/);
  });

  it("refuses authorized shares, which are a ceiling nobody has issued", () => {
    const authorized = { taxonomy: "us-gaap", tag: "CommonStockSharesAuthorized", units: { shares: [{ val: 1, end: "2026-06-30" }] } };
    expect(() => parseSharesOutstanding(authorized)).toThrow(CapitalizationContractError);
  });

  it("has no fallback for a multi-class issuer, and says why", () => {
    // Palantir's dei facts carry only EntityPublicFloat. The us-gaap share concepts the flat API
    // serves have had the share-class dimension stripped, so attaching one to the listed Class A
    // line would be a wrong number that looks right.
    const ugaap = { taxonomy: "us-gaap", tag: "CommonStockSharesOutstanding", units: { shares: [{ val: 2402897000, end: "2026-06-30", filed: "2026-08-04" }] } };
    expect(() => parseSharesOutstanding(ugaap)).toThrow(/strips the share-class dimension/);
  });

  it("rejects a non-positive or malformed count", () => {
    const bad = { taxonomy: "dei", tag: "EntityCommonStockSharesOutstanding", units: { shares: [{ val: 0, end: "2026-06-30" }] } };
    expect(() => parseSharesOutstanding(bad)).toThrow(/not greater than zero/);
    const nan = { taxonomy: "dei", tag: "EntityCommonStockSharesOutstanding", units: { shares: [{ val: "NaN", end: "2026-06-30" }] } };
    expect(() => parseSharesOutstanding(nan)).toThrow(/not a share-count literal/);
  });

  it("rejects a concept with no share values rather than returning an empty series", () => {
    const empty = { taxonomy: "dei", tag: "EntityCommonStockSharesOutstanding", units: {} };
    expect(() => parseSharesOutstanding(empty)).toThrow(/no values in 'shares'/);
  });
});

describe("SEC public float", () => {
  it("returns a currency amount, and nothing resembling a factor", () => {
    const evidence = parsePublicFloatEvidence(publicFloat);
    const latest = evidence[evidence.length - 1]!;
    expect(latest.amount).toBe("4000000000000");
    expect(latest.currency).toBe("USD");
    expect(latest.effectiveDate).toBe("2025-07-25");
    // The whole point: no factor is produced here, because producing one would require a market
    // capitalization at the same date and a methodology decision about what non-affiliate means.
    expect(Object.keys(latest)).not.toContain("factor");
    expect(Object.keys(latest)).not.toContain("freeFloatFactor");
  });
});
