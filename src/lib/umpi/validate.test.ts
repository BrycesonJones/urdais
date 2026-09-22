import { describe, expect, it } from "vitest";

import { customsSeriesIdentity, productionIdentityFor } from "./identity";
import { admit } from "./validate";
import type { UmpiRawObservation } from "./types";

const bokIdentity = productionIdentityFor("UMPI-KR-DRAM-PPI");
const kcsIdentity = productionIdentityFor("UMPI-KR-DRAM-EXPORT-UV");

const bokRow = (over: Partial<Extract<UmpiRawObservation, { kind: "bok_index_level" }>> = {}) =>
  ({ kind: "bok_index_level", referenceMonth: "2026-06", indexLevel: 100, baseLabel: "2020=100", ...over }) as UmpiRawObservation;
const kcsRow = (over: Partial<Extract<UmpiRawObservation, { kind: "kcs_trade_month" }>> = {}) =>
  ({ kind: "kcs_trade_month", referenceMonth: "2026-06", exportValueUsd: 1_000_000, exportWeightKg: 10_000, ...over }) as UmpiRawObservation;

describe("admission", () => {
  it("admits a well-formed row from the identity the series is bound to", () => {
    expect(admit({ expectedIdentity: bokIdentity, actualIdentity: bokIdentity, observation: bokRow() }).state).toBe("admitted");
    expect(admit({ expectedIdentity: kcsIdentity, actualIdentity: kcsIdentity, observation: kcsRow() }).state).toBe("admitted");
  });

  it("rejects a row from a different source identity", () => {
    const wrongDataset = customsSeriesIdentity({ hsCode: "8542321010", datasetId: "15101609" });
    const result = admit({ expectedIdentity: kcsIdentity, actualIdentity: wrongDataset, observation: kcsRow() });
    expect(result).toMatchObject({ state: "rejected", code: "identity_mismatch" });
  });

  it("rejects an observation shape the source cannot produce", () => {
    const result = admit({ expectedIdentity: bokIdentity, actualIdentity: bokIdentity, observation: kcsRow() });
    expect(result).toMatchObject({ state: "rejected", code: "observation_kind_mismatch" });
  });

  it("rejects a malformed reference month rather than repairing it", () => {
    for (const month of ["2026-6", "2026-13", "2026-06-01", "June 2026", ""]) {
      expect(admit({ expectedIdentity: bokIdentity, actualIdentity: bokIdentity, observation: bokRow({ referenceMonth: month }) })).toMatchObject({
        state: "rejected",
        code: "malformed_reference_month",
      });
    }
  });

  it("rejects a non-positive or non-numeric index level", () => {
    expect(admit({ expectedIdentity: bokIdentity, actualIdentity: bokIdentity, observation: bokRow({ indexLevel: 0 }) })).toMatchObject({
      code: "non_positive_index_level",
    });
    expect(admit({ expectedIdentity: bokIdentity, actualIdentity: bokIdentity, observation: bokRow({ indexLevel: -5 }) })).toMatchObject({
      code: "non_positive_index_level",
    });
    expect(admit({ expectedIdentity: bokIdentity, actualIdentity: bokIdentity, observation: bokRow({ indexLevel: Number.NaN }) })).toMatchObject({
      code: "non_numeric_value",
    });
  });

  it("rejects negative trade figures and a zero export weight", () => {
    expect(admit({ expectedIdentity: kcsIdentity, actualIdentity: kcsIdentity, observation: kcsRow({ exportValueUsd: -1 }) })).toMatchObject({
      code: "negative_export_value",
    });
    expect(admit({ expectedIdentity: kcsIdentity, actualIdentity: kcsIdentity, observation: kcsRow({ exportWeightKg: -1 }) })).toMatchObject({
      code: "negative_export_weight",
    });
    // Caught at admission, where the reason survives, rather than at the division.
    expect(admit({ expectedIdentity: kcsIdentity, actualIdentity: kcsIdentity, observation: kcsRow({ exportWeightKg: 0 }) })).toMatchObject({
      code: "zero_export_weight",
    });
  });

  it("admits a zero export value against a real weight, which is a real month", () => {
    // Nothing shipped in dollars but weight moved is implausible, not impossible, and it is not
    // this layer's job to decide. It is admitted and flagged downstream, not silently dropped.
    expect(admit({ expectedIdentity: kcsIdentity, actualIdentity: kcsIdentity, observation: kcsRow({ exportValueUsd: 0 }) }).state).toBe("admitted");
  });
});
