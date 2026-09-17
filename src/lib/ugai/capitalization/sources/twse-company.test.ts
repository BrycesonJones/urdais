import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseExRightsNotices,
  parseIssuedShares,
  parseParValue,
} from "@/lib/ugai/capitalization/sources/twse-company";
import { CapitalizationContractError } from "@/lib/ugai/capitalization/types";

const dir = join(process.cwd(), "src/lib/ugai/capitalization/fixtures");
const company = JSON.parse(readFileSync(join(dir, "twse-company-basic.json"), "utf8")) as unknown;
const notices = JSON.parse(readFileSync(join(dir, "twse-ex-rights.json"), "utf8")) as unknown;

describe("TWSE issued shares", () => {
  it("parses the issued common share count from a real payload", () => {
    expect(parseIssuedShares(company, "2330")).toEqual({
      shareCountType: "issued",
      shareCount: "25932370067",
      countUnit: "shares",
      effectiveDate: "2026-09-16",
      asReportedDate: "2026-09-16",
      sourceConcept: "已發行普通股數或TDR原股發行股數",
      sourcePayload: expect.objectContaining({ 公司代號: "2330" }),
    });
  });

  it("records 'issued' rather than relabelling it 'outstanding'", () => {
    // Taiwan publishes 已發行, and the difference from outstanding is treasury stock. Silently
    // promoting one to the other would overstate the capitalization base by the treasury holding.
    expect(parseIssuedShares(company, "2330")?.shareCountType).toBe("issued");
  });

  it("cross-checks the count against the issuer's own paid-in capital arithmetic", () => {
    // 259,323,700,670 / 10 = 25,932,370,067 exactly. A misread column fails this for free.
    const tampered = (company as Record<string, unknown>[]).map((r) => ({ ...r, 實收資本額: "1" }));
    expect(() => parseIssuedShares(tampered, "2330")).toThrow(/disagrees with paid-in capital/);
  });

  it("returns null for a code the endpoint does not carry", () => {
    // The ordinary case: the endpoint publishes every listed company, the master holds a handful.
    expect(parseIssuedShares(company, "9999")).toBeNull();
  });

  it("reads a par value out of TWSE's prose field", () => {
    expect(parseParValue("新台幣                 10.0000元")).toBe(10);
    expect(() => parseParValue("新台幣 元")).toThrow(CapitalizationContractError);
  });
});

describe("TWSE ex-rights notices", () => {
  it("parses a cash dividend with its currency", () => {
    const actions = parseExRightsNotices(notices, "2330");
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      actionType: "cash_dividend",
      exDate: "2026-09-16",
      cashAmount: "7.000001",
      cashCurrency: "TWD",
      ratioNumerator: null,
    });
  });

  it("returns several actions where one notice describes several", () => {
    // 2614 goes ex on a cash dividend, a stock dividend and a rights subscription at once.
    const actions = parseExRightsNotices(notices, "2614");
    expect(actions.map((a) => a.actionType).sort()).toEqual([
      "cash_dividend",
      "rights_issue",
      "stock_dividend",
    ]);
  });

  it("keeps a ratio as the pair the venue published, not a decimal", () => {
    const stock = parseExRightsNotices(notices, "1235").find((a) => a.actionType === "stock_dividend");
    // Published per thousand shares. Flattening to 0.00005 would lose the issuer's own terms.
    expect(stock?.ratioNumerator).toBe("0.04999999");
    expect(stock?.ratioDenominator).toBe("1000");
  });

  it("emits nothing for a code with no notice", () => {
    expect(parseExRightsNotices(notices, "9999")).toEqual([]);
  });

  it("rejects a payload that is not an array", () => {
    expect(() => parseExRightsNotices({}, "2330")).toThrow(/not an array/);
  });
});
