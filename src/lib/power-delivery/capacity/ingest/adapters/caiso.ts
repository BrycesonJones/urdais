/**
 * CAISO — Final Net Qualifying Capacity report.
 *
 * CAISO publishes NQC one resource at a time: 1,753 generators, each with twelve monthly values
 * and a deliverability status. It publishes no total. That absence is the whole shape of this
 * adapter.
 *
 * Adding the column up would produce a number CAISO has never stated, under an aggregation rule
 * Urdais has not written down: energy-only resources are already carried at or near zero, partial
 * deliverability is expressed as a cap rather than a discount, and whether an interim-deliverable
 * resource counts toward a system figure is a methodology question, not an arithmetic one. So this
 * phase keeps every published row as evidence, with the status attached to it, and creates no
 * component. When a signed NQC-stack methodology exists, it reads these rows; until then nothing
 * downstream can mistake a sum for something CAISO said.
 *
 * Maximum Import Capability is not here either. CAISO publishes MIC only as a PDF, and this
 * pipeline does not transcribe numbers out of PDFs by hand.
 */

import { XlsxWorkbook, cellNumber } from "@/lib/power-delivery/planning/xlsx/workbook";
import { documentModifiedDay } from "@/lib/power-delivery/capacity/ingest/document-date";
import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type NormalizedCapacityRecord, type SubareaDraft,
} from "@/lib/power-delivery/capacity/ingest/types";

const COMPLIANCE_YEAR = 2026;
const ARTIFACT = {
  label: "nqc-final-2026",
  url: "https://www.caiso.com/documents/final-net-qualifying-capacity-report-for-compliance-year-2026.xlsx",
} as const;

const HEADER_SHEET = "Header Descriptions";
const LIST_SHEET = `${COMPLIANCE_YEAR} NQC List`;
const HEADER_ROW = 1;
const RESOURCE_COLUMN = "A";
const AREA_COLUMN = "B";
const NAME_COLUMN = "C";
const STATUS_COLUMN = "R";
const PATH_COLUMN = "Q";
const DISPATCHABLE_COLUMN = "P";
const COMMENT_COLUMN = "T";

/** The monthly NQC columns, in the order the sheet prints them. */
const MONTHS = [
  ["D", 1, "JAN"], ["E", 2, "FEB"], ["F", 3, "MAR"], ["G", 4, "APR"],
  ["H", 5, "MAY"], ["I", 6, "JUN"], ["J", 7, "JUL"], ["K", 8, "AUG"],
  ["L", 9, "SEP"], ["M", 10, "OCT"], ["N", 11, "NOV"], ["O", 12, "DEC"],
] as const;

/**
 * "CAISO System" appears in the Local Area column but is not a local capacity area: it is how the
 * sheet says a resource is in none of them. It is therefore not seeded as a locality, and the
 * resources carrying it are recorded with no locality rather than with a fabricated one.
 */
const NOT_A_LOCAL_AREA = "CAISO System";

/** Two spellings of one place: the header list writes SanDiego-IV, the data writes San Diego-IV. */
function areaKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const WHY_NO_COMPONENT =
  "CAISO publishes net qualifying capacity per resource and publishes no system or local-area total. " +
  "A total would be an Urdais aggregation across mixed deliverability statuses, which is a methodology " +
  "decision rather than a value CAISO stated, so the row is kept as evidence and no capability component is created.";

export const caisoCapacityAdapter: CapacityAdapter = {
  key: "caiso",
  marketSlug: "caiso",
  sourceInterfaceSlug: "caiso-net-qualifying-capacity",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) throw new CapacitySourceFormatError("caiso", `artifact ${ARTIFACT.label} was not retrieved`);
    const workbook = XlsxWorkbook.open(artifact.body);
    for (const required of [HEADER_SHEET, LIST_SHEET]) {
      if (!workbook.hasSheet(required)) {
        throw new CapacitySourceFormatError("caiso", `workbook has no sheet "${required}"; it has ${workbook.sheetNames().join(", ")}`);
      }
    }

    // The localities come from CAISO's own enumeration on the header sheet, not from whatever
    // happens to appear in the data, so a typo in one row cannot invent a capacity area.
    const header = workbook.sheet(HEADER_SHEET);
    const areaRow = header.rows.find((row) => row.cells.get("A")?.value?.trim() === "Local Area");
    const areaList = areaRow?.cells.get("C")?.value;
    if (areaList == null) {
      throw new CapacitySourceFormatError("caiso", `${HEADER_SHEET} no longer enumerates the Local Area values`);
    }
    const declared = new Map<string, string>();
    for (const label of areaList.split(",").map((part) => part.trim()).filter((part) => part !== "")) {
      if (label === NOT_A_LOCAL_AREA) continue;
      declared.set(areaKey(label), label);
    }
    if (declared.size === 0) {
      throw new CapacitySourceFormatError("caiso", `${HEADER_SHEET} enumerated no local capacity areas`);
    }

    const sheet = workbook.sheet(LIST_SHEET);
    const headerCell = (column: string) =>
      sheet.rows.find((row) => row.row === HEADER_ROW)?.cells.get(column)?.value?.trim() ?? null;
    if (headerCell(RESOURCE_COLUMN) !== "Resource ID" || headerCell(AREA_COLUMN) !== "Local Area") {
      throw new CapacitySourceFormatError("caiso", `${LIST_SHEET} no longer begins with Resource ID and Local Area; its columns have moved`);
    }
    for (const [column, , label] of MONTHS) {
      if (headerCell(column) !== label) {
        throw new CapacitySourceFormatError("caiso", `${LIST_SHEET} column ${column} is "${headerCell(column) ?? "empty"}", not ${label}`);
      }
    }

    const records: NormalizedCapacityRecord[] = [];
    const usedAreas = new Set<string>();

    for (const row of sheet.rows.filter((candidate) => candidate.row > HEADER_ROW)) {
      const resourceId = row.cells.get(RESOURCE_COLUMN)?.value?.trim();
      if (resourceId == null || resourceId === "") continue;
      const areaLabel = row.cells.get(AREA_COLUMN)?.value?.trim() ?? "";
      let locality: string | null = null;
      if (areaLabel !== "" && areaLabel !== NOT_A_LOCAL_AREA) {
        const canonical = declared.get(areaKey(areaLabel));
        if (canonical === undefined) {
          throw new CapacitySourceFormatError(
            "caiso",
            `resource ${resourceId} names local area "${areaLabel}", which ${HEADER_SHEET} does not list`,
          );
        }
        locality = canonical;
        usedAreas.add(canonical);
      }

      const status = row.cells.get(STATUS_COLUMN)?.value?.trim() ?? null;
      const payloadBase = {
        sheet: LIST_SHEET,
        resourceId,
        generatorName: row.cells.get(NAME_COLUMN)?.value ?? null,
        localArea: areaLabel === "" ? null : areaLabel,
        // Kept verbatim. Full capacity, partial, interim and energy-only are different promises
        // about the same megawatt and only CAISO's own words distinguish them.
        deliverabilityStatus: status,
        path26: row.cells.get(PATH_COLUMN)?.value ?? null,
        dispatchable: row.cells.get(DISPATCHABLE_COLUMN)?.value ?? null,
        comment: row.cells.get(COMMENT_COLUMN)?.value ?? null,
      };

      for (const [column, month, label] of MONTHS) {
        const cell = row.cells.get(column);
        if (cellNumber(cell) === null) continue;
        records.push({
          artifactLabel: artifact.label,
          nativeGeography: locality ?? NOT_A_LOCAL_AREA,
          nativePeriod: `${COMPLIANCE_YEAR}-${String(month).padStart(2, "0")}`,
          nativeScenario: "Final",
          nativeTerm: "NQC",
          nativeValue: cell!.value!,
          nativeUnit: "MW",
          rawPayload: { ...payloadBase, month: label, complianceYear: COMPLIANCE_YEAR },
          locator: {
            extractionMethod: "workbook_cell", workbookSheet: sheet.name, workbookCell: `${column}${row.row}`,
            archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
            archiveMember: sheet.part, archiveMemberHash: sheet.partSha256,
          },
          target: { kind: "evidence_only", reason: WHY_NO_COMPONENT },
        });
      }
    }

    if (records.length === 0) {
      throw new CapacitySourceFormatError("caiso", `${LIST_SHEET} produced no resource rows`);
    }

    const published = documentModifiedDay(artifact.body, "caiso");
    // Only the localities the report actually used, so an area CAISO lists but does not place a
    // resource in is not asserted to exist in this vintage.
    const subareas: SubareaDraft[] = [...usedAreas].sort().map((label) => ({
      nativeKey: label,
      nativeLabel: label,
      subareaKind: "local_capacity_area",
      notes: "A CAISO local capacity area, as named in the Local Area column of the net qualifying capacity report.",
    }));

    return {
      vintage: {
        nativeVintageKey: ARTIFACT.label,
        nativeReportId: `Final NQC Report, compliance year ${COMPLIANCE_YEAR}`,
        reportTitle: `CAISO Final Net Qualifying Capacity Report for Compliance Year ${COMPLIANCE_YEAR}`,
        releaseKind: "accreditation_release",
        publishedAt: published.iso,
        publishedAtPrecision: "day",
        sourceMethodologyName: "CAISO Net Qualifying Capacity",
        sourceMethodologyVersion: `compliance year ${COMPLIANCE_YEAR}`,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: "final",
        nativeScenarioLabel: `Final NQC list, compliance year ${COMPLIANCE_YEAR}`,
        canonicalClass: "reference",
        isReference: true,
        assumptions: { complianceYear: COMPLIANCE_YEAR, list: "final" },
        assumptionsText: "The final list CAISO publishes ahead of the compliance year. Month-ahead values may be reduced after a Pmax test.",
      }],
      subareas,
      interfaces: [],
      records,
    };
  },
};
