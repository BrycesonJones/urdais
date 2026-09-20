/**
 * ERCOT — 2025 Long-Term Demand and Energy Forecast, April 2025 Adjusted vintage.
 *
 * The reference adapter. ERCOT is the only one of the seven markets whose terms carry an
 * affirmative reuse grant, and its published workbooks are cleanly structured, so it is where
 * the shape of an adapter is worked out.
 *
 * Three artifacts, each read for what only it states:
 *
 *   Summer-and-Winter-Peaks    seasonal net coincident and non-coincident peaks, by weather zone
 *                              and for ERCOT as a whole, for both the Adjusted and the TSP
 *                              Provided forecasts.
 *   Monthly-Peak-and-Energy    monthly peak demand across the horizon.
 *   Peak-Demand-Scenarios      the same annual summer peak re-run against each historical
 *                              weather year 2008-2023, plus ERCOT's 90th-percentile case.
 *
 * Two things this adapter deliberately does not read, both recorded rather than guessed:
 *
 *   * The hourly XLSB workbooks (ErcotAdjustedForecast.xlsb, TSP-Provided-Hourly-Forecast.xlsb).
 *     XLSB is the binary BIFF12 format, which the XLSX reader does not decode. ERCOT's hourly
 *     profile is therefore absent, not approximated from the seasonal peaks.
 *   * The energy column of the monthly workbook. Its header reads "Annual Energy" while each
 *     row is one month, and the twelve monthly figures sum to ERCOT's annual total -- so the
 *     values are monthly and the header is a naming artifact. That is an inference, and a
 *     published number whose own header contradicts its grain is not one to publish on an
 *     inference. Monthly peaks, which are unambiguous, are ingested.
 */

import { XlsxWorkbook, cellNumber, type XlsxSheet } from "@/lib/power-delivery/planning/xlsx/workbook";
import { columnToIndex, indexToColumn } from "@/lib/power-delivery/planning/xlsx/workbook";
import { sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import {
  PlanningSourceFormatError,
  type ExtractedPlanningRecord, type PlanningAdapter, type PlanningExtraction,
  type PlanningScenarioDraft, type RetrievedArtifact,
} from "@/lib/power-delivery/planning/ingest/types";
import type { TargetSeason } from "@/lib/power-delivery/planning/types";

const BASE = "https://www.ercot.com/files/docs/2025/04/08";
const ARTIFACTS = [
  { label: "summer-and-winter-peaks", url: `${BASE}/Summer-and-Winter-Peaks.xlsx` },
  { label: "monthly-peak-and-energy", url: `${BASE}/2025-ERCOT-Monthly-Peak-Demand-and-Energy-Forecast.xlsx` },
  { label: "peak-demand-scenarios", url: `${BASE}/ERCOT-Peak-Demand-Scenarios.xlsx` },
] as const;

/** ERCOT's eight weather zones, in the column order the workbooks publish them. */
const WEATHER_ZONES = ["COAST", "EAST", "FWEST", "NCENT", "NORTH", "SCENT", "SOUTH", "WEST"] as const;
const WHOLE_MARKET = "ERCOT";

const BLOCK_TITLE = /^(Summer|Winter) Net (Coincident|Non-Coincident) Peak Forecast (\d{4})-(\d{4}) (ERCOT Adjusted|TSP Provided) Forecast$/;

const FORECAST_SCENARIOS = {
  "ERCOT Adjusted": {
    key: "ERCOT_Adjusted",
    label: "ERCOT Adjusted Forecast",
    largeLoadPolicy: "included_probability_weighted" as const,
    assumptionsText:
      "ERCOT's focus case. Large-load additions reported by transmission service providers are "
      + "discounted by signed-agreement status before being added to the forecast, and the additions "
      + "are delayed relative to the requested energisation date.",
  },
  "TSP Provided": {
    key: "TSP_Provided",
    label: "TSP Provided Forecast",
    largeLoadPolicy: "included_all" as const,
    assumptionsText:
      "Transmission service provider submissions carried through without ERCOT's large-load "
      + "adjustment. Published alongside the Adjusted Forecast, not as ERCOT's own expectation.",
  },
} as const;

function sheetOf(artifact: RetrievedArtifact, name: string): XlsxSheet {
  return XlsxWorkbook.open(artifact.body).sheet(name);
}

function requireText(sheet: XlsxSheet, row: number, column: string, expected: string, artifactLabel: string): void {
  const actual = sheet.rows.find((candidate) => candidate.row === row)?.cells.get(column)?.value;
  if (actual !== expected) {
    throw new PlanningSourceFormatError(
      "ercot",
      `${artifactLabel} sheet "${sheet.name}" expected "${expected}" at ${column}${row} but found ${actual === undefined || actual === null ? "an empty cell" : `"${actual}"`}`,
    );
  }
}

/** Winter is labelled by the year it starts in; the peak itself falls in the following January. */
function winterStartYear(label: string): number {
  const match = /^(\d{4})-(\d{4})$/.exec(label);
  if (match === null) throw new PlanningSourceFormatError("ercot", `unreadable winter season label "${label}"`);
  return Number(match[1]);
}

function seasonalRecords(artifact: RetrievedArtifact, sheetName: TargetSeason extends never ? never : "Summer" | "Winter"): ExtractedPlanningRecord[] {
  const sheet = sheetOf(artifact, sheetName);
  const records: ExtractedPlanningRecord[] = [];
  const season: TargetSeason = sheetName === "Summer" ? "summer" : "winter";

  for (const row of sheet.rows) {
    for (const [column, cell] of row.cells) {
      const title = cell.value;
      if (title === null) continue;
      const match = BLOCK_TITLE.exec(title);
      if (match === null) continue;
      if (match[1] !== sheetName) {
        throw new PlanningSourceFormatError("ercot", `sheet ${sheetName} carries a ${match[1]} block: "${title}"`);
      }
      const peakType = match[2] === "Coincident" ? "coincident_peak" : "non_coincident_peak";
      const forecast = FORECAST_SCENARIOS[match[5] as keyof typeof FORECAST_SCENARIOS];
      const yearColumn = columnToIndex(column);

      // The header row names the nine value columns. If it does not, the workbook has moved.
      const headerRow = row.row + 1;
      const columns = [...WEATHER_ZONES, WHOLE_MARKET].map((name, offset) => {
        const letter = indexToColumn(yearColumn + offset + 1);
        requireText(sheet, headerRow, letter, name, artifact.label);
        return { name, letter };
      });

      for (const dataRow of sheet.rows.filter((candidate) => candidate.row > headerRow)) {
        const periodLabel = dataRow.cells.get(column)?.value;
        if (periodLabel === null || periodLabel === undefined) break;
        const targetYear = season === "summer" ? Number(periodLabel) : winterStartYear(periodLabel);
        if (!Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) break;

        for (const { name, letter } of columns) {
          const valueCell = dataRow.cells.get(letter);
          const value = cellNumber(valueCell);
          if (value === null) continue;
          const wholeMarket = name === WHOLE_MARKET;
          records.push({
            artifactLabel: artifact.label,
            nativeGeography: name,
            nativePeriod: String(periodLabel),
            nativeScenario: forecast.label,
            nativeValue: valueCell!.value!,
            nativeUnit: "MW",
            rawPayload: { title, season: match[1], peak: match[2], forecast: match[5], zone: name, period: periodLabel },
            locator: {
              extractionMethod: "workbook_cell",
              workbookSheet: sheet.name,
              workbookCell: `${letter}${dataRow.row}`,
              archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
              archiveMember: sheet.part,
            },
            point: {
              scenarioKey: forecast.key,
              geographicGrain: wholeMarket ? "balancing_authority" : "weather_zone",
              nativeGeographyLabel: wholeMarket ? null : name,
              targetPeriodKind: "seasonal",
              targetYear,
              targetSeason: season,
              targetMonth: null,
              targetTimestamp: null,
              value,
              unit: "MW",
              peakType,
              // The workbook states "Net" in every block title and states no weather basis.
              weatherBasis: "unspecified",
              loadBasis: "net",
              largeLoadPolicy: forecast.largeLoadPolicy,
            },
          });
        }
      }
    }
  }
  if (records.length === 0) {
    throw new PlanningSourceFormatError("ercot", `no peak-forecast blocks found on sheet ${sheetName}`);
  }
  return records;
}

function monthlyRecords(artifact: RetrievedArtifact): ExtractedPlanningRecord[] {
  const sheet = sheetOf(artifact, "Sheet1");
  requireText(sheet, 1, "A", "ERCOT Adjusted Forecast", artifact.label);
  requireText(sheet, 2, "A", "year", artifact.label);
  requireText(sheet, 2, "B", "month", artifact.label);
  requireText(sheet, 2, "C", "Monthly Peaks", artifact.label);

  const records: ExtractedPlanningRecord[] = [];
  for (const row of sheet.rows.filter((candidate) => candidate.row > 2)) {
    const year = cellNumber(row.cells.get("A"));
    const month = cellNumber(row.cells.get("B"));
    const peakCell = row.cells.get("C");
    const peak = cellNumber(peakCell);
    if (year === null || month === null || peak === null) continue;
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new PlanningSourceFormatError("ercot", `month ${month} at B${row.row} is not a calendar month`);
    }
    records.push({
      artifactLabel: artifact.label,
      nativeGeography: WHOLE_MARKET,
      nativePeriod: `${year}-${String(month).padStart(2, "0")}`,
      nativeScenario: FORECAST_SCENARIOS["ERCOT Adjusted"].label,
      nativeValue: peakCell!.value!,
      nativeUnit: "MW",
      rawPayload: { year, month, monthlyPeakMw: peakCell!.value, block: "ERCOT Adjusted Forecast" },
      locator: {
        extractionMethod: "workbook_cell",
        workbookSheet: sheet.name,
        workbookCell: `C${row.row}`,
        archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
        archiveMember: sheet.part,
      },
      point: {
        scenarioKey: FORECAST_SCENARIOS["ERCOT Adjusted"].key,
        geographicGrain: "balancing_authority",
        nativeGeographyLabel: null,
        targetPeriodKind: "monthly",
        targetYear: year,
        targetSeason: null,
        targetMonth: month,
        targetTimestamp: null,
        value: peak,
        unit: "MW",
        peakType: "non_coincident_peak",
        weatherBasis: "unspecified",
        loadBasis: "net",
        largeLoadPolicy: FORECAST_SCENARIOS["ERCOT Adjusted"].largeLoadPolicy,
      },
    });
  }
  if (records.length === 0) throw new PlanningSourceFormatError("ercot", "monthly workbook produced no peaks");
  return records;
}

/** Weather-year and P90 variants of the annual summer peak, one scenario per published case. */
function weatherScenarioRecords(artifact: RetrievedArtifact): {
  records: ExtractedPlanningRecord[]; scenarios: PlanningScenarioDraft[];
} {
  const workbook = XlsxWorkbook.open(artifact.body);
  const records: ExtractedPlanningRecord[] = [];
  const scenarios: PlanningScenarioDraft[] = [];

  for (const [title, forecast] of Object.entries(FORECAST_SCENARIOS)) {
    if (!workbook.hasSheet(title)) {
      throw new PlanningSourceFormatError("ercot", `scenarios workbook has no sheet "${title}"`);
    }
    const sheet = workbook.sheet(title);
    requireText(sheet, 6, "A", "year", artifact.label);
    const headerRow = sheet.rows.find((row) => row.row === 6);
    if (headerRow === undefined) throw new PlanningSourceFormatError("ercot", "scenarios workbook lost its header row");

    const cases: { letter: string; label: string; key: string; weatherBasis: "weather_year" | "p90"; weatherYear: number | null }[] = [];
    for (const [letter, cell] of headerRow.cells) {
      if (letter === "A" || cell.value === null) continue;
      const label = cell.value;
      if (label === "ercot_90th") {
        cases.push({ letter, label, key: `${forecast.key}_P90`, weatherBasis: "p90", weatherYear: null });
        continue;
      }
      const year = Number(label);
      if (!Number.isInteger(year) || year < 1990 || year > 2100) {
        throw new PlanningSourceFormatError("ercot", `unrecognised scenario column "${label}" at ${letter}6 of sheet ${title}`);
      }
      cases.push({ letter, label, key: `${forecast.key}_WY${year}`, weatherBasis: "weather_year", weatherYear: year });
    }
    if (cases.length === 0) throw new PlanningSourceFormatError("ercot", `sheet ${title} declares no scenario columns`);

    for (const entry of cases) {
      scenarios.push({
        nativeScenarioKey: entry.key,
        nativeScenarioLabel: entry.weatherBasis === "p90"
          ? `${forecast.label} — ERCOT 90th percentile`
          : `${forecast.label} — historical weather year ${entry.weatherYear}`,
        canonicalClass: null,
        isReference: false,
        weatherBasis: entry.weatherBasis,
        loadBasis: "net",
        largeLoadPolicy: forecast.largeLoadPolicy,
        assumptions: {
          base_forecast: forecast.key,
          native_case_label: entry.label,
          ...(entry.weatherYear === null ? {} : { historical_weather_year: entry.weatherYear }),
        },
        assumptionsText: "Net summer peak demand re-run against the stated weather case. ERCOT publishes these as sensitivities on the base forecast, not as separate forecasts.",
      });
    }

    for (const row of sheet.rows.filter((candidate) => candidate.row > 6)) {
      const targetYear = cellNumber(row.cells.get("A"));
      if (targetYear === null || !Number.isInteger(targetYear)) continue;
      for (const entry of cases) {
        const cell = row.cells.get(entry.letter);
        const value = cellNumber(cell);
        if (value === null) continue;
        records.push({
          artifactLabel: artifact.label,
          nativeGeography: WHOLE_MARKET,
          nativePeriod: String(targetYear),
          nativeScenario: `${forecast.label} / ${entry.label}`,
          nativeValue: cell!.value!,
          nativeUnit: "MW",
          rawPayload: { sheet: title, case: entry.label, year: targetYear },
          locator: {
            extractionMethod: "workbook_cell",
            workbookSheet: sheet.name,
            workbookCell: `${entry.letter}${row.row}`,
            archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
            archiveMember: sheet.part,
          },
          point: {
            scenarioKey: entry.key,
            geographicGrain: "balancing_authority",
            nativeGeographyLabel: null,
            targetPeriodKind: "annual",
            targetYear,
            targetSeason: null,
            targetMonth: null,
            targetTimestamp: null,
            value,
            unit: "MW",
            // The sheet title states net summer peak demand; it is an annual summer peak.
            peakType: "non_coincident_peak",
            weatherBasis: entry.weatherBasis,
            loadBasis: "net",
            largeLoadPolicy: forecast.largeLoadPolicy,
          },
        });
      }
    }
  }
  return { records, scenarios };
}

export const ercotAdapter: PlanningAdapter = {
  key: "ercot",
  marketSlug: "ercot",
  sourceInterfaceSlug: "ercot-long-term-load-forecast",
  retrievalPurpose: "production",
  artifacts: [...ARTIFACTS],

  parse(artifacts): PlanningExtraction {
    const require = (label: string): RetrievedArtifact => {
      const artifact = artifacts.get(label);
      if (artifact === undefined) throw new PlanningSourceFormatError("ercot", `artifact ${label} was not retrieved`);
      if (sha256(artifact.body) !== artifact.sha256) {
        throw new PlanningSourceFormatError("ercot", `artifact ${label} does not match its recorded hash`);
      }
      return artifact;
    };
    const peaks = require("summer-and-winter-peaks");
    const monthly = require("monthly-peak-and-energy");
    const scenarioArtifact = require("peak-demand-scenarios");

    const weather = weatherScenarioRecords(scenarioArtifact);
    const scenarios: PlanningScenarioDraft[] = [
      {
        nativeScenarioKey: FORECAST_SCENARIOS["ERCOT Adjusted"].key,
        nativeScenarioLabel: FORECAST_SCENARIOS["ERCOT Adjusted"].label,
        canonicalClass: "reference",
        isReference: true,
        weatherBasis: "unspecified",
        loadBasis: "net",
        largeLoadPolicy: FORECAST_SCENARIOS["ERCOT Adjusted"].largeLoadPolicy,
        assumptions: { forecast: "ERCOT Adjusted", horizon: "2025-2031", basis: "net" },
        assumptionsText: FORECAST_SCENARIOS["ERCOT Adjusted"].assumptionsText,
      },
      {
        nativeScenarioKey: FORECAST_SCENARIOS["TSP Provided"].key,
        nativeScenarioLabel: FORECAST_SCENARIOS["TSP Provided"].label,
        canonicalClass: null,
        isReference: false,
        weatherBasis: "unspecified",
        loadBasis: "net",
        largeLoadPolicy: FORECAST_SCENARIOS["TSP Provided"].largeLoadPolicy,
        assumptions: { forecast: "TSP Provided", horizon: "2025-2031", basis: "net" },
        assumptionsText: FORECAST_SCENARIOS["TSP Provided"].assumptionsText,
      },
      ...weather.scenarios,
    ];

    return {
      vintage: {
        nativeVintageKey: "ltlf-2025-04-adjusted",
        nativeReportId: "2025 LTLF",
        reportTitle: "2025 Long-Term Demand and Energy Forecast (April 2025 Adjusted Forecast)",
        publishedAt: "2025-04-08T00:00:00Z",
        publishedAtPrecision: "day",
        sourceMethodologyName: "ERCOT Long-Term Load Forecast methodology",
        sourceMethodologyVersion: "2025",
        publicationState: "published",
        qualityStatus: "accepted",
      },
      scenarios,
      records: [
        ...seasonalRecords(peaks, "Summer"),
        ...seasonalRecords(peaks, "Winter"),
        ...monthlyRecords(monthly),
        ...weather.records,
      ],
    };
  },
};
