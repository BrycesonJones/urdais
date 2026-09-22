import { describe, expect, it } from "vitest";

import { productionIdentityFor, bokSeriesIdentity } from "../identity";
import {
  BOK_BAD_PERIOD,
  BOK_MALFORMED_VALUE,
  BOK_NOT_JSON,
  BOK_NO_RESULT,
  BOK_PROVIDER_ERROR,
  BOK_SINGLE_MONTH,
  BOK_THREE_MONTHS,
  BOK_WRONG_TABLE,
} from "./fixtures/bok";
import { assertBokIdentity, buildEcosUrl, fromEcosMonth, parseEcosPayload, toEcosMonth } from "./bok";
import { UmpiIdentityMismatchError, UmpiParseError, UmpiProviderError } from "./errors";

const identity = productionIdentityFor("UMPI-KR-DRAM-PPI") as Extract<
  ReturnType<typeof productionIdentityFor>,
  { kind: "bok_ecos_series" }
>;

describe("ECOS request identity", () => {
  it("names the exact approved series in the URL, in path order", () => {
    const url = buildEcosUrl({
      apiKey: "SECRET",
      identity,
      range: { fromMonth: "2026-06", toMonth: "2026-08" },
      start: 1,
      end: 1000,
    });
    expect(url).toContain("/StatisticSearch/");
    expect(url).toContain("/404Y016/M/202606/202608/30911201AA");
    // Not the export price table, ever.
    expect(url).not.toContain("402Y016");
  });

  it("refuses to run against any identity but the approved one", () => {
    expect(() => assertBokIdentity(identity)).not.toThrow();
    const exportTable = bokSeriesIdentity({ statCode: "404Y014", itemCode: "30911201AA", cycle: "M", groupDimensions: {} });
    expect(() => assertBokIdentity(exportTable)).toThrow(UmpiIdentityMismatchError);
  });

  it("converts months to and from the YYYYMM the service uses", () => {
    expect(toEcosMonth("2026-06")).toBe("202606");
    expect(fromEcosMonth("202606")).toBe("2026-06");
    expect(fromEcosMonth("2026")).toBeNull();
    expect(fromEcosMonth("202613")).toBeNull();
  });
});

describe("ECOS parsing", () => {
  it("reads a single month, keeping the agency's level and base unchanged", () => {
    const result = parseEcosPayload({ identity, payload: BOK_SINGLE_MONTH });
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0]!;
    expect(row.state).toBe("admitted");
    if (row.state !== "admitted") return;
    expect(row.observation).toMatchObject({
      kind: "bok_index_level",
      referenceMonth: "2026-06",
      indexLevel: 100,
      baseLabel: "2020=100",
    });
    expect(row.provenanceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sourceMetadata).toMatchObject({ statCode: "404Y016", itemCode: "30911201AA", cycle: "M" });
  });

  it("reads a multi-month range in order", () => {
    const result = parseEcosPayload({ identity, payload: BOK_THREE_MONTHS });
    const months = result.rows.map((row) => (row.state === "admitted" ? row.observation.referenceMonth : null));
    expect(months).toEqual(["2026-06", "2026-07", "2026-08"]);
  });

  it("refuses a response from the export price table rather than accepting the item code", () => {
    // The single most important assertion in this file: same item code, different table.
    expect(() => parseEcosPayload({ identity, payload: BOK_WRONG_TABLE })).toThrow(UmpiIdentityMismatchError);
  });

  it("treats a provider error as an error, never as an empty month", () => {
    expect(() => parseEcosPayload({ identity, payload: BOK_PROVIDER_ERROR })).toThrow(UmpiProviderError);
    expect(() => parseEcosPayload({ identity, payload: BOK_NO_RESULT })).toThrow(UmpiProviderError);
  });

  it("fails loudly on a payload that is not JSON or not the documented shape", () => {
    expect(() => parseEcosPayload({ identity, payload: BOK_NOT_JSON })).toThrow(UmpiParseError);
    expect(() => parseEcosPayload({ identity, payload: JSON.stringify({ Something: {} }) })).toThrow(UmpiParseError);
  });

  it("rejects bad rows individually, with a reason, instead of coercing them", () => {
    const malformed = parseEcosPayload({ identity, payload: BOK_MALFORMED_VALUE });
    expect(malformed.rows[0]).toMatchObject({ state: "rejected", code: "non_numeric_value" });
    const badPeriod = parseEcosPayload({ identity, payload: BOK_BAD_PERIOD });
    expect(badPeriod.rows[0]).toMatchObject({ state: "rejected", code: "malformed_reference_month" });
  });

  it("parses offline: no key, no network", () => {
    // The parser is a pure function of the payload; this whole file proves it.
    expect(() => parseEcosPayload({ identity, payload: BOK_SINGLE_MONTH })).not.toThrow();
  });
});
