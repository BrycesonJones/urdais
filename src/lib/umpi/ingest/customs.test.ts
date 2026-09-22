import { describe, expect, it } from "vitest";

import { customsSeriesIdentity } from "../identity";
import {
  CUSTOMS_COUNTRY_DIMENSION,
  CUSTOMS_DUPLICATE_MONTH,
  CUSTOMS_MALFORMED_VALUE,
  CUSTOMS_MISSING_FIELDS,
  CUSTOMS_NOT_JSON,
  CUSTOMS_NO_DATA,
  CUSTOMS_PORTAL_ERROR,
  CUSTOMS_SINGLE_MONTH,
  CUSTOMS_THREE_MONTHS,
  CUSTOMS_TOTAL_ROW_MATCHES_SUM,
  CUSTOMS_WRONG_HS,
  CUSTOMS_YEAR_TOTAL,
  CUSTOMS_ZERO_VALUE,
  CUSTOMS_ZERO_WEIGHT,
} from "./fixtures/customs";
import {
  CUSTOMS_COUNTRY_DIMENSION_DATASET_ID,
  CUSTOMS_PORTAL_DATASET_ID,
  CUSTOMS_USD_SCALE,
  assertPortalDataset,
  buildCustomsQueryBody,
  monthsBetween,
  parseCustomsPayload,
} from "./customs";
import { UmpiIdentityMismatchError, UmpiParseError, UmpiProviderError } from "./errors";

const identity = customsSeriesIdentity({ hsCode: "8542321010", datasetId: CUSTOMS_PORTAL_DATASET_ID });
const admitted = (payload: string) =>
  parseCustomsPayload({ identity, payload }).rows.filter((row) => row.state === "admitted");

describe("the query, and what it deliberately does not send", () => {
  it("asks the by-item view for one HS code, in kilograms, with no country filter", () => {
    const body = buildCustomsQueryBody({ identity, range: { fromMonth: "2026-06", toMonth: "2026-08" } });
    const params = new URLSearchParams(body);
    expect(params.get("tradeKind")).toBe("ETS_MNK_1020000A");
    expect(params.get("priodKind")).toBe("MON");
    expect(params.get("hsSgn")).toBe("8542321010");
    expect(params.get("hsSgnGrpCol")).toBe("HS10_SGN");
    // The form's own default is tonnes. Leaving it would be a silent 1000x error.
    expect(params.get("ttwgTpcd")).toBe("1");
    // Period values carry the trailing space the portal's selector emits.
    expect(params.get("priodFr")).toBe("202606 ");
    expect(params.get("priodTo")).toBe("202608 ");
    // If a country parameter ever appears here, the series has stopped being Korea-wide.
    expect(params.get("cntyCd")).toBeNull();
    expect(params.get("cntyNm")).toBeNull();
  });

  it("refuses the country-dimension dataset before a request is built", () => {
    expect(() => assertPortalDataset(identity)).not.toThrow();
    const countryDimension = customsSeriesIdentity({
      hsCode: "8542321010",
      datasetId: CUSTOMS_COUNTRY_DIMENSION_DATASET_ID,
    });
    expect(() => assertPortalDataset(countryDimension)).toThrow(UmpiIdentityMismatchError);
  });
});

describe("the unit conversion", () => {
  it("reads expUsdAmt as thousand USD, not dollars", () => {
    const rows = admitted(CUSTOMS_SINGLE_MONTH);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    if (row.state !== "admitted") return;
    // 1,000 thousand USD is 1,000,000 USD. Reading it as dollars understates Korean DRAM
    // exports by three orders of magnitude while looking entirely plausible.
    expect(row.observation).toEqual({
      kind: "kcs_trade_month",
      referenceMonth: "2026-06",
      exportValueUsd: 1_000_000,
      exportWeightKg: 10_000,
    });
    expect(CUSTOMS_USD_SCALE).toBe(1000);
  });

  it("strips the portal's padding and comma grouping", () => {
    // The fixture's fields arrive as "                  10,000" and "           1,000".
    const rows = admitted(CUSTOMS_SINGLE_MONTH);
    const row = rows[0]!;
    if (row.state !== "admitted" || row.observation.kind !== "kcs_trade_month") return;
    expect(Number.isInteger(row.observation.exportWeightKg)).toBe(true);
  });
});

describe("the total row", () => {
  it("is rejected, and the fixture shows why: it is the sum of the months beside it", () => {
    const result = parseCustomsPayload({ identity, payload: CUSTOMS_TOTAL_ROW_MATCHES_SUM });
    const summary = result.rows.find((row) => row.state === "rejected" && row.code === "summary_row");
    expect(summary).toBeDefined();

    const months = result.rows.filter((row) => row.state === "admitted");
    expect(months).toHaveLength(2);

    // The property that makes admitting it fatal: the total equals the sum, so including it
    // would double both figures.
    const figure = (row: (typeof months)[number], field: "exportWeightKg" | "exportValueUsd") =>
      row.state === "admitted" && row.observation.kind === "kcs_trade_month" ? row.observation[field] : 0;
    const weight = months.reduce((sum, row) => sum + figure(row, "exportWeightKg"), 0);
    const value = months.reduce((sum, row) => sum + figure(row, "exportValueUsd"), 0);
    expect(weight).toBe(20_000);
    expect(value).toBe(2_100_000);
  });

  it("never lets a year total become a month", () => {
    expect(parseCustomsPayload({ identity, payload: CUSTOMS_YEAR_TOTAL }).rows[0]).toMatchObject({
      state: "rejected",
      code: "malformed_reference_month",
    });
  });
});

describe("aggregation safety", () => {
  it("refuses a response carrying a country breakdown rather than summing it", () => {
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_COUNTRY_DIMENSION })).toThrow(UmpiIdentityMismatchError);
  });

  it("refuses two rows for one month even when no country field is present", () => {
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_DUPLICATE_MONTH })).toThrow(/must not be summed/);
  });
});

describe("Customs parsing", () => {
  it("reads a multi-month range, one row per month", () => {
    expect(admitted(CUSTOMS_THREE_MONTHS).map((r) => (r.state === "admitted" ? r.observation.referenceMonth : null))).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("cannot ingest another commodity", () => {
    const result = parseCustomsPayload({ identity, payload: CUSTOMS_WRONG_HS });
    expect(result.rows[0]).toMatchObject({ state: "rejected", code: "hs_code_mismatch" });
    expect(result.rows.some((r) => r.state === "admitted")).toBe(false);
  });

  it("admits a zero export value and rejects a zero export weight", () => {
    expect(admitted(CUSTOMS_ZERO_VALUE)).toHaveLength(1);
    expect(parseCustomsPayload({ identity, payload: CUSTOMS_ZERO_WEIGHT }).rows[0]).toMatchObject({
      state: "rejected",
      code: "zero_export_weight",
    });
  });

  it("rejects a non-numeric figure instead of reading it as zero", () => {
    expect(parseCustomsPayload({ identity, payload: CUSTOMS_MALFORMED_VALUE }).rows[0]).toMatchObject({
      state: "rejected",
      code: "non_numeric_value",
    });
  });

  it("distinguishes no data from an error and from a broken shape", () => {
    expect(parseCustomsPayload({ identity, payload: CUSTOMS_NO_DATA }).rows).toHaveLength(0);
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_PORTAL_ERROR })).toThrow(UmpiProviderError);
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_NOT_JSON })).toThrow(UmpiParseError);
  });

  it("fails loudly and by name when the portal changes its field names", () => {
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_MISSING_FIELDS })).toThrow(/expUsdAmt|expTtwg/);
  });

  it("parses offline: no key, no network, no session", () => {
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_SINGLE_MONTH })).not.toThrow();
  });
});

describe("window arithmetic", () => {
  it("counts inclusive months for the completeness check", () => {
    expect(monthsBetween("2026-06", "2026-06")).toBe(1);
    expect(monthsBetween("2026-06", "2026-08")).toBe(3);
    expect(monthsBetween("2025-12", "2026-01")).toBe(2);
  });
});
