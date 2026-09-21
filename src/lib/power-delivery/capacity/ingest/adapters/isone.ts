/**
 * ISO New England — Summary of ICR and Related Values.
 *
 * The workbook is the authoritative statement of what New England is obliged to hold and what
 * its network permits, restated at each auction. Two header rows carry the meaning: one names
 * the metric family, the one below it names the zone or interface the family applies to.
 *
 * A capacity commitment period is restated by its Forward Capacity Auction and then by each
 * Annual Reconfiguration Auction, so the auction is the scenario and the period is the CCP.
 * That is what lets 2026 FCA17 and 2026 3rd ARA coexist as different statements about one
 * period rather than one overwriting the other.
 *
 * What is not here: Qualified Capacity. This artifact states requirements and limits, not
 * capability, so ISO-NE contributes no capability in this phase and the deferral is recorded
 * rather than filled from a second source that would not match this one's vintage.
 */

import { XlsxWorkbook, cellNumber } from "@/lib/power-delivery/planning/xlsx/workbook";
import { documentModifiedDay } from "@/lib/power-delivery/capacity/ingest/document-date";
import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type NormalizedCapacityRecord,
} from "@/lib/power-delivery/capacity/ingest/types";

const ARTIFACT = {
  label: "icr-related-values",
  url: "https://www.iso-ne.com/static-assets/documents/2016/12/summary_of_historical_icr_values.xlsx",
} as const;

/** The sheet carrying the current and future commitment periods. Its name ends in a space. */
const SHEET = "FCA14-FCA18 (2023-2027) ";
const FAMILY_ROW = 4;
const ZONE_ROW = 5;
const CCP_COLUMN = "B";
const FIRST_DATA_ROW = 6;

const SUBAREAS = [
  { nativeKey: "SENE", nativeLabel: "Southeast New England", subareaKind: "capacity_zone" as const, notes: "An import-constrained capacity zone. Its local requirements stop being stated once it is no longer modelled separately." },
  { nativeKey: "NNE", nativeLabel: "Northern New England", subareaKind: "capacity_zone" as const, notes: "An export-constrained capacity zone." },
  { nativeKey: "ME", nativeLabel: "Maine", subareaKind: "capacity_zone" as const, notes: "A capacity zone nested inside Northern New England." },
];

/**
 * Requirements. Three of the four codes in row 4 are separate studies of the same zone, and the
 * classification is stated here rather than inferred, because LSR, LRA and TSA all read as
 * "a local requirement" to a person and none of them reads as anything to a parser.
 */
const REQUIREMENTS = [
  { column: "C", term: "ICR", componentKind: "reserve_requirement" as const, subarea: null },
  { column: "D", term: "Net ICR", componentKind: "net_reserve_requirement" as const, subarea: null },
  { column: "G", term: "LSR", componentKind: "local_sourcing_requirement" as const, subarea: "SENE" },
  { column: "H", term: "LRA", componentKind: "local_reliability_requirement" as const, subarea: "SENE" },
  { column: "I", term: "TSA", componentKind: "transmission_security_requirement" as const, subarea: "SENE" },
] as const;

/**
 * Tie benefits: capacity New England credits itself for its interconnections. Kept as their own
 * quantity, never folded into accredited capability, because that folding is the double count the
 * research found most often. Column V is the Hydro-Quebec credit the research names HQICC.
 */
const TIE_BENEFITS = [
  { column: "S", term: "Tie Benefits, Total", interfaceKey: null },
  { column: "T", term: "Tie Benefits, Maritimes", interfaceKey: "MARITIMES" },
  { column: "U", term: "Tie Benefits, New York", interfaceKey: "NEW-YORK" },
  { column: "V", term: "Tie Benefits, HQ Phase II (HQICCs)", interfaceKey: "HQ-PHASE-II" },
  { column: "W", term: "Tie Benefits, Highgate", interfaceKey: "HIGHGATE" },
] as const;

/** Network limits. MCL bounds what an export-constrained zone may hold; TTC bounds an interface. */
const CONSTRAINTS = [
  { column: "J", term: "MCL", constraintKind: "mcl" as const, direction: "export" as const, interfaceKey: "NNE-MCL", subarea: "NNE" },
  { column: "K", term: "MCL", constraintKind: "mcl" as const, direction: "export" as const, interfaceKey: "ME-MCL", subarea: "ME" },
  { column: "L", term: "TTC", constraintKind: "tsl" as const, direction: "import" as const, interfaceKey: "SENE-IMPORT", subarea: "SENE" },
  { column: "M", term: "TTC", constraintKind: "tsl" as const, direction: "bidirectional" as const, interfaceKey: "NORTH-SOUTH", subarea: null },
  { column: "N", term: "TTC", constraintKind: "tsl" as const, direction: "bidirectional" as const, interfaceKey: "ME-NH", subarea: null },
  { column: "O", term: "TTC", constraintKind: "import_limit" as const, direction: "import" as const, interfaceKey: "MARITIMES", subarea: null },
  { column: "P", term: "TTC", constraintKind: "import_limit" as const, direction: "import" as const, interfaceKey: "NEW-YORK", subarea: null },
  { column: "Q", term: "TTC", constraintKind: "import_limit" as const, direction: "import" as const, interfaceKey: "HQ-PHASE-II", subarea: null },
  { column: "R", term: "TTC", constraintKind: "import_limit" as const, direction: "import" as const, interfaceKey: "HIGHGATE", subarea: null },
  // Transfer capability left after the tie benefit is taken out of it. ISO-NE computes it and
  // publishes it, so it is a source value; 'other' because no standard limit code names it.
  { column: "X", term: "CTL (TTC - Tie Benefits)", constraintKind: "other" as const, direction: "import" as const, interfaceKey: "MARITIMES", subarea: null },
  { column: "Y", term: "CTL (TTC - Tie Benefits)", constraintKind: "other" as const, direction: "import" as const, interfaceKey: "NEW-YORK", subarea: null },
  { column: "Z", term: "CTL (TTC - Tie Benefits)", constraintKind: "other" as const, direction: "import" as const, interfaceKey: "HQ-PHASE-II", subarea: null },
  { column: "AA", term: "CTL (TTC - Tie Benefits)", constraintKind: "other" as const, direction: "import" as const, interfaceKey: "HIGHGATE", subarea: null },
] as const;

/** Demand, retained only so a requirement can be checked against the load it was set for. */
const DIAGNOSTICS = [
  { column: "AB", term: "50-50 Summer Peak Frcst" },
] as const;

/**
 * Values that stay evidence. Each names why: a price is not a capacity, a calendar year is not a
 * megawatt, and a column headed only "ICAP" defines no quantity a classification could be checked
 * against.
 */
const EVIDENCE_ONLY = [
  { column: "E", term: "CONE ($/kw-month)", reason: "cost of new entry is stated in dollars per kilowatt-month; it is a price, not a capacity, and the capacity tables are denominated in MW" },
  { column: "F", term: "Net CONE ($/kw-month)", reason: "cost of new entry is stated in dollars per kilowatt-month; it is a price, not a capacity, and the capacity tables are denominated in MW" },
  { column: "AC", term: "Year of CELT Load Forecast", reason: "this is the calendar year of the load forecast the requirement was set against, not a quantity in MW" },
  { column: "AD", term: "ICAP", reason: "the column is headed only \"ICAP\" and the workbook defines no term for it; whether it is a qualified capability or an installed capacity requirement decides whether it is supply or obligation, and guessing between them is exactly the error this pipeline exists to avoid" },
] as const;

/** "2026 FCA17" and "2026 3rd ARA" are two statements about the same commitment period. */
function ccpOf(label: string): { period: CapacityTargetPeriod; auctionKey: string; auctionLabel: string } | null {
  const match = /^(\d{4})\s+(.+)$/.exec(label.trim());
  if (match === null) return null;
  const year = Number(match[1]);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  const auction = match[2]!.trim();
  return {
    period: { periodBasis: "capacity_commitment_period", targetYear: year, targetSeason: null, periodStart: null, periodEnd: null },
    auctionKey: auction.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
    auctionLabel: auction,
  };
}

export const isoneCapacityAdapter: CapacityAdapter = {
  key: "iso-ne",
  marketSlug: "iso-ne",
  sourceInterfaceSlug: "iso-ne-icr-related-values",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) throw new CapacitySourceFormatError("iso-ne", `artifact ${ARTIFACT.label} was not retrieved`);
    const workbook = XlsxWorkbook.open(artifact.body);
    if (!workbook.hasSheet(SHEET)) {
      throw new CapacitySourceFormatError("iso-ne", `workbook has no sheet "${SHEET}"; it has ${workbook.sheetNames().join(", ")}`);
    }
    const sheet = workbook.sheet(SHEET);
    const header = (row: number, column: string) =>
      sheet.rows.find((candidate) => candidate.row === row)?.cells.get(column)?.value?.replace(/\s+/g, " ").trim() ?? null;

    // The header must still say what this adapter was written against.
    if (header(FAMILY_ROW, "J") !== "MCL") {
      throw new CapacitySourceFormatError("iso-ne", `column J no longer carries MCL but ${header(FAMILY_ROW, "J") ?? "nothing"}; the workbook layout has changed`);
    }
    if (header(ZONE_ROW, "J") !== "NNE") {
      throw new CapacitySourceFormatError("iso-ne", `column J no longer applies to NNE but to ${header(ZONE_ROW, "J") ?? "nothing"}`);
    }
    if (header(FAMILY_ROW, "S") !== "Tie Benefits" || header(ZONE_ROW, "V") !== "HQ Phase II (HQICCs)") {
      throw new CapacitySourceFormatError(
        "iso-ne",
        `the tie benefit block has moved: S is "${header(FAMILY_ROW, "S") ?? "empty"}" and V is "${header(ZONE_ROW, "V") ?? "empty"}"`,
      );
    }

    const records: NormalizedCapacityRecord[] = [];
    const scenarios = new Map<string, { key: string; label: string }>();

    for (const row of sheet.rows.filter((candidate) => candidate.row >= FIRST_DATA_ROW)) {
      const ccpLabel = row.cells.get(CCP_COLUMN)?.value;
      if (ccpLabel == null) continue;
      const ccp = ccpOf(ccpLabel);
      if (ccp === null) continue;
      scenarios.set(ccp.auctionKey, { key: ccp.auctionKey, label: ccp.auctionLabel });

      const emit = (column: string, term: string, nativeGeography: string, target: NormalizedCapacityRecord["target"], cellValue: string) => {
        records.push({
          artifactLabel: artifact.label, nativeGeography, nativePeriod: ccpLabel,
          nativeScenario: ccp.auctionLabel, nativeTerm: term, nativeValue: cellValue, nativeUnit: "MW",
          rawPayload: { sheet: SHEET, ccp: ccpLabel, auction: ccp.auctionLabel, family: header(FAMILY_ROW, column), zone: header(ZONE_ROW, column) },
          locator: {
            extractionMethod: "workbook_cell", workbookSheet: sheet.name, workbookCell: `${column}${row.row}`,
            archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
            archiveMember: sheet.part, archiveMemberHash: sheet.partSha256,
          },
          target,
        });
      };

      for (const spec of REQUIREMENTS) {
        const cell = row.cells.get(spec.column);
        const value = cellNumber(cell);
        if (value === null) continue;
        emit(spec.column, spec.term, spec.subarea ?? "ISO-NE", {
          kind: "component", scenarioKey: ccp.auctionKey, quantityKind: "requirement",
          componentKind: spec.componentKind,
          // ISO-NE states requirements in installed capacity terms.
          capacityBasis: "icap",
          subareaNativeKey: spec.subarea, interfaceNativeKey: null,
          period: ccp.period, value, unit: "MW",
        }, cell!.value!);
      }

      for (const spec of TIE_BENEFITS) {
        const cell = row.cells.get(spec.column);
        const value = cellNumber(cell);
        if (value === null) continue;
        emit(spec.column, spec.term, spec.interfaceKey ?? "ISO-NE", {
          kind: "component", scenarioKey: ccp.auctionKey, quantityKind: "capability",
          componentKind: "tie_benefit", capacityBasis: "icap",
          subareaNativeKey: null, interfaceNativeKey: spec.interfaceKey,
          period: ccp.period, value, unit: "MW",
        }, cell!.value!);
      }

      for (const spec of DIAGNOSTICS) {
        const cell = row.cells.get(spec.column);
        const value = cellNumber(cell);
        if (value === null) continue;
        emit(spec.column, spec.term, "ISO-NE", {
          kind: "component", scenarioKey: ccp.auctionKey, quantityKind: "diagnostic_only",
          componentKind: "other", capacityBasis: "unspecified",
          subareaNativeKey: null, interfaceNativeKey: null,
          period: ccp.period, value, unit: "MW",
        }, cell!.value!);
      }

      for (const spec of CONSTRAINTS) {
        const cell = row.cells.get(spec.column);
        const value = cellNumber(cell);
        if (value === null) continue;
        emit(spec.column, spec.term, spec.subarea ?? spec.interfaceKey, {
          kind: "constraint", scenarioKey: ccp.auctionKey, constraintKind: spec.constraintKind,
          direction: spec.direction, interfaceNativeKey: spec.interfaceKey,
          subareaNativeKey: spec.subarea, period: ccp.period, value, unit: "MW",
        }, cell!.value!);
      }

      for (const spec of EVIDENCE_ONLY) {
        const cell = row.cells.get(spec.column);
        if (cell?.value == null) continue;
        emit(spec.column, spec.term, "ISO-NE", { kind: "evidence_only", reason: spec.reason }, cell.value);
      }
    }

    if (records.length === 0) {
      throw new CapacitySourceFormatError("iso-ne", `${SHEET} produced no commitment-period rows`);
    }

    const auctions = [...scenarios.values()];
    // ISO-NE restates this one file as each auction settles and dates no revision inside it, so
    // the release is identified by the day the workbook was written. A later restatement is a new
    // vintage rather than a silent overwrite of what the file said before.
    const published = documentModifiedDay(artifact.body, "iso-ne");
    return {
      vintage: {
        nativeVintageKey: `icr-summary-${published.day}`,
        nativeReportId: `Summary of ICR and Related Values, ${published.day}`,
        reportTitle: "ISO New England Summary of ICR and Related Values",
        releaseKind: "requirement_filing",
        publishedAt: published.iso,
        publishedAtPrecision: "day",
        sourceMethodologyName: "ISO-NE Installed Capacity Requirement",
        sourceMethodologyVersion: published.day,
        publicationState: "published",
        qualityStatus: "accepted",
      },
      // Each auction restates the commitment period; the forward auction is the reference.
      scenarios: auctions.map((auction) => ({
        nativeScenarioKey: auction.key,
        nativeScenarioLabel: auction.label,
        canonicalClass: /^fca/i.test(auction.label) ? ("reference" as const) : ("other" as const),
        isReference: false,
        assumptions: { auction: auction.label },
        assumptionsText: "A capacity commitment period is restated at its forward auction and again at each annual reconfiguration auction.",
      })),
      subareas: SUBAREAS,
      interfaces: [
        { nativeKey: "NNE-MCL", nativeLabel: "Northern New England maximum capacity limit", interfaceKind: "export", fromSubareaNativeKey: "NNE", toSubareaNativeKey: null, externalCounterparty: null, notes: "The limit on capacity an export-constrained zone may hold." },
        { nativeKey: "ME-MCL", nativeLabel: "Maine maximum capacity limit", interfaceKind: "export", fromSubareaNativeKey: "ME", toSubareaNativeKey: null, externalCounterparty: null, notes: "Maine is nested inside Northern New England." },
        { nativeKey: "SENE-IMPORT", nativeLabel: "Southeast New England import interface", interfaceKind: "import", fromSubareaNativeKey: null, toSubareaNativeKey: "SENE", externalCounterparty: null, notes: null },
        { nativeKey: "NORTH-SOUTH", nativeLabel: "North-South interface", interfaceKind: "internal_transfer", fromSubareaNativeKey: "NNE", toSubareaNativeKey: "SENE", externalCounterparty: null, notes: null },
        { nativeKey: "ME-NH", nativeLabel: "Maine-New Hampshire interface", interfaceKind: "internal_transfer", fromSubareaNativeKey: "ME", toSubareaNativeKey: null, externalCounterparty: null, notes: null },
        { nativeKey: "MARITIMES", nativeLabel: "Maritimes external tie", interfaceKind: "external_tie", fromSubareaNativeKey: null, toSubareaNativeKey: null, externalCounterparty: "Maritimes", notes: null },
        { nativeKey: "NEW-YORK", nativeLabel: "New York external tie", interfaceKind: "external_tie", fromSubareaNativeKey: null, toSubareaNativeKey: null, externalCounterparty: "New York", notes: null },
        { nativeKey: "HQ-PHASE-II", nativeLabel: "Hydro-Quebec Phase II external tie", interfaceKind: "external_tie", fromSubareaNativeKey: null, toSubareaNativeKey: null, externalCounterparty: "Hydro-Quebec", notes: "The tie the interconnection capability credits are attached to." },
        { nativeKey: "HIGHGATE", nativeLabel: "Highgate external tie", interfaceKind: "external_tie", fromSubareaNativeKey: null, toSubareaNativeKey: null, externalCounterparty: "Hydro-Quebec", notes: null },
      ],
      records,
    };
  },
};
