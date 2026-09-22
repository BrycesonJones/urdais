/**
 * Adapter parsing, against fixtures taken verbatim from real retrieved artifacts.
 *
 * The NYISO rows are from 2026-09-20 and 2005-02-01; the ERCOT rows from the 2026-09-21 17:05
 * artifact. Where a value looks odd -- a limit of 9999, a ConstraintID that repeats under a
 * different name -- it is odd in the source too.
 */

import { describe, expect, it } from "vitest";

import {
  ENTITY_KEY_SEPARATOR, ercotAdapter, ercotEntityKey, parseErcotCsv, parseErcotListing,
  parseErcotTimestamp,
} from "@/lib/transmission-headroom/ingest/adapters/ercot";
import {
  NYISO_USABLE_HISTORY_START, NyisoFormatError, marketToday, nyisoAdapter, nyisoDailyUrl,
  nyisoMonthlyArchiveUrl, parseNyisoCsv, parseNyisoTimestamp,
} from "@/lib/transmission-headroom/ingest/adapters/nyiso";

const NYISO_HEADER =
  "Timestamp,Interface Name,Point ID,Flow (MWH),Positive Limit (MWH),Negative Limit (MWH)";

const NYISO_ROWS = [
  NYISO_HEADER,
  "09/20/2026 00:00,CENTRAL EAST - VC,23330,1380.94,2730,-9999",
  "09/20/2026 00:00,SCH - PJM_NEPTUNE,325305,660,660,-660",
  "09/20/2026 00:00,SCH - HQ_CEDARS,325274,0,49,0",
  "09/20/2026 00:00,SCH - HQ_IMPORT_EXPORT,325376,-985,1310,-9899",
  "09/20/2026 00:00,WEST CENTRAL,23312,689.07,9999,-9999",
  "09/20/2026 04:39,MOSES SOUTH,23319,-607.7,3400,-1600",
].join("\n");

describe("NYISO parsing", () => {
  it("rejects a file whose columns have moved", () => {
    expect(() => parseNyisoCsv("A,B,C\n1,2,3", "fixture")).toThrow(NyisoFormatError);
  });

  it("parses one row per published observation and invents none", () => {
    const result = parseNyisoCsv(NYISO_ROWS, "fixture");
    expect(result.observations).toHaveLength(6);
    expect(result.deferrals).toHaveLength(0);
  });

  it("identifies an interface by Point ID, keeping the name as a display attribute", () => {
    const [first] = parseNyisoCsv(NYISO_ROWS, "fixture").observations;
    expect(first!.nativeEntityKey).toBe("23330");
    expect(first!.nativeName).toBe("CENTRAL EAST - VC");
    expect(first!.entityKind).toBe("interface");
  });

  it("keeps both limits, signed, exactly as published", () => {
    const [first] = parseNyisoCsv(NYISO_ROWS, "fixture").observations;
    expect(first!.limits).toEqual([
      { nativeField: "Positive Limit (MWH)", direction: "positive", rawValue: "2730", limitMw: 2730 },
      { nativeField: "Negative Limit (MWH)", direction: "negative", rawValue: "-9999", limitMw: -9999 },
    ]);
  });

  it("carries the -9899 real limit through unchanged", () => {
    const row = parseNyisoCsv(NYISO_ROWS, "fixture").observations
      .find((observation) => observation.nativeEntityKey === "325376");
    expect(row!.limits[1]!.limitMw).toBe(-9899);
  });

  it("records the publisher's unit label rather than correcting it", () => {
    const [first] = parseNyisoCsv(NYISO_ROWS, "fixture").observations;
    expect(first!.unitAsPublished).toBe("MWH");
  });

  it("has no contingency concept, because the source publishes an all-in operating limit", () => {
    for (const observation of parseNyisoCsv(NYISO_ROWS, "fixture").observations) {
      expect(observation.contingencyKind).toBe("not_applicable");
    }
  });

  it("keeps an off-grid timestamp exactly as published", () => {
    const row = parseNyisoCsv(NYISO_ROWS, "fixture").observations
      .find((observation) => observation.nativeTimestamp === "09/20/2026 04:39");
    expect(row).toBeDefined();
    expect(row!.observedAt.toISOString()).toBe("2026-09-20T08:39:00.000Z");
  });

  it("defers a malformed numeric instead of dropping the row silently", () => {
    const result = parseNyisoCsv(
      `${NYISO_HEADER}\n09/20/2026 00:00,X,23312,not-a-number,100,-100`, "fixture");
    expect(result.observations).toHaveLength(0);
    expect(result.deferrals[0]!.reason).toBe("malformed_numeric");
  });

  it("keeps a row whose flow is good but whose limit is blank, and defers the limit", () => {
    const result = parseNyisoCsv(
      `${NYISO_HEADER}\n09/20/2026 00:00,X,23312,100,,-100`, "fixture");
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]!.limits).toHaveLength(1);
    expect(result.deferrals[0]!.reason).toBe("missing_required_field");
  });

  it("marks the timestamp zone as assumed rather than claiming UTC", () => {
    const [first] = parseNyisoCsv(NYISO_ROWS, "fixture").observations;
    expect(first!.timestampZoneStatus).toBe("assumed_market_local");
  });

  it("parses a 2005-era timestamp carrying seconds", () => {
    const parsed = parseNyisoTimestamp("02/01/2005 00:01:35");
    expect(parsed).not.toBeNull();
    expect(parsed!.at.toISOString()).toBe("2005-02-01T05:01:35.000Z");
  });

  it("builds daily and monthly URLs over HTTPS", () => {
    expect(nyisoDailyUrl(new Date(Date.UTC(2026, 8, 20)))).toBe(
      "https://mis.nyiso.com/public/csv/ExternalLimitsFlows/20260920ExternalLimitsFlows.csv");
    expect(nyisoMonthlyArchiveUrl(2005, 2)).toBe(
      "https://mis.nyiso.com/public/csv/ExternalLimitsFlows/20050201ExternalLimitsFlows_csv.zip");
  });

  it("names today's file by NYISO's calendar day, not the machine's UTC day", async () => {
    // 00:35 UTC on the 22nd is still 20:35 on the 21st in New York, and the 22nd file does not
    // exist yet. Deriving the name from UTC would request a 404 every evening.
    expect(marketToday(new Date("2026-09-22T00:35:00Z"))).toBe("20260921");
    expect(marketToday(new Date("2026-09-21T12:00:00Z"))).toBe("20260921");
    const refs = await nyisoAdapter.discover({ fetchText: async () => "" });
    expect(refs[0]!.url).toContain(`${marketToday()}ExternalLimitsFlows.csv`);
  });

  it("refuses to discover archives before the first usable month", async () => {
    const refs = await nyisoAdapter.discover({
      window: { start: new Date("2002-01-01T00:00:00Z"), end: new Date("2005-03-01T00:00:00Z") },
      fetchText: async () => "",
    });
    expect(refs[0]!.coverageStart).toBe(NYISO_USABLE_HISTORY_START);
  });
});

const ERCOT_HEADER = [
  "SCEDTimeStamp", "RepeatedHourFlag", "ConstraintID", "ConstraintName", "ContingencyName",
  "ShadowPrice", "MaxShadowPrice", "Limit", "Value", "ViolatedMW",
  "FromStation", "ToStation", "FromStationkV", "ToStationkV", "CCTStatus",
].join(",");

const ERCOT_ROWS = [
  ERCOT_HEADER,
  "09/21/2026 16:55:23,N,24,CONCHO_HARI1_A,XBAL89,0,2800,29.4,29.3,-0.2,CONCHO,HARI,69,69,NONCOMP",
  "09/21/2026 16:55:23,N,27,NELRIO,BASE CASE,49.92439,5251,867,867,0,,,0,0,NONCOMP",
  "09/21/2026 16:55:23,N,2,NELRIO,XBAL89,0,2800,900,880,-20,,,0,0,COMP",
  "09/21/2026 16:55:23,N,16,EASTEX,BASE CASE,0,2800,85999.1,2553.1,-83446,,,0,0,NONCOMP",
].join("\n");

describe("ERCOT parsing", () => {
  it("identifies a constraint by (name, contingency), never by ConstraintID", () => {
    const observations = parseErcotCsv(ERCOT_ROWS, "fixture").observations;
    const nelrio = observations.filter((o) => o.nativeName === "NELRIO");
    expect(nelrio).toHaveLength(2);
    expect(new Set(nelrio.map((o) => o.nativeEntityKey)).size).toBe(2);
    expect(nelrio[0]!.nativeEntityKey).toBe(ercotEntityKey("NELRIO", "BASE CASE"));
    expect(nelrio.map((o) => o.nativeMetadata.ConstraintID)).toEqual(["27", "2"]);
  });

  it("joins the identity pair on a separator PostgreSQL can store", () => {
    expect(ENTITY_KEY_SEPARATOR).toBe(String.fromCharCode(0x1f));
    expect(ercotEntityKey("A", "B")).not.toContain(String.fromCharCode(0));
  });

  it("models BASE CASE and a named contingency as different kinds", () => {
    const observations = parseErcotCsv(ERCOT_ROWS, "fixture").observations;
    expect(observations[0]!.contingencyKind).toBe("post_contingency");
    expect(observations[1]!.contingencyKind).toBe("base_case");
    expect(observations[1]!.nativeContingencyName).toBe("BASE CASE");
  });

  it("keeps CCTStatus as metadata and never as an eligibility signal", () => {
    const observations = parseErcotCsv(ERCOT_ROWS, "fixture").observations;
    expect(observations.map((o) => o.nativeMetadata.CCTStatus))
      .toEqual(["NONCOMP", "NONCOMP", "COMP", "NONCOMP"]);
    expect(observations).toHaveLength(4);
  });

  it("keeps the source shadow price rather than deriving binding from the margin", () => {
    const observations = parseErcotCsv(ERCOT_ROWS, "fixture").observations;
    const nelrioBase = observations.find((o) => o.nativeMetadata.ConstraintID === "27");
    expect(nelrioBase!.nativeMetadata.ShadowPrice).toBe("49.92439");
    expect(Number(nelrioBase!.payload.Limit) - Number(nelrioBase!.payload.Value)).toBe(0);
  });

  it("retains an implausible limit as evidence rather than dropping the row", () => {
    const eastex = parseErcotCsv(ERCOT_ROWS, "fixture").observations
      .find((o) => o.nativeName === "EASTEX");
    expect(eastex).toBeDefined();
    expect(eastex!.limits[0]!.limitMw).toBe(85_999.1);
  });

  it("publishes a single undirected limit", () => {
    const [first] = parseErcotCsv(ERCOT_ROWS, "fixture").observations;
    expect(first!.limits).toHaveLength(1);
    expect(first!.limits[0]!.direction).toBe("undirected");
    expect(first!.unitAsPublished).toBe("MW");
  });

  it("treats a repeated (constraint, contingency, interval) as an identity collision", () => {
    const lines = ERCOT_ROWS.split("\n");
    const duplicated = [ERCOT_HEADER, lines[1], lines[1]].join("\n");
    const result = parseErcotCsv(duplicated, "fixture");
    expect(result.observations).toHaveLength(1);
    expect(result.deferrals[0]!.reason).toBe("identity_collision");
  });

  it("parses Central clock time", () => {
    const parsed = parseErcotTimestamp("09/21/2026 16:55:23", false);
    expect(parsed!.at.toISOString()).toBe("2026-09-21T21:55:23.000Z");
    expect(parsed!.ambiguous).toBe(false);
  });

  it("marks the repeated autumn hour ambiguous instead of guessing", () => {
    const parsed = parseErcotTimestamp("11/01/2026 01:30:00", true);
    expect(parsed!.ambiguous).toBe(true);
  });

  it("reads the MIS listing into (artifact, doclookupId) pairs", () => {
    const html = "<td class='labelOptional_ind'>cdr.00012302.0000000000000000.20260921.170501142"
      + ".SCEDBTCNP686_csv.zip</td><td><div align='center'>"
      + "<a href=\"/misdownload/servlets/mirDownload?doclookupId=1277334964'>zip</a></div></td>";
    expect(parseErcotListing(html)).toEqual([{
      name: "cdr.00012302.0000000000000000.20260921.170501142.SCEDBTCNP686_csv.zip",
      id: "1277334964",
    }]);
  });

  it("declares ERCOT rows as elements, not interfaces", () => {
    expect(ercotAdapter.entityKind).toBe("element");
    expect(parseErcotCsv(ERCOT_ROWS, "fixture").observations[0]!.entityKind).toBe("element");
  });
});
