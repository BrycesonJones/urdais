/**
 * PJM — 2026 Load Forecast Report, the independent staff forecast published on pjm.com.
 *
 * Read from `2026-load-report-data.xlsx`, which states one row per zone, year and month with a
 * peak in MW and energy in GWh, and carries a sheet per zone plus `PJM_RTO` for the whole
 * control area. It is the least ambiguous artifact PJM publishes: every column is named and
 * every row is self-describing.
 *
 * Not read, and not from Data Miner under any circumstances: Data Miner 2 carries a derived-data
 * ban and is a different interface with different terms. PJM's rights position here rests on
 * pjm.com alone.
 *
 * Also not read: the report's own Tables B-11 and B-12, which state the headline summer and
 * winter unrestricted peaks. Their year headers are merged across a leading column that carries
 * a value with no label, so a column-to-year mapping cannot be established from the workbook
 * without assuming which year the unlabelled column belongs to. That assumption is exactly the
 * kind this phase refuses to make, so the headline seasonal peaks are deferred rather than
 * guessed, and the monthly series PJM publishes unambiguously is ingested instead.
 */

import { XlsxWorkbook, cellNumber } from "@/lib/power-delivery/planning/xlsx/workbook";
import {
  PlanningSourceFormatError,
  type ExtractedPlanningRecord, type PlanningAdapter, type PlanningExtraction,
} from "@/lib/power-delivery/planning/ingest/types";
import type { GeographicGrain } from "@/lib/power-delivery/planning/types";

const ARTIFACT = {
  label: "2026-load-report-data",
  url: "https://www.pjm.com/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report-data.xlsx",
} as const;

const HEADER = ["ZONE_NAME", "YEAR", "MONTH", "PEAK_MW", "ENERGY_GWH"] as const;
const COLUMNS = ["A", "B", "C", "D", "E"] as const;

/** The whole control area. Only this sheet may produce a balancing-authority point. */
const WHOLE_MARKET_SHEET = "PJM_RTO";

/** Sheets PJM publishes as aggregates of several zones rather than as a single zone. */
const AGGREGATE_SHEETS = new Set([
  "PJM_WEST", "PJM_MA", "CENTRALMA", "WESTERNMA", "EASTERNMA", "SOUTHERNMA", "FE_EAST", "PLGRP",
]);

const SCENARIO_KEY = "PJM_Staff_Forecast";

function grainOf(sheetName: string): GeographicGrain {
  if (sheetName === WHOLE_MARKET_SHEET) return "balancing_authority";
  return AGGREGATE_SHEETS.has(sheetName) ? "sub_region" : "zone";
}

export const pjmAdapter: PlanningAdapter = {
  key: "pjm",
  marketSlug: "pjm",
  sourceInterfaceSlug: "pjm-load-forecast-report",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): PlanningExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) throw new PlanningSourceFormatError("pjm", `artifact ${ARTIFACT.label} was not retrieved`);
    const workbook = XlsxWorkbook.open(artifact.body);
    if (!workbook.hasSheet(WHOLE_MARKET_SHEET)) {
      throw new PlanningSourceFormatError("pjm", `workbook has no ${WHOLE_MARKET_SHEET} sheet; the RTO total cannot be identified`);
    }

    const records: ExtractedPlanningRecord[] = [];
    for (const sheetName of workbook.sheetNames()) {
      const sheet = workbook.sheet(sheetName);
      const header = sheet.rows.find((row) => row.row === 1);
      if (header === undefined) throw new PlanningSourceFormatError("pjm", `sheet ${sheetName} has no header row`);
      HEADER.forEach((expected, index) => {
        const actual = header.cells.get(COLUMNS[index]!)?.value;
        if (actual !== expected) {
          throw new PlanningSourceFormatError(
            "pjm",
            `sheet ${sheetName} expected column ${COLUMNS[index]} to be ${expected} but found ${actual ?? "an empty cell"}`,
          );
        }
      });

      const grain = grainOf(sheetName);
      const wholeMarket = grain === "balancing_authority";
      let sheetZone: string | null = null;
      for (const row of sheet.rows.filter((candidate) => candidate.row > 1)) {
        const zone = row.cells.get("A")?.value;
        const year = cellNumber(row.cells.get("B"));
        const month = cellNumber(row.cells.get("C"));
        if (zone == null || year === null || month === null) continue;
        if (!Number.isInteger(month) || month < 1 || month > 12) {
          throw new PlanningSourceFormatError("pjm", `sheet ${sheetName} row ${row.row} has month ${month}`);
        }
        // ZONE_NAME is the authority on which area a row describes, and PJM does not always
        // name the sheet after it (JCPL_FE_EAST carries rows labelled JCPL). The sheet must
        // still be internally consistent: one sheet, one area.
        if (sheetZone !== null && zone !== sheetZone) {
          throw new PlanningSourceFormatError(
            "pjm", `sheet ${sheetName} mixes areas ${sheetZone} and ${zone} at row ${row.row}`);
        }
        sheetZone = zone;

        const measures = [
          { column: "D", unit: "MW" as const, peakType: wholeMarket ? "coincident_peak" as const : "non_coincident_peak" as const, native: "PEAK_MW" },
          { column: "E", unit: "GWh" as const, peakType: "period_energy" as const, native: "ENERGY_GWH" },
        ];
        for (const measure of measures) {
          const cell = row.cells.get(measure.column);
          const value = cellNumber(cell);
          if (value === null) continue;
          records.push({
            artifactLabel: artifact.label,
            nativeGeography: zone,
            nativePeriod: `${year}-${String(month).padStart(2, "0")}`,
            nativeScenario: "PJM 2026 Load Forecast",
            nativeValue: cell!.value!,
            nativeUnit: measure.unit,
            rawPayload: { zone, year, month, column: measure.native, value: cell!.value },
            locator: {
              extractionMethod: "workbook_cell",
              workbookSheet: sheet.name,
              workbookCell: `${measure.column}${row.row}`,
              archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
              archiveMember: sheet.part,
            },
            point: {
              scenarioKey: SCENARIO_KEY,
              geographicGrain: grain,
              nativeGeographyLabel: wholeMarket ? null : zone,
              targetPeriodKind: "monthly",
              targetYear: year,
              targetSeason: null,
              targetMonth: month,
              targetTimestamp: null,
              value,
              unit: measure.unit,
              peakType: measure.peakType,
              weatherBasis: "unspecified",
              // The data workbook does not state whether peaks are before or after load
              // management, so the restricted/unrestricted axis is left unasserted.
              loadBasis: "unspecified",
              largeLoadPolicy: "included_screened",
            },
          });
        }
      }
    }
    if (records.length === 0) throw new PlanningSourceFormatError("pjm", "workbook produced no rows");

    return {
      vintage: {
        nativeVintageKey: "load-forecast-2026",
        nativeReportId: "2026 Load Forecast Report",
        reportTitle: "PJM 2026 Load Forecast Report",
        publishedAt: "2026-01-14T00:00:00Z",
        publishedAtPrecision: "day",
        sourceMethodologyName: "PJM Resource Adequacy Planning load forecast model",
        sourceMethodologyVersion: "2026",
        publicationState: "published",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: SCENARIO_KEY,
        nativeScenarioLabel: "PJM 2026 Load Forecast (independent staff forecast)",
        canonicalClass: "reference",
        isReference: true,
        weatherBasis: "unspecified",
        loadBasis: "unspecified",
        largeLoadPolicy: "included_screened",
        assumptions: {
          forecast: "PJM Resource Adequacy Planning staff forecast",
          large_load_screen: "PJM Manual 19 Attachment B",
          restricted_or_unrestricted: "not stated by this artifact",
          source_interface: "pjm.com load forecast report data; not Data Miner",
        },
        assumptionsText:
          "PJM publishes one independent staff forecast rather than a high/low fan. Large "
          + "load additions are screened under Manual 19 Attachment B before entering the "
          + "forecast. This artifact does not state whether the published peaks are before or "
          + "after load management, so that axis is recorded as unspecified rather than assumed.",
      }],
      records,
    };
  },
};
