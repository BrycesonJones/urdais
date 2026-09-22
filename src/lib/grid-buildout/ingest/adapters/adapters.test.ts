/**
 * Adapter behaviour for Grid Buildout Velocity.
 *
 * The fixtures reproduce the awkwardnesses the real workbooks turned out to have rather than a
 * tidy version of them: a status column that disagrees with the sheet it sits on, a completion
 * date written as year 9999, mileage that is sometimes an explicit zero and sometimes genuinely
 * blank, a project number used twice, and a status vocabulary spelled four different ways.
 */

import { describe, expect, it } from "vitest";

import { caisoBuildoutAdapter, CAISO_ARTIFACT_URL, CAISO_EXCLUDED_INTERCONNECTION_ARTIFACT_URL }
  from "@/lib/grid-buildout/ingest/adapters/caiso";
import {
  ERCOT_COLUMNS, ERCOT_CONTACT_COLUMN_INDEX, ercotBuildoutAdapter, ercotReadableColumnIndexes,
} from "@/lib/grid-buildout/ingest/adapters/ercot";
import { parseQuantity, parseSpreadsheetDate, serialToUtc } from "@/lib/grid-buildout/dates";
import { BuildoutSourceShapeError } from "@/lib/grid-buildout/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { buildFixtureWorkbook, sheetFromGrid, type FixtureCell }
  from "@/lib/power-delivery/planning/xlsx/fixture-workbook";

/** Excel serials for the dates the fixtures use. 2958101 is 9999-01-01, ERCOT's placeholder. */
const SERIAL = { jan2025: 45681, jun2026: 46184, sentinel: 2958101 };

const ERCOT_HEADERS: Record<string, string> = {
  A: "ERCOT Project Number",
  B: "Project Title (text, please start with location name first)",
  C: "Project Description (text)",
  G: 'Transmission Status "under construction, planned or conceptual"',
  H: "Associated Projects (project number) (Optional)",
  I: "Transmission Owner (text)",
  J: "TSP/Company Contact",
  L: "Projected In-Service Date (Month/Yr)",
  M: "Actual In-Service Date (Month/Yr)",
  N: "Service Level kV",
  O: "Trans Circuit Miles New",
  P: "Trans Circuit Miles Rebuilt, Reconductored or Upgraded",
  U: "Planning Charter Tier",
  X: "Date RPG Review Completed (Month/Yr)",
};

function ercotSheet(name: string, rows: Record<number, Record<string, FixtureCell>>) {
  return sheetFromGrid(name, { 2: ERCOT_HEADERS, ...rows });
}

function artifact(body: Buffer): RetrievedArtifact {
  return {
    label: "fixture", url: "https://example.invalid/workbook.xlsx",
    retrievedAt: "2026-09-22T00:00:00.000Z", status: 200,
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    byteLength: body.byteLength, sha256: "0".repeat(64), body,
  };
}

function ercotFixture(): RetrievedArtifact {
  return artifact(buildFixtureWorkbook([
    ercotSheet("FutureTPIT071326NoCost", {
      // A project number used twice inside one sheet, exactly as the real Future sheet does.
      3: { A: "110733", B: "Alpha Switch", G: "Planned", I: "Oncor", L: SERIAL.jun2026, N: 138, O: 0, P: 0, U: "Tier 4" },
      4: { A: "110733", B: "Alpha Switch phase two", G: "Conceptual", I: "Oncor", L: SERIAL.jun2026, N: 138, O: 2.5, P: 0, U: "Tier 4" },
      // Wording suggests generation but nothing states it: a signal, not a classification.
      5: { A: "200001", B: "Expand substation for Bravo Solar", G: "Under Construction", I: "AEP", L: SERIAL.jun2026, N: 345, U: "Tier 3" },
      // An explicit interconnection request number is publisher evidence.
      6: { A: "200002", B: "Charlie BESS interconnection (23INR0419)", G: "Planned", I: "AEP", L: SERIAL.jun2026, N: 345, U: "Tier 4" },
      // No status at all, on a sheet that asserts none either.
      7: { A: "200003", B: "Delta rebuild", I: "LCRA", L: SERIAL.jun2026, N: 69, U: "Tier 4" },
    }),
    ercotSheet("PlannedTPIT071326NoCost", {
      3: { A: "300001", B: "Echo Switch", G: "Planned", I: "Oncor", L: SERIAL.jun2026, N: 138, U: "Tier 4" },
    }),
    ercotSheet("CompletedTPIT071326NoCost", {
      // The status column says Planned on a sheet that asserts completion. Membership wins.
      3: { A: "400001", B: "Foxtrot Substation", G: "Planned", I: "Oncor", L: SERIAL.jan2025, M: SERIAL.jan2025, N: 138, O: 0, P: 0, U: "Tier 4", X: SERIAL.jan2025 },
      // Complete, with ERCOT's placeholder where the date belongs.
      4: { A: "400002", B: "Golf 138 kV POD", G: "In-Service", I: "CenterPoint", L: SERIAL.jan2025, M: SERIAL.sentinel, N: 138, O: 0, U: "Tier 4" },
      // Mileage genuinely blank in one column and an explicit zero in the other.
      5: { A: "400003", B: "Hotel Line Rebuild", G: "In-Service", H: "400001", I: "Oncor", L: SERIAL.jan2025, M: SERIAL.jan2025, N: 345, P: 12.5, U: "Tier 1" },
    }),
    ercotSheet("CancelledTPIT071326NoCost", {
      3: { A: "500001", B: "India Switch", G: "Planned", I: "Oncor", L: SERIAL.jun2026, N: 138, U: "Tier 4" },
    }),
    sheetFromGrid("TransmissionOwnerProjContac", {
      1: { A: "TRANSMISSION OWNER", B: "Primary Contact", C: "Primary Email Address", D: "Primary Phone" },
      2: { A: "Oncor", B: "A Person", C: "person@example.invalid", D: "555-0100" },
    }),
  ]));
}

describe("ERCOT TPIT adapter", () => {
  const parsed = ercotBuildoutAdapter.parse(ercotFixture());
  const list = (name: string) => parsed.lists.find((item) => item.name === name)!;
  const row = (name: string, nativeId: string) =>
    list(name).rows.find((item) => item.nativeId === nativeId)!;

  it("reads the four lifecycle sheets and no others", () => {
    expect(parsed.lists.map((item) => item.name).sort())
      .toEqual(["cancelled", "completed", "future", "planned"]);
  });

  it("takes lifecycle from sheet membership, not from the optional status column", () => {
    // The real workbook disagrees this way on 117 of 262 completed rows.
    const completed = row("completed", "400001");
    expect(completed.nativeStatus).toBe("Planned");
    expect(completed.lifecycle).toEqual({ state: "in_service", basis: "source_list_membership" });
    expect(row("cancelled", "500001").lifecycle)
      .toEqual({ state: "cancelled", basis: "source_list_membership" });
  });

  it("records a deferral when the status column contradicts the sheet", () => {
    const contradictions = parsed.deferrals.filter((item) => item.reason === "status_contradicts_list");
    expect(contradictions.map((item) => item.nativeKey)).toContain("400001");
  });

  it("keeps a sentinel completion date unknown while the project stays in service", () => {
    const golf = row("completed", "400002");
    expect(golf.lifecycle.state).toBe("in_service");
    const actual = golf.milestones.find((item) => item.kind === "actual_in_service")!;
    expect(actual.quality).toBe("sentinel_unknown");
    expect(actual.date).toBeNull();
    expect(actual.native).toBe(String(SERIAL.sentinel));
    expect(parsed.deferrals.some((item) => item.reason === "sentinel_date" && item.nativeKey === "400002")).toBe(true);
  });

  it("falls back to the status column only where the sheet asserts no state", () => {
    expect(row("future", "200001").lifecycle).toEqual({ state: "under_construction", basis: "native_status_text" });
    expect(row("future", "200003").lifecycle).toEqual({ state: "unknown", basis: "unmapped" });
  });

  it("keeps an empty mileage cell distinct from a reported zero", () => {
    const hotel = row("completed", "400003");
    const miles = (kind: string) => hotel.quantities.find((item) => item.kind === kind)!;
    // Blank: the publisher said nothing, and nothing is not zero.
    expect(miles("circuit_miles_new")).toMatchObject({ isReported: false, value: null });
    expect(miles("circuit_miles_rebuilt")).toMatchObject({ isReported: true, value: 12.5 });
    // Explicit zero on another row is reported, and stays distinguishable from the blank above.
    const foxtrot = row("completed", "400001");
    expect(foxtrot.quantities.find((item) => item.kind === "circuit_miles_new"))
      .toMatchObject({ isReported: true, value: 0 });
  });

  it("classifies a driver only on publisher evidence, never on wording", () => {
    // An interconnection request number is an identifier ERCOT itself printed.
    expect(row("future", "200002").driver)
      .toMatchObject({ klass: "generator_interconnection", basis: "publisher_identifier" });
    // "Solar" in a title is a signal and nothing more.
    expect(row("future", "200001").driver).toMatchObject({ klass: "unknown", basis: "text_signal_only" });
    expect(parsed.deferrals.some((item) => item.reason === "driver_signal_only" && item.nativeKey === "200001")).toBe(true);
    expect(row("completed", "400002").driver)
      .toMatchObject({ klass: "load_interconnection", basis: "publisher_identifier" });
  });

  it("retains both rows when one project number is used twice", () => {
    expect(list("future").rows.filter((item) => item.nativeId === "110733")).toHaveLength(2);
  });

  it("keeps only relationships the publisher stated", () => {
    expect(row("completed", "400003").relationships)
      .toContainEqual({ kind: "associated_with", relatedNativeId: "400001" });
    expect(row("completed", "400001").relationships).toHaveLength(0);
  });

  it("never reads the contact column or the contact sheet", () => {
    expect(ercotReadableColumnIndexes()).not.toContain(ERCOT_CONTACT_COLUMN_INDEX);
    expect(Object.values(ERCOT_COLUMNS)).not.toContain(ERCOT_CONTACT_COLUMN_INDEX);
    const payloads = parsed.lists.flatMap((item) => item.rows).map((item) => JSON.stringify(item.payload));
    for (const payload of payloads) {
      expect(payload).not.toMatch(/example\.invalid|555-0100|A Person/);
    }
  });

  it("refuses a workbook whose columns have moved", () => {
    const moved = buildFixtureWorkbook([
      ercotSheet("FutureTPIT071326NoCost", { 3: { A: "1", L: SERIAL.jun2026 } }),
      ercotSheet("PlannedTPIT071326NoCost", { 3: { A: "1" } }),
      sheetFromGrid("CompletedTPIT071326NoCost", { 2: { A: "Something Else" }, 3: { A: "1" } }),
      ercotSheet("CancelledTPIT071326NoCost", { 3: { A: "1" } }),
    ]);
    expect(() => ercotBuildoutAdapter.parse(artifact(moved))).toThrow(BuildoutSourceShapeError);
  });
});

const CAISO_HEADERS = {
  A: "TP Project ID",
  B: "Project",
  C: "PTO",
  D: "Transmission Plan Approved",
  E: "In-service Date at Approval in Transmission Plan",
  F: "Previous In-Service\nJan 2022 TDF",
  G: "Previous In-Service Jan 2025 TDF",
  H: "Current In-Service July 2026 TDF",
  I: "Project Status",
  J: "Expected CPUC Permit Application Filing",
  K: "Expected Construction Start",
  L: "Reason for ISD Change from Original Comitted Date",
  M: "Notes",
} as const satisfies Record<string, string>;

function caisoFixture(): RetrievedArtifact {
  return artifact(buildFixtureWorkbook([
    sheetFromGrid("Impact Category", { 1: { A: "legend", B: "ISO PUBLIC" } }),
    sheetFromGrid("PGaE", {
      1: { A: CAISO_HEADERS.A, B: CAISO_HEADERS.B, C: CAISO_HEADERS.C, D: CAISO_HEADERS.D,
           E: CAISO_HEADERS.E, F: CAISO_HEADERS.F, G: CAISO_HEADERS.G, H: CAISO_HEADERS.H,
           I: CAISO_HEADERS.I, J: CAISO_HEADERS.J, K: CAISO_HEADERS.K, L: CAISO_HEADERS.L, M: CAISO_HEADERS.M },
      2: { A: "2223-R-08", B: "Alpha Reinforcement", C: "PG&E", D: SERIAL.jan2025, E: SERIAL.jan2025,
           F: SERIAL.jan2025, G: SERIAL.jun2026, H: SERIAL.jun2026, I: "In-Flight",
           J: SERIAL.jan2025, K: "TBD", L: "Permitting delay" },
      3: { A: "2324-P-01", B: "Bravo Line", C: "PG&E", D: SERIAL.jan2025, E: SERIAL.jan2025,
           H: SERIAL.jun2026, I: "in flight", K: SERIAL.jun2026 },
      4: { A: "2425-R-02", B: "Charlie Bank", C: "PG&E", D: SERIAL.jan2025, I: "Cancelled" },
    }),
  ]));
}

describe("CAISO TDF adapter", () => {
  const parsed = caisoBuildoutAdapter.parse(caisoFixture());
  const rows = parsed.lists.flatMap((item) => item.rows);
  const row = (id: string) => rows.find((item) => item.nativeId === id)!;

  it("skips the legend and reads only owner sheets", () => {
    expect(parsed.lists.map((item) => item.name)).toEqual(["PGaE"]);
  });

  it("turns every vintage column into its own labelled milestone", () => {
    const alpha = row("2223-R-08");
    const prior = alpha.milestones.filter((item) => item.kind === "target_in_service_prior_vintage");
    expect(prior.map((item) => item.vintageLabel).sort()).toEqual(["Jan 2022", "Jan 2025"]);
    // The current column is a different kind, so it is never mistaken for history.
    expect(alpha.milestones.filter((item) => item.kind === "target_in_service_current")).toHaveLength(1);
    // And the frozen at-approval date is its own kind again.
    expect(alpha.milestones.filter((item) => item.kind === "target_in_service_at_approval")).toHaveLength(1);
  });

  it("keeps expected construction start expected, and TBD out of the date", () => {
    const start = row("2223-R-08").milestones.find((item) => item.kind === "construction_start_expected")!;
    expect(start.quality).toBe("sentinel_unknown");
    expect(start.date).toBeNull();
    expect(start.native).toBe("TBD");
    // There is no actual construction-start kind anywhere in the vocabulary.
    expect(rows.flatMap((item) => item.milestones).map((item) => item.kind))
      .not.toContain("construction_start_actual");
  });

  it("preserves uncontrolled status text without mapping it", () => {
    expect(row("2223-R-08").nativeStatus).toBe("In-Flight");
    expect(row("2223-R-08").lifecycle).toEqual({ state: "unknown", basis: "unmapped" });
    expect(row("2324-P-01").nativeStatus).toBe("in flight");
    expect(row("2324-P-01").lifecycle.state).toBe("unknown");
    // Only the one state GBV-1 found defensible is canonicalised.
    expect(row("2425-R-02").lifecycle).toEqual({ state: "cancelled", basis: "native_status_text" });
  });

  it("asserts no driver, because CAISO publishes no driver field", () => {
    for (const item of rows) expect(item.driver).toMatchObject({ klass: "unknown", basis: "none" });
  });

  it("names the generator-interconnection workbook only to exclude it", () => {
    expect(CAISO_EXCLUDED_INTERCONNECTION_ARTIFACT_URL).not.toBe(CAISO_ARTIFACT_URL);
    expect(caisoBuildoutAdapter.artifactUrl()).toBe(CAISO_ARTIFACT_URL);
    expect(caisoBuildoutAdapter.artifactUrl()).not.toContain("generation-interconnection");
  });

  it("refuses a workbook with no vintage history at all", () => {
    const flat = buildFixtureWorkbook([sheetFromGrid("PGaE", {
      1: { A: "TP Project ID", B: "Project", I: "Project Status" },
      2: { A: "1", B: "x", I: "In-Flight" },
    })]);
    expect(() => caisoBuildoutAdapter.parse(artifact(flat))).toThrow(BuildoutSourceShapeError);
  });
});

describe("spreadsheet value reading", () => {
  it("converts serials against the 1900 epoch Excel actually uses", () => {
    expect(serialToUtc(45681)).toEqual({ year: 2025, month: 1, day: 24 });
    expect(serialToUtc(2958101)).toEqual({ year: 9999, month: 1, day: 1 });
  });

  it("treats the sentinel year as unknown rather than as a date", () => {
    const parsed = parseSpreadsheetDate("2958101", { precision: "month" });
    expect(parsed).toMatchObject({ date: null, quality: "sentinel_unknown", precision: "none" });
  });

  it("refuses to invent a date from text it cannot read", () => {
    expect(parseSpreadsheetDate("sometime in 2027", { precision: "month" }).quality).toBe("unparseable");
    expect(parseSpreadsheetDate("", { precision: "month" }).quality).toBe("not_reported");
    expect(parseSpreadsheetDate(null, { precision: "month" }).quality).toBe("not_reported");
  });

  it("separates an empty quantity from a zero", () => {
    expect(parseQuantity(null)).toEqual({ value: null, isReported: false, native: null });
    expect(parseQuantity("0")).toEqual({ value: 0, isReported: true, native: "0" });
    expect(parseQuantity("12.5")).toEqual({ value: 12.5, isReported: true, native: "12.5" });
  });
});
