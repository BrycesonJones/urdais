import { describe, expect, it } from "vitest";

import { customsSeriesIdentity } from "../identity";
import {
  CUSTOMS_AGGREGATE_HS,
  CUSTOMS_COUNTRY_DIMENSION,
  CUSTOMS_DUPLICATE_MONTH,
  CUSTOMS_GATEWAY_ERROR,
  CUSTOMS_MALFORMED_VALUE,
  CUSTOMS_MISSING_FIELDS,
  CUSTOMS_NO_DATA,
  CUSTOMS_SERVICE_ERROR,
  CUSTOMS_SINGLE_MONTH,
  CUSTOMS_THREE_MONTHS,
  CUSTOMS_WRONG_HS,
  CUSTOMS_YEAR_TOTAL,
  CUSTOMS_ZERO_VALUE,
  CUSTOMS_ZERO_WEIGHT,
} from "./fixtures/customs";
import {
  CUSTOMS_COUNTRY_DIMENSION_DATASET_ID,
  CUSTOMS_ITEM_TRADE_DATASET_ID,
  assertAggregateDataset,
  buildCustomsUrl,
  parseCustomsPayload,
} from "./customs";
import { UmpiIdentityMismatchError, UmpiProviderError } from "./errors";

const identity = customsSeriesIdentity({ hsCode: "8542321010", datasetId: CUSTOMS_ITEM_TRADE_DATASET_ID });

describe("the aggregation decision", () => {
  it("reads the aggregate-by-item operation and refuses the country-dimension dataset", () => {
    expect(() => assertAggregateDataset(identity)).not.toThrow();
    const countryDimension = customsSeriesIdentity({
      hsCode: "8542321010",
      datasetId: CUSTOMS_COUNTRY_DIMENSION_DATASET_ID,
    });
    expect(() => assertAggregateDataset(countryDimension)).toThrow(UmpiIdentityMismatchError);
  });

  it("sends no country parameter at all", () => {
    const url = buildCustomsUrl({ apiKey: "SECRET", identity, range: { fromMonth: "2026-06", toMonth: "2026-06" } });
    expect(url).toContain("/Itemtrade/getItemtradeList");
    expect(url).toContain("hsSgn=8542321010");
    expect(url).toContain("strtYymm=202606");
    expect(url).toContain("endYymm=202606");
    // If a country parameter ever appears here, the series has stopped being Korea-wide.
    expect(url).not.toContain("cntyCd");
  });

  it("refuses a response carrying a country breakdown rather than summing it", () => {
    // The failure this adapter exists to prevent: summing per-country rows into a national
    // total, with no way to know whether a total row is already among them.
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_COUNTRY_DIMENSION })).toThrow(UmpiIdentityMismatchError);
  });

  it("refuses two rows for one month even when no country field is present", () => {
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_DUPLICATE_MONTH })).toThrow(/must not be summed/);
  });

  it("never lets a year total become a month", () => {
    const result = parseCustomsPayload({ identity, payload: CUSTOMS_YEAR_TOTAL });
    expect(result.rows[0]).toMatchObject({ state: "rejected", code: "malformed_reference_month" });
  });
});

describe("Customs parsing", () => {
  it("reads export value and weight, and ignores the import fields entirely", () => {
    const result = parseCustomsPayload({ identity, payload: CUSTOMS_SINGLE_MONTH });
    const row = result.rows[0]!;
    expect(row.state).toBe("admitted");
    if (row.state !== "admitted") return;
    expect(row.observation).toEqual({
      kind: "kcs_trade_month",
      referenceMonth: "2026-06",
      exportValueUsd: 1_000_000,
      exportWeightKg: 10_000,
    });
    // Imports are CIF and are never part of the ratio.
    expect(JSON.stringify(row.observation)).not.toContain("imp");
  });

  it("reads a multi-month range, one row per month", () => {
    const result = parseCustomsPayload({ identity, payload: CUSTOMS_THREE_MONTHS });
    expect(result.rows.map((r) => (r.state === "admitted" ? r.observation.referenceMonth : null))).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
    ]);
  });

  it("cannot ingest another commodity", () => {
    for (const payload of [CUSTOMS_WRONG_HS, CUSTOMS_AGGREGATE_HS]) {
      const result = parseCustomsPayload({ identity, payload });
      expect(result.rows[0]).toMatchObject({ state: "rejected", code: "hs_code_mismatch" });
      expect(result.rows.some((r) => r.state === "admitted")).toBe(false);
    }
  });

  it("admits a zero export value and rejects a zero export weight", () => {
    expect(parseCustomsPayload({ identity, payload: CUSTOMS_ZERO_VALUE }).rows[0]).toMatchObject({ state: "admitted" });
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

  it("distinguishes no data from an error", () => {
    const empty = parseCustomsPayload({ identity, payload: CUSTOMS_NO_DATA });
    expect(empty.rows).toHaveLength(0);
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_SERVICE_ERROR })).toThrow(UmpiProviderError);
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_GATEWAY_ERROR })).toThrow(UmpiProviderError);
  });

  it("fails loudly and by name when the agency changes its field names", () => {
    expect(() => parseCustomsPayload({ identity, payload: CUSTOMS_MISSING_FIELDS })).toThrow(/hsCd/);
  });
});
