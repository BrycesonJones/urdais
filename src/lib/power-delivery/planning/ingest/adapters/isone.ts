/**
 * ISO New England — CELT 2026, Forecast Data workbook.
 *
 * Sheet `1.6 Forecast Distributions` publishes the seasonal peak forecast as a distribution
 * rather than a single number: ten exceedance probabilities per forecast year, for summer and
 * for winter. The two that name ISO-NE's own planning cases are the 0.5 column, which the sheet
 * itself labels "Forecast at Expected Weather" and the region calls 50/50, and the 0.1 column,
 * which it calls 90/10.
 *
 * Those two are ingested and the intermediate probabilities are not, because 50/50 and 90/10 are
 * the cases ISO-NE plans against and the rest of the distribution has no standing in the
 * planning process. The adapter locates them by matching the probability written in the header
 * row, not by column position, and fails if either is missing or ambiguous.
 *
 * Deferred and not guessed: the gross-versus-reconstituted split. The CELT workbook states gross
 * and net-of-behind-the-meter-PV separately for historical monthly peaks on sheet 1.5.1, and the
 * forecast sheets for transmission planning and forward capacity auctions (6.2, 6.3) restate the
 * forecast on other bases. Sheet 1.6 itself states no basis, so the ingested points record the
 * basis as unspecified rather than asserting one.
 */

import { XlsxWorkbook, cellNumber } from "@/lib/power-delivery/planning/xlsx/workbook";
import {
  PlanningSourceFormatError,
  type ExtractedPlanningRecord, type PlanningAdapter, type PlanningExtraction,
} from "@/lib/power-delivery/planning/ingest/types";
import type { TargetSeason, WeatherBasis } from "@/lib/power-delivery/planning/types";

const ARTIFACT = {
  label: "celt-2026",
  url: "https://www.iso-ne.com/static-assets/documents/100035/2026_celt.xlsx",
} as const;

const SHEET = "1.6 Forecast Distributions";
const PROBABILITY_HEADER = "Probability of Forecast Being Exceeded";
const LABEL_COLUMN = "B";
const PERIOD_COLUMN = "C";

/** ISO-NE's two planning cases, named by the exceedance probability the sheet prints. */
const CASES = [
  { probability: 0.5, key: "CELT_50_50", label: "CELT 50/50 (expected weather)", weatherBasis: "p50" as WeatherBasis, canonicalClass: "reference" as const, isReference: true },
  { probability: 0.1, key: "CELT_90_10", label: "CELT 90/10 (extreme weather)", weatherBasis: "p90" as WeatherBasis, canonicalClass: "high" as const, isReference: false },
];

const SEASON_LABELS: Record<string, TargetSeason> = { "Summer (MW)": "summer", "Winter (MW)": "winter" };

/** Summer rows carry a year; winter rows carry "2026/2027" and are labelled by the start year. */
function targetYear(label: string): number | null {
  const trimmed = label.trim();
  const winter = /^(\d{4})\/(\d{4})$/.exec(trimmed);
  if (winter !== null) return Number(winter[1]);
  const year = Number(trimmed);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : null;
}

export const isoneAdapter: PlanningAdapter = {
  key: "isone",
  marketSlug: "iso-ne",
  sourceInterfaceSlug: "iso-ne-celt-report",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): PlanningExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) throw new PlanningSourceFormatError("isone", `artifact ${ARTIFACT.label} was not retrieved`);
    const sheet = XlsxWorkbook.open(artifact.body).sheet(SHEET);

    const records: ExtractedPlanningRecord[] = [];
    for (const [index, headerRow] of sheet.rows.entries()) {
      if (headerRow.cells.get(LABEL_COLUMN)?.value?.trim() !== PROBABILITY_HEADER) continue;

      // Map each wanted probability to exactly one column, by the value printed in this row.
      const columns = CASES.map((probabilityCase) => {
        const matches = [...headerRow.cells].filter(([column, cell]) =>
          column !== LABEL_COLUMN && column !== PERIOD_COLUMN && cellNumber(cell) === probabilityCase.probability);
        if (matches.length !== 1) {
          throw new PlanningSourceFormatError(
            "isone",
            `${SHEET} row ${headerRow.row} names ${matches.length} columns at exceedance probability ${probabilityCase.probability}; exactly one is required`,
          );
        }
        return { ...probabilityCase, column: matches[0]![0] };
      });

      let season: TargetSeason | null = null;
      for (const row of sheet.rows.slice(index + 1)) {
        const label = row.cells.get(LABEL_COLUMN)?.value;
        if (label != null) {
          const declared = SEASON_LABELS[label.trim()];
          if (declared === undefined) break;
          season = declared;
        }
        if (season === null) {
          throw new PlanningSourceFormatError("isone", `${SHEET} row ${row.row} has values before any season was declared`);
        }
        const periodCell = row.cells.get(PERIOD_COLUMN);
        if (periodCell?.value == null) break;
        const year = targetYear(periodCell.value);
        if (year === null) break;

        for (const entry of columns) {
          const cell = row.cells.get(entry.column);
          const value = cellNumber(cell);
          if (value === null) continue;
          records.push({
            artifactLabel: artifact.label,
            nativeGeography: "ISO-NE",
            nativePeriod: periodCell.value.trim(),
            nativeScenario: entry.label,
            nativeValue: cell!.value!,
            nativeUnit: "MW",
            rawPayload: {
              season: label?.trim() ?? season, period: periodCell.value.trim(),
              exceedance_probability: entry.probability, sheet: SHEET,
            },
            locator: {
              extractionMethod: "workbook_cell",
              workbookSheet: sheet.name,
              workbookCell: `${entry.column}${row.row}`,
              archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
              archiveMember: sheet.part,
            },
            point: {
              scenarioKey: entry.key,
              geographicGrain: "balancing_authority",
              nativeGeographyLabel: null,
              targetPeriodKind: "seasonal",
              targetYear: year,
              targetSeason: season,
              targetMonth: null,
              targetTimestamp: null,
              value,
              unit: "MW",
              peakType: "coincident_peak",
              weatherBasis: entry.weatherBasis,
              loadBasis: "unspecified",
              largeLoadPolicy: "included_screened",
            },
          });
        }
      }
    }
    if (records.length === 0) {
      throw new PlanningSourceFormatError("isone", `${SHEET} produced no 50/50 or 90/10 peaks`);
    }

    return {
      vintage: {
        nativeVintageKey: "celt-2026",
        nativeReportId: "CELT 2026",
        reportTitle: "ISO New England 2026 Capacity, Energy, Loads and Transmission (CELT) Report",
        publishedAt: "2026-05-01T00:00:00Z",
        publishedAtPrecision: "day",
        sourceMethodologyName: "ISO-NE CELT load forecast",
        sourceMethodologyVersion: "2026",
        publicationState: "published",
        qualityStatus: "accepted",
      },
      scenarios: CASES.map((entry) => ({
        nativeScenarioKey: entry.key,
        nativeScenarioLabel: entry.label,
        canonicalClass: entry.canonicalClass,
        isReference: entry.isReference,
        weatherBasis: entry.weatherBasis,
        loadBasis: "unspecified",
        largeLoadPolicy: "included_screened",
        assumptions: {
          exceedance_probability: entry.probability,
          sheet: SHEET,
          large_load_treatment:
            "ISO-NE admits a large load to the forecast only once it passes the CELT construction "
            + "screen, which is why its near-term large-load contribution is materially smaller "
            + "than ERCOT's or PJM's.",
          gross_or_net: "not stated on this sheet",
        },
        assumptionsText:
          `Seasonal peak forecast at an exceedance probability of ${entry.probability}. ISO-NE `
          + "publishes the full distribution; Urdais ingests only the two cases the region plans "
          + "against.",
      })),
      records,
    };
  },
};
