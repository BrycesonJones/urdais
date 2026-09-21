/**
 * ERCOT — Capacity, Demand and Reserves Report.
 *
 * The Seasonal Summary sheet is a grid: row 2 names the season, row 3 the forward year, row 4
 * the column's role, and column C the quantity. Each season and year occupies three columns —
 * the peak load hour, the peak net load hour, and their difference — and that structure is the
 * reason this adapter exists rather than a simpler one. The two hours are different questions
 * about the same season and the report answers both; collapsing them would silently pick one.
 *
 * `Total Capacity` is the capability. The report's reserve margin is a ratio rather than a
 * quantity in MW, so it has no home in a table whose unit is constrained to MW or GW; it stays
 * in raw evidence rather than being reshaped into something it is not. The difference columns
 * are arithmetic on the other two and are not stored at all.
 *
 * Firm peak load and total seasonal load are demand, not capacity. They are kept as
 * `diagnostic_only` — retained for cross-checking, never eligible for a published calculation —
 * because the alternative is either losing the context a reserve margin is computed from, or
 * writing demand into the capacity domain as though it belonged there.
 */

import { XlsxWorkbook, cellNumber, type XlsxSheet } from "@/lib/power-delivery/planning/xlsx/workbook";
import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";
import type { CapacitySeason } from "@/lib/power-delivery/capacity/types";

const ARTIFACT = {
  label: "cdr-december-2025",
  url: "https://www.ercot.com/files/docs/2025/12/19/CapacityDemandandReservesReport_December2025.xlsx",
} as const;

/**
 * ERCOT files a report under the date it published it: /files/docs/2025/12/19/... . That path is
 * the publisher's own statement of when the release happened, which is better than a literal
 * written here, and it keeps the vintage key and the publication date from ever disagreeing.
 */
function publishedFromUrl(url: string): { iso: string; day: string; releaseKey: string } {
  const matched = /\/files\/docs\/(\d{4})\/(\d{2})\/(\d{2})\//.exec(url);
  if (matched === null) {
    throw new CapacitySourceFormatError("ercot", `artifact URL ${url} no longer carries the dated path ERCOT files releases under`);
  }
  const [, year, month, day] = matched;
  return { iso: `${year}-${month}-${day}T00:00:00Z`, day: `${year}-${month}-${day}`, releaseKey: `cdr-${year}-${month}` };
}

const SHEET = "Seasonal Summary";
const SEASON_ROW = 2;
const YEAR_ROW = 3;
const ROLE_ROW = 4;
/**
 * The sheet indents by moving the label between columns B and C rather than by padding it, so a
 * quantity's label may sit in either. Both are searched, trimmed: "Reserve Margin " carries a
 * trailing space in the published file.
 */
const LABEL_COLUMNS = ["B", "C"] as const;

function rowLabelled(sheet: XlsxSheet, label: string) {
  return sheet.rows.find((row) =>
    LABEL_COLUMNS.some((column) => row.cells.get(column)?.value?.trim() === label));
}

/**
 * The quantities this adapter admits, by their exact label in column C. Anything else on the
 * sheet is left alone: a label the report renames is a report that changed, and guessing at the
 * new one is how a capability quietly becomes something else.
 */
const ADMITTED = [
  {
    label: "Total Capacity",
    quantityKind: "capability" as const,
    componentKind: "accredited_resource_capacity" as const,
    note: "ERCOT's protocol-prescribed total capacity for the season, as the CDR states it.",
  },
  {
    label: "Firm Peak Load, MW",
    quantityKind: "diagnostic_only" as const,
    componentKind: "other" as const,
    note: "Demand, retained only so a reserve margin can be checked against its inputs.",
  },
] as const;

/** The two hours the report answers for, kept apart as separate scenarios. */
const ROLES = {
  "Peak Load Hour:": { key: "peak_load_hour", label: "Peak load hour", isReference: true },
  "Peak Net Load Hour:": { key: "peak_net_load_hour", label: "Peak net load hour", isReference: false },
} as const;

const at = (sheet: XlsxSheet, row: number, column: string): string | null =>
  sheet.rows.find((candidate) => candidate.row === row)?.cells.get(column)?.value ?? null;

/** Summer is a calendar year; winter is written "2026/2027" and is labelled by its start year. */
function periodOf(season: string, yearLabel: string): CapacityTargetPeriod | null {
  const trimmed = yearLabel.trim();
  if (season === "Summer") {
    const year = Number(trimmed);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
    return { periodBasis: "seasonal", targetYear: year, targetSeason: "summer", periodStart: null, periodEnd: null };
  }
  const winter = /^(\d{4})\/(\d{4})$/.exec(trimmed);
  if (winter === null) return null;
  return {
    periodBasis: "seasonal", targetYear: Number(winter[1]), targetSeason: "winter" as CapacitySeason,
    periodStart: null, periodEnd: null,
  };
}

export const ercotCapacityAdapter: CapacityAdapter = {
  key: "ercot",
  marketSlug: "ercot",
  sourceInterfaceSlug: "ercot-capacity-demand-reserves",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) throw new CapacitySourceFormatError("ercot", `artifact ${ARTIFACT.label} was not retrieved`);
    const sheet = XlsxWorkbook.open(artifact.body).sheet(SHEET);

    // Map every value column to its season, year and role, from the header rows themselves.
    const columns: { column: string; season: string; period: CapacityTargetPeriod; role: typeof ROLES[keyof typeof ROLES] }[] = [];
    const headerRow = sheet.rows.find((row) => row.row === ROLE_ROW);
    if (headerRow === undefined) throw new CapacitySourceFormatError("ercot", `${SHEET} has no role row at ${ROLE_ROW}`);
    let season = "";
    let yearLabel = "";
    for (const [column] of headerRow.cells) {
      season = at(sheet, SEASON_ROW, column)?.trim() || season;
      yearLabel = at(sheet, YEAR_ROW, column)?.trim() || yearLabel;
      const roleLabel = at(sheet, ROLE_ROW, column)?.replace(/\s+/g, " ").trim();
      if (roleLabel === undefined || roleLabel === null) continue;
      const role = ROLES[roleLabel as keyof typeof ROLES];
      // Difference columns are arithmetic on the other two and are deliberately skipped.
      if (role === undefined) continue;
      const period = periodOf(season, yearLabel);
      if (period === null) continue;
      columns.push({ column, season, period, role });
    }
    if (columns.length === 0) {
      throw new CapacitySourceFormatError("ercot", `${SHEET} exposes no season, year and hour columns; the report layout has changed`);
    }

    const records: NormalizedCapacityRecord[] = [];
    for (const admitted of ADMITTED) {
      const labelRow = rowLabelled(sheet, admitted.label);
      if (labelRow === undefined) {
        throw new CapacitySourceFormatError("ercot", `${SHEET} no longer states "${admitted.label}"`);
      }
      for (const entry of columns) {
        const cell = labelRow.cells.get(entry.column);
        const value = cellNumber(cell);
        if (value === null) continue;
        records.push({
          artifactLabel: artifact.label,
          nativeGeography: "ERCOT",
          nativePeriod: `${entry.season} ${entry.period.targetSeason === "winter" ? `${entry.period.targetYear}/${entry.period.targetYear + 1}` : entry.period.targetYear}`,
          nativeScenario: entry.role.label,
          nativeTerm: admitted.label,
          nativeValue: cell!.value!,
          nativeUnit: "MW",
          rawPayload: {
            sheet: SHEET, label: admitted.label, season: entry.season,
            role: entry.role.label, column: entry.column, note: admitted.note,
          },
          locator: {
            extractionMethod: "workbook_cell",
            workbookSheet: sheet.name,
            workbookCell: `${entry.column}${labelRow.row}`,
            archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
            archiveMember: sheet.part,
            archiveMemberHash: sheet.partSha256,
          },
          target: {
            kind: "component",
            scenarioKey: entry.role.key,
            quantityKind: admitted.quantityKind,
            componentKind: admitted.componentKind,
            // The CDR states capacity in MW on its own protocol accounting rather than a
            // named market currency, so the basis is recorded as accredited, not as UCAP.
            capacityBasis: "accredited",
            subareaNativeKey: null,
            interfaceNativeKey: null,
            period: entry.period,
            value,
            unit: "MW",
          },
        });
      }
    }

    // Reserve margin is kept as evidence. It is a ratio, and the capacity tables are denominated
    // in MW; reshaping it into a quantity would misrepresent what the report published.
    const marginRow = rowLabelled(sheet, "Reserve Margin");
    if (marginRow !== undefined) {
      for (const entry of columns) {
        const cell = marginRow.cells.get(entry.column);
        if (cell?.value == null) continue;
        records.push({
          artifactLabel: artifact.label,
          nativeGeography: "ERCOT",
          nativePeriod: `${entry.season} ${entry.period.targetYear}`,
          nativeScenario: entry.role.label,
          nativeTerm: "Reserve Margin",
          nativeValue: cell.value,
          nativeUnit: "ratio",
          rawPayload: { sheet: SHEET, formula: "(Total Resources - Firm Load Forecast) / Firm Load Forecast", role: entry.role.label },
          locator: {
            extractionMethod: "workbook_cell", workbookSheet: sheet.name,
            workbookCell: `${entry.column}${marginRow.row}`,
            archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
            archiveMember: sheet.part, archiveMemberHash: sheet.partSha256,
          },
          target: {
            kind: "evidence_only",
            reason: "the planning reserve margin is a ratio, and the capacity tables are denominated in MW; it is retained as evidence rather than reshaped into a quantity",
          },
        });
      }
    }

    const released = publishedFromUrl(artifact.url);
    return {
      vintage: {
        nativeVintageKey: released.releaseKey,
        nativeReportId: `CDR published ${released.day}`,
        reportTitle: "ERCOT Capacity, Demand and Reserves Report, December 2025",
        releaseKind: "adequacy_report",
        publishedAt: released.iso,
        publishedAtPrecision: "day",
        sourceMethodologyName: "ERCOT Capacity, Demand and Reserves methodology",
        sourceMethodologyVersion: released.day,
        publicationState: "published",
        qualityStatus: "accepted",
      },
      scenarios: Object.values(ROLES).map((role) => ({
        nativeScenarioKey: role.key,
        nativeScenarioLabel: role.label,
        canonicalClass: role.isReference ? ("reference" as const) : ("other" as const),
        isReference: role.isReference,
        assumptions: { hour: role.label, note: "The CDR answers for both hours; they are different questions about one season." },
        assumptionsText: null,
      })),
      subareas: [],
      interfaces: [],
      records,
    };
  },
};
