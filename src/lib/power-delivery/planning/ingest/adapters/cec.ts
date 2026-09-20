/**
 * CAISO — California Energy Demand 2025, published by the California Energy Commission.
 *
 * The CEC originates the CAISO planning forecast; CAISO's own seasonal assessment restates CEC
 * numbers rather than producing them, so this adapter reads the CEC and attributes the CEC.
 *
 * The forecast forms arrive as a ZIP-packaged workbook. `annual_peaks` states one row per
 * transmission access charge area, scenario and forecast year, with the peak decomposed into
 * every component the CEC models -- unadjusted consumption, pumping, climate change, light and
 * medium/heavy electric vehicles, data centres, behind-the-meter PV and storage, and the
 * additional achievable efficiency and fuel substitution adjustments.
 *
 * Two decisions worth stating:
 *
 *   * Only `TAC = CAISO` is ingested. California statewide demand and the individual utility
 *     planning areas are different footprints, and substituting either for the CAISO balancing
 *     authority area would make the series describe a geography PD-2 does not have.
 *   * `MANAGED_NET_LOAD` is the canonical value -- it is the CEC's final managed net peak, the
 *     number the planning process uses. Every component column is retained verbatim in the raw
 *     record, so the data-centre and known-load contributions remain queryable without a second
 *     canonical point competing with the first for the same period.
 */

import { XlsxWorkbook, cellNumber } from "@/lib/power-delivery/planning/xlsx/workbook";
import {
  PlanningSourceFormatError,
  type ExtractedPlanningRecord, type PlanningAdapter, type PlanningExtraction,
  type PlanningScenarioDraft,
} from "@/lib/power-delivery/planning/ingest/types";

const ARTIFACT = {
  label: "ced-2025-peak-forecast",
  url: "https://efiling.energy.ca.gov/GetDocument.aspx?tn=268124&DocumentContentId=105148",
} as const;

const SHEET = "annual_peaks";
const REQUIRED_COLUMNS = {
  COINCIDENT: "A", TAC: "B", SCENARIO: "C", YEAR: "D", MONTH: "E", DAY: "F", HOUR: "G",
  MANAGED_NET_LOAD: "X",
} as const;

const CAISO_BAA = "CAISO";

/** The workbook writes this column as a boolean; older CEC vintages wrote 1/0. */
const COINCIDENCE: Record<string, boolean | undefined> = { true: true, false: false, "1": true, "0": false };

/**
 * The three CAISO scenarios the CEC publishes. Known Loads is the large-load adder: the
 * `plusKnown` case includes committed large loads, the other two do not.
 */
const SCENARIOS: Record<string, PlanningScenarioDraft> = {
  Planning_Scenario: {
    nativeScenarioKey: "Planning_Scenario",
    nativeScenarioLabel: "CED 2025 Planning Scenario",
    canonicalClass: "reference",
    isReference: true,
    weatherBasis: "unspecified",
    loadBasis: "net",
    largeLoadPolicy: "included_screened",
    assumptions: {
      scenario: "Planning", known_loads_included: false,
      additional_achievable: "AAEE 3 and AAFS 2 applied",
    },
    assumptionsText:
      "The CEC's planning case, used for resource planning. It applies the higher additional "
      + "achievable energy efficiency and fuel substitution adjustments and excludes the Known "
      + "Loads adder, while the modelled data-centre forecast remains in the baseline.",
  },
  Local_Reliability: {
    nativeScenarioKey: "Local_Reliability",
    nativeScenarioLabel: "CED 2025 Local Reliability Scenario",
    canonicalClass: "high",
    isReference: false,
    weatherBasis: "unspecified",
    loadBasis: "net",
    largeLoadPolicy: "included_screened",
    assumptions: {
      scenario: "Local Reliability", known_loads_included: false,
      additional_achievable: "AAEE 2 and AAFS 3 applied",
    },
    assumptionsText:
      "The CEC's local reliability case, used for distribution and transmission planning. It "
      + "applies more conservative additional achievable adjustments than the planning case and "
      + "excludes the Known Loads adder.",
  },
  Local_Reliability_plusKnown: {
    nativeScenarioKey: "Local_Reliability_plusKnown",
    nativeScenarioLabel: "CED 2025 Local Reliability with Known Loads",
    canonicalClass: "high",
    isReference: false,
    weatherBasis: "unspecified",
    loadBasis: "net",
    largeLoadPolicy: "included_all",
    assumptions: {
      scenario: "Local Reliability with Known Loads", known_loads_included: true,
      additional_achievable: "AAEE 2 and AAFS 3 applied",
    },
    assumptionsText:
      "The local reliability case with the Known Loads adder included: large loads the CEC has "
      + "evidence are committed, over and above the modelled data-centre forecast.",
  },
};

export const cecAdapter: PlanningAdapter = {
  key: "cec",
  marketSlug: "caiso",
  sourceInterfaceSlug: "cec-california-energy-demand-forecast",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): PlanningExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) throw new PlanningSourceFormatError("cec", `artifact ${ARTIFACT.label} was not retrieved`);
    const sheet = XlsxWorkbook.open(artifact.body).sheet(SHEET);
    const header = sheet.rows.find((row) => row.row === 1);
    if (header === undefined) throw new PlanningSourceFormatError("cec", `${SHEET} has no header row`);
    for (const [name, column] of Object.entries(REQUIRED_COLUMNS)) {
      const actual = header.cells.get(column)?.value;
      if (actual !== name) {
        throw new PlanningSourceFormatError("cec", `${SHEET} expected ${name} at ${column}1 but found ${actual ?? "an empty cell"}`);
      }
    }
    /** Every column, so the raw record keeps the CEC's whole decomposition. */
    const allColumns = [...header.cells].map(([column, cell]) => ({ column, name: cell.value })).filter((entry) => entry.name !== null);

    const records: ExtractedPlanningRecord[] = [];
    const seenScenarios = new Set<string>();
    for (const row of sheet.rows.filter((candidate) => candidate.row > 1)) {
      const tac = row.cells.get(REQUIRED_COLUMNS.TAC)?.value;
      if (tac !== CAISO_BAA) continue;
      const scenarioKey = row.cells.get(REQUIRED_COLUMNS.SCENARIO)?.value;
      if (scenarioKey == null) continue;
      const scenario = SCENARIOS[scenarioKey];
      if (scenario === undefined) {
        throw new PlanningSourceFormatError("cec", `${SHEET} row ${row.row} carries unknown scenario "${scenarioKey}"`);
      }
      seenScenarios.add(scenarioKey);

      // COINCIDENT is written as an Excel boolean, so it arrives as "true"/"false" rather than
      // 1/0. Both spellings are accepted and anything else stops the run.
      const coincidentRaw = row.cells.get(REQUIRED_COLUMNS.COINCIDENT)?.value ?? null;
      const year = cellNumber(row.cells.get(REQUIRED_COLUMNS.YEAR));
      const valueCell = row.cells.get(REQUIRED_COLUMNS.MANAGED_NET_LOAD);
      const value = cellNumber(valueCell);
      if (coincidentRaw === null || year === null || value === null) continue;
      const coincident = COINCIDENCE[coincidentRaw];
      if (coincident === undefined) {
        throw new PlanningSourceFormatError("cec", `${SHEET} row ${row.row} has COINCIDENT="${coincidentRaw}"`);
      }

      const payload: Record<string, unknown> = {};
      for (const entry of allColumns) payload[entry.name!] = row.cells.get(entry.column)?.value ?? null;

      records.push({
        artifactLabel: artifact.label,
        nativeGeography: CAISO_BAA,
        nativePeriod: String(year),
        nativeScenario: scenarioKey,
        nativeValue: valueCell!.value!,
        nativeUnit: "MW",
        rawPayload: payload,
        locator: {
          extractionMethod: "workbook_cell",
          workbookSheet: sheet.name,
          workbookCell: `${REQUIRED_COLUMNS.MANAGED_NET_LOAD}${row.row}`,
          archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
          archiveMember: sheet.part,
        },
        point: {
          scenarioKey,
          geographicGrain: "balancing_authority",
          nativeGeographyLabel: null,
          targetPeriodKind: "annual",
          targetYear: year,
          targetSeason: null,
          targetMonth: null,
          targetTimestamp: null,
          value,
          unit: "MW",
          peakType: coincident ? "coincident_peak" : "non_coincident_peak",
          weatherBasis: "unspecified",
          loadBasis: "net",
          largeLoadPolicy: scenario.largeLoadPolicy,
        },
      });
    }
    if (records.length === 0) {
      throw new PlanningSourceFormatError("cec", `${SHEET} produced no ${CAISO_BAA} rows; the balancing-authority forecast is absent`);
    }

    return {
      vintage: {
        nativeVintageKey: "ced-2025",
        nativeReportId: "CED 2025",
        reportTitle: "California Energy Demand 2025 (2025 IEPR) — CAISO balancing authority area",
        publishedAt: "2026-02-06T00:00:00Z",
        publishedAtPrecision: "day",
        sourceMethodologyName: "CEC California Energy Demand forecast",
        sourceMethodologyVersion: "CED 2025",
        publicationState: "published",
        qualityStatus: "accepted",
      },
      scenarios: [...seenScenarios].sort().map((key) => SCENARIOS[key]!),
      records,
    };
  },
};
