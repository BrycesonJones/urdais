/**
 * PJM — RPM Base Residual Auction planning period parameters.
 *
 * What PJM requires of itself before an auction: how much capacity the RTO and each locational
 * deliverability area must hold, how much each area must be able to import, and how much the
 * network will actually let in. The narrative version of this is a PDF; the spreadsheet behind it
 * carries the same numbers for every area rather than only the sixteen that are modelled, so the
 * spreadsheet is the artifact and the PDF is not retrieved at all.
 *
 * Two quantities here are routinely confused and are kept apart deliberately. CETO is what an area
 * is required to be able to import; CETL is what the network permits. The whole locational test is
 * whether the second exceeds the first by fifteen percent, which is only a question because they
 * are different kinds of thing — an obligation and a limit — and they are stored in different
 * layers accordingly.
 *
 * Some CETL values are printed as bounds: ">2,308.1" means PJM established only that the limit is
 * at least that, because the area passed its test without the study being carried further. A bound
 * is not a measurement, so those are kept as evidence and no constraint value is created.
 */

import {
  CapacitySourceFormatError,
  type CapacityAdapter, type CapacityExtraction, type CapacityTargetPeriod,
  type InterfaceDraft, type NormalizedCapacityRecord, type SubareaDraft,
} from "@/lib/power-delivery/capacity/ingest/types";
import { XlsxWorkbook } from "@/lib/power-delivery/planning/xlsx/workbook";

const DELIVERY_YEAR = "2026/2027";
const ARTIFACT = {
  label: "rpm-planning-parameters-2026-2027",
  url: "https://www.pjm.com/-/media/DotCom/markets-ops/rpm/rpm-auction-info/2026-2027/2026-2027-planning-period-parameters-for-base-residual-auction.xlsx",
} as const;

const SHEET = "Planning Parameters";
const TITLE_CELL = "A1";
/** The matrix of modelled areas: row 12 names them, the rows below state their requirements. */
const AREA_HEADER_ROW = 12;
/** The full area table, which covers every area rather than only the modelled ones. */
const AREA_TABLE_HEADER_ROW = 51;
const RTO = "RTO";

/**
 * One area key from whatever the sheet happened to call it.
 *
 * PJM spells its own areas four ways across two workbooks: "ATSI-Cleveland" and "ATSI-CLEVELAND",
 * "PL" and "PL (incl. UGI)", "PS NORTH" and "PSNORTH", "DPL SOUTH" and "DPLSOUTH". They are the
 * same areas. A key that did not reconcile them would enter each one twice and split its history
 * down the middle, so case, spacing and parenthetical asides are all removed.
 *
 * Removing spaces does not merge anything that should stay apart: PS and PS NORTH remain PS and
 * PSNORTH, DPL and DPL SOUTH remain DPL and DPLSOUTH.
 */
function areaKey(label: string): string {
  return label.replace(/\([^)]*\)/g, "").replace(/\s+/g, "").trim().toUpperCase();
}

/** A number PJM printed plainly. A bound, a footnote mark or "NA" is not one. */
function plainNumber(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const text = raw.trim();
  if (text === "" || text === "NA" || text === "*" || text.startsWith(">") || text.startsWith("<")) return null;
  const value = Number(text.replace(/,/g, ""));
  return Number.isFinite(value) ? value : null;
}

/** True when PJM stated only that the value lies beyond a threshold. */
const isBounded = (raw: string | null | undefined): boolean =>
  raw != null && (raw.trim().startsWith(">") || raw.trim().startsWith("<"));

const BOUNDED_REASON =
  "PJM printed this as a bound rather than a value: the area passed its transfer test without the "
  + "study being carried further, so the artifact establishes only that the limit lies beyond the "
  + "printed threshold. A bound is not a measurement and does not become one by being stored as one.";

/** Whole-RTO scalars, each read from its own labelled row. */
const RTO_SCALARS = [
  {
    label: "Installed Reserve Margin (IRM) ", term: "Installed Reserve Margin (IRM)",
    kind: "requirement" as const, componentKind: "reserve_requirement" as const,
    unit: "percent" as const, basis: "icap" as const, scale: 100,
  },
  {
    // The same obligation as the IRM, restated in unforced terms: FPR is (1 + IRM) times the
    // reference resource's accredited UCAP factor. Same kind, different basis, and the two are
    // told apart by that basis rather than by being called different things.
    label: "Forecast Pool Requirement (FPR)", term: "Forecast Pool Requirement (FPR)",
    kind: "requirement" as const, componentKind: "reserve_requirement" as const,
    unit: "percent" as const, basis: "ucap" as const, scale: 100,
  },
  {
    label: "Pool-Wide Accredited UCAP Factor", term: "Pool-Wide Accredited UCAP Factor",
    kind: "diagnostic_only" as const, componentKind: "other" as const,
    unit: "percent" as const, basis: "unspecified" as const, scale: 100,
  },
  {
    label: "Reference Resource AUCAP Factor", term: "Reference Resource AUCAP Factor",
    kind: "diagnostic_only" as const, componentKind: "installed_capacity" as const,
    unit: "percent" as const, basis: "unspecified" as const, scale: 100,
  },
  {
    label: "Preliminary Forecast Peak Load", term: "Preliminary Forecast Peak Load",
    kind: "diagnostic_only" as const, componentKind: "other" as const,
    unit: "MW" as const, basis: "unspecified" as const, scale: 1,
  },
] as const;

/** Rows of the modelled-area matrix that state a requirement for the RTO and for each area. */
const MATRIX_REQUIREMENTS = [
  {
    label: "Reliability Requirement", term: "Reliability Requirement",
    rtoKind: "reserve_requirement" as const, areaKind: "local_reliability_requirement" as const,
  },
  {
    label: "Reliability Requirement adjusted for FRR", term: "Reliability Requirement adjusted for FRR",
    rtoKind: "net_reserve_requirement" as const, areaKind: "net_reserve_requirement" as const,
  },
  {
    label: "Preliminary FRR Obligation", term: "Preliminary FRR Obligation",
    rtoKind: "other" as const, areaKind: "other" as const,
  },
] as const;

/** Columns of the full area table. */
const TABLE = {
  area: "A", ceto: "B", cetl: "C", ratio: "D",
  peakForecast: "I", frrPortion: "J",
} as const;

export const pjmParametersAdapter: CapacityAdapter = {
  key: "pjm-parameters",
  marketSlug: "pjm",
  sourceInterfaceSlug: "pjm-rpm-planning-parameters",
  retrievalPurpose: "production",
  artifacts: [ARTIFACT],

  parse(artifacts): CapacityExtraction {
    const artifact = artifacts.get(ARTIFACT.label);
    if (artifact === undefined) {
      throw new CapacitySourceFormatError("pjm-parameters", `artifact ${ARTIFACT.label} was not retrieved`);
    }
    const workbook = XlsxWorkbook.open(artifact.body);
    if (!workbook.hasSheet(SHEET)) {
      throw new CapacitySourceFormatError(
        "pjm-parameters", `workbook has no sheet "${SHEET}"; it has ${workbook.sheetNames().join(", ")}`,
      );
    }
    const sheet = workbook.sheet(SHEET);
    const at = (row: number, column: string): string | null =>
      sheet.rows.find((candidate) => candidate.row === row)?.cells.get(column)?.value ?? null;
    const trimmed = (row: number, column: string): string | null => at(row, column)?.replace(/\s+/g, " ").trim() ?? null;

    // The sheet must still be about the delivery year this adapter was written against.
    const title = trimmed(1, TITLE_CELL.slice(0, 1)) ?? "";
    const declaredYear = /^(\d{4}\/\d{4})/.exec(title)?.[1] ?? null;
    if (declaredYear === null) {
      throw new CapacitySourceFormatError("pjm-parameters", `${SHEET} cell A1 does not open with a delivery year; it reads "${title}"`);
    }
    if (declaredYear !== DELIVERY_YEAR) {
      throw new CapacitySourceFormatError(
        "pjm-parameters",
        `the artifact is for delivery year ${declaredYear}, not the ${DELIVERY_YEAR} this source is registered for`,
      );
    }
    const startYear = Number(declaredYear.slice(0, 4));
    const period: CapacityTargetPeriod = {
      periodBasis: "delivery_year",
      targetYear: startYear,
      targetSeason: null,
      // A PJM delivery year runs from June to May.
      periodStart: `${startYear}-06-01`,
      periodEnd: `${startYear + 1}-05-31`,
    };

    const records: NormalizedCapacityRecord[] = [];
    const subareas = new Map<string, SubareaDraft>();
    const interfaces = new Map<string, InterfaceDraft>();
    const scenarioKey = "bra_planning_parameters";

    const locate = (row: number, column: string) => ({
      extractionMethod: "workbook_cell" as const,
      workbookSheet: sheet.name,
      workbookCell: `${column}${row}`,
      archiveRef: `${artifact.label} (sha256 ${artifact.sha256})`,
      archiveMember: sheet.part,
      archiveMemberHash: sheet.partSha256,
    });

    const emit = (
      row: number, column: string, term: string, geography: string,
      nativeValue: string, nativeUnit: string,
      target: NormalizedCapacityRecord["target"],
      payload: Record<string, unknown> = {},
    ): void => {
      records.push({
        artifactLabel: artifact.label, nativeGeography: geography,
        nativePeriod: declaredYear, nativeScenario: "Base Residual Auction planning parameters",
        nativeTerm: term, nativeValue, nativeUnit,
        rawPayload: { sheet: SHEET, deliveryYear: declaredYear, ...payload },
        locator: locate(row, column), target,
      });
    };

    const rowLabelled = (label: string): number | null => {
      const found = sheet.rows.find((candidate) => candidate.cells.get("A")?.value?.replace(/\s+/g, " ").trim() === label.replace(/\s+/g, " ").trim());
      return found?.row ?? null;
    };

    // ---------------------------------------------------------------- whole-RTO scalars
    for (const scalar of RTO_SCALARS) {
      const row = rowLabelled(scalar.label);
      if (row === null) {
        throw new CapacitySourceFormatError("pjm-parameters", `${SHEET} no longer states "${scalar.label.trim()}"`);
      }
      const raw = at(row, "B");
      const value = plainNumber(raw);
      if (value === null) continue;
      emit(row, "B", scalar.term, RTO, raw!.trim(), scalar.unit, {
        kind: "component", scenarioKey, quantityKind: scalar.kind, componentKind: scalar.componentKind,
        capacityBasis: scalar.basis, subareaNativeKey: null, interfaceNativeKey: null,
        period, value: value * scalar.scale, unit: scalar.unit,
      }, scalar.scale === 100 ? { statedAs: "fraction of forecast peak", storedAs: "percent" } : {});
    }

    // ------------------------------------------- reliability requirements, RTO and by area
    const header = sheet.rows.find((candidate) => candidate.row === AREA_HEADER_ROW);
    if (header === undefined || header.cells.get("B")?.value?.trim() !== RTO) {
      throw new CapacitySourceFormatError(
        "pjm-parameters", `${SHEET} row ${AREA_HEADER_ROW} no longer opens the area matrix with ${RTO}`,
      );
    }
    const matrixColumns: { column: string; label: string; key: string | null }[] = [];
    for (const [column, cell] of header.cells) {
      const label = cell.value?.replace(/\s+/g, " ").trim();
      if (label == null || label === "") continue;
      matrixColumns.push({ column, label, key: label === RTO ? null : areaKey(label) });
    }

    for (const requirement of MATRIX_REQUIREMENTS) {
      const row = rowLabelled(requirement.label);
      if (row === null) {
        throw new CapacitySourceFormatError("pjm-parameters", `${SHEET} no longer states "${requirement.label}"`);
      }
      for (const entry of matrixColumns) {
        const raw = at(row, entry.column);
        const value = plainNumber(raw);
        if (value === null) continue;
        if (entry.key !== null) rememberArea(subareas, entry.key, entry.label);
        emit(row, entry.column, requirement.term, entry.key ?? RTO, raw!.trim(), "MW", {
          kind: "component", scenarioKey, quantityKind: "requirement",
          componentKind: entry.key === null ? requirement.rtoKind : requirement.areaKind,
          // PJM states reliability requirements in unforced capacity.
          capacityBasis: "ucap",
          subareaNativeKey: entry.key, interfaceNativeKey: null,
          period, value, unit: "MW",
        }, { area: entry.label });
      }
    }

    // --------------------------------------------- the full area table: CETO, CETL, peak load
    const tableHeader = sheet.rows.find((candidate) => candidate.row === AREA_TABLE_HEADER_ROW);
    const cetoHeader = tableHeader?.cells.get(TABLE.ceto)?.value?.replace(/\s+/g, " ").trim() ?? null;
    const cetlHeader = tableHeader?.cells.get(TABLE.cetl)?.value?.replace(/\s+/g, " ").trim() ?? null;
    if (cetoHeader === null || !cetoHeader.startsWith("CETO") || cetlHeader === null || !cetlHeader.startsWith("CETL")) {
      throw new CapacitySourceFormatError(
        "pjm-parameters",
        `${SHEET} row ${AREA_TABLE_HEADER_ROW} no longer opens the CETO and CETL table; it reads "${cetoHeader ?? "nothing"}" and "${cetlHeader ?? "nothing"}"`,
      );
    }

    for (const row of sheet.rows.filter((candidate) => candidate.row > AREA_TABLE_HEADER_ROW)) {
      const label = row.cells.get(TABLE.area)?.value?.replace(/\s+/g, " ").trim();
      if (label == null || label === "") continue;
      // The table ends where its footnotes begin.
      if (label.startsWith("*") || label.length > 40) break;
      const key = label === RTO ? null : areaKey(label);
      if (key !== null) rememberArea(subareas, key, label);

      const cetoRaw = row.cells.get(TABLE.ceto)?.value ?? null;
      const ceto = plainNumber(cetoRaw);
      if (ceto !== null && key !== null) {
        emit(row.row, TABLE.ceto, "CETO", key, cetoRaw!.trim(), "MW", {
          kind: "component", scenarioKey, quantityKind: "requirement",
          componentKind: "capacity_transfer_requirement", capacityBasis: "ucap",
          subareaNativeKey: key, interfaceNativeKey: null, period, value: ceto, unit: "MW",
        }, { area: label });
      }

      const cetlRaw = row.cells.get(TABLE.cetl)?.value ?? null;
      const cetl = plainNumber(cetlRaw);
      if (key !== null && (cetl !== null || isBounded(cetlRaw))) {
        const interfaceKey = `${key} IMPORT`;
        if (cetl !== null) {
          rememberImport(interfaces, interfaceKey, key, label);
          emit(row.row, TABLE.cetl, "CETL", key, cetlRaw!.trim(), "MW", {
            kind: "constraint", scenarioKey, constraintKind: "cetl", direction: "import",
            interfaceNativeKey: interfaceKey, subareaNativeKey: key, period, value: cetl, unit: "MW",
          }, { area: label });
        } else {
          emit(row.row, TABLE.cetl, "CETL", key, cetlRaw!.trim(), "MW",
            { kind: "evidence_only", reason: BOUNDED_REASON }, { area: label });
        }
      }

      // The ratio is the locational test itself, and it is a ratio.
      const ratioRaw = row.cells.get(TABLE.ratio)?.value ?? null;
      if (ratioRaw != null && ratioRaw.trim() !== "" && key !== null) {
        emit(row.row, TABLE.ratio, "CETL to CETO Ratio", key, ratioRaw.trim(), "ratio", {
          kind: "evidence_only",
          reason: "the transfer test is a ratio of the two transfer quantities, both of which are stored; keeping the quotient as a canonical value would store the same fact twice in a different denomination",
        }, { area: label });
      }

      // The RTO's own peak forecast is stated twice in this sheet, once in the scalar block and
      // again on this table's RTO row, with the same number. It is one fact, so it is stored once.
      const peakRaw = key === null ? null : row.cells.get(TABLE.peakForecast)?.value ?? null;
      const peak = plainNumber(peakRaw);
      if (peak !== null) {
        emit(row.row, TABLE.peakForecast, "Preliminary Zonal Peak Load Forecast", key ?? RTO, peakRaw!.trim(), "MW", {
          kind: "component", scenarioKey, quantityKind: "diagnostic_only", componentKind: "other",
          capacityBasis: "unspecified", subareaNativeKey: key, interfaceNativeKey: null,
          period, value: peak, unit: "MW",
        }, { area: label });
      }
    }

    if (records.length === 0) {
      throw new CapacitySourceFormatError("pjm-parameters", `${SHEET} produced no values`);
    }

    return {
      vintage: {
        nativeVintageKey: `rpm-planning-parameters-${declaredYear.replace("/", "-")}`,
        nativeReportId: `${declaredYear} RPM Base Residual Auction Planning Parameters`,
        reportTitle: `PJM ${declaredYear} RPM Base Residual Auction Planning Period Parameters`,
        releaseKind: "requirement_filing",
        publishedAt: publishedFromNotes(sheet) ?? `${startYear - 1}-01-01T00:00:00Z`,
        publishedAtPrecision: "day",
        sourceMethodologyName: "PJM Reliability Pricing Model",
        sourceMethodologyVersion: `${declaredYear} Base Residual Auction`,
        publicationState: "internal_only",
        qualityStatus: "accepted",
      },
      scenarios: [{
        nativeScenarioKey: scenarioKey,
        nativeScenarioLabel: `${declaredYear} Base Residual Auction planning parameters`,
        canonicalClass: "reference",
        isReference: true,
        assumptions: { deliveryYear: declaredYear, auction: "Base Residual Auction" },
        assumptionsText:
          "The parameters PJM posted before the Base Residual Auction. They are what the auction was "
          + "run to satisfy, not what it procured.",
      }],
      subareas: [...subareas.values()],
      interfaces: [...interfaces.values()],
      records,
    };
  },
};

function rememberArea(into: Map<string, SubareaDraft>, key: string, label: string): void {
  if (into.has(key)) return;
  into.set(key, {
    nativeKey: key,
    nativeLabel: label,
    subareaKind: "lda",
    notes:
      "A PJM locational deliverability area. Areas nest — the larger ones contain the smaller — and "
      + "the nesting is defined in Schedule 10.1 of the Reliability Assurance Agreement, which this "
      + "pipeline does not ingest, so no parent is recorded and no total across areas is ever taken.",
  });
}

function rememberImport(into: Map<string, InterfaceDraft>, key: string, area: string, label: string): void {
  if (into.has(key)) return;
  into.set(key, {
    nativeKey: key,
    nativeLabel: `${label} capacity import interface`,
    interfaceKind: "import",
    fromSubareaNativeKey: null,
    toSubareaNativeKey: area,
    externalCounterparty: null,
    notes: "The boundary the Capacity Emergency Transfer Limit bounds.",
  });
}

/**
 * The posting date PJM keeps in the revision notes at the foot of the sheet. The last dated note
 * is when the artifact last changed, which is what a vintage should be dated by.
 */
function publishedFromNotes(sheet: ReturnType<XlsxWorkbook["sheet"]>): string | null {
  let latest: string | null = null;
  for (const row of sheet.rows) {
    const text = row.cells.get("A")?.value;
    if (text == null) continue;
    const matched = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-/.exec(text.trim());
    if (matched === null) continue;
    const iso = `${matched[3]}-${matched[1]!.padStart(2, "0")}-${matched[2]!.padStart(2, "0")}T00:00:00Z`;
    if (latest === null || iso > latest) latest = iso;
  }
  return latest;
}

export { areaKey as pjmAreaKey };
