/**
 * CAISO Public Queue Report.
 *
 * Three sheets — active, completed, withdrawn — and sheet membership is itself lifecycle evidence,
 * so it is preserved rather than flattened away. The three sheets do not share a column layout:
 * the withdrawn sheet inserts a Withdrawn Date column early and every later column shifts, so
 * columns are resolved by header text per sheet and never by letter.
 *
 * CAISO is the only market of the three that publishes component technology and component MW, as
 * Type-1/2/3, Fuel-1/2/3 and MW-1/2/3. Those component MW are *descriptive composition and are
 * not additive*: CAISO publishes Wind 38 and Battery 38 for a project whose Net MWs to Grid is
 * 38, and 156 of its 267 active rows carry more than one component. `Net MWs to Grid` is the
 * authoritative project quantity, and it is read from its own column, never summed from parts.
 */

import { XlsxWorkbook, type XlsxRow, type XlsxSheet } from "@/lib/power-delivery/planning/xlsx/workbook";
import { excelSerialDate, isoDate, numeric, operationalStage, requestClassFor, technologyFor, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueDeferral, type QueueExtraction }
  from "@/lib/interconnection-queue/ingest/types";
import type { LifecycleStage, Technology } from "@/lib/interconnection-queue/types";

const ARTIFACT = "public-queue-report";

const SHEETS = [
  { name: "Grid GenerationQueue", partition: "active" },
  { name: "Completed Generation Projects", partition: "completed" },
  { name: "Withdrawn Generation Projects", partition: "withdrawn" },
] as const;

/** The header row, and the first data row beneath it. Both sheets share this geometry. */
const HEADER_ROW = 4;

/** Normalize a header cell so the newlines CAISO embeds in its labels do not defeat matching. */
const key = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();

function headerIndex(sheet: XlsxSheet, source: string): Map<string, string> {
  const header = sheet.rows.find((row) => row.row === HEADER_ROW);
  if (header === undefined) {
    throw new QueueSourceFormatError("caiso", `sheet ${source} has no header at row ${HEADER_ROW}`);
  }
  const columns = new Map<string, string>();
  for (const [column, cell] of header.cells) {
    const text = cell.value === null ? null : key(cell.value);
    if (text !== null && text !== "" && !columns.has(text)) columns.set(text, column);
  }
  return columns;
}

/** Resolve a column by its header text, accepting the variants the three sheets use. */
function column(columns: Map<string, string>, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const found = columns.get(key(candidate));
    if (found !== undefined) return found;
  }
  return null;
}

const text = (row: XlsxRow, col: string | null): string | null =>
  col === null ? null : trimmed(row.cells.get(col)?.value ?? null);

/** CAISO stores dates as Excel serials; a few legacy cells carry text instead. */
const date = (row: XlsxRow, col: string | null): string | null => {
  const raw = text(row, col);
  if (raw === null) return null;
  return excelSerialDate(raw) ?? isoDate(raw);
};

export const caisoQueueAdapter: QueueAdapter = {
  key: "caiso",
  marketSlug: "caiso",
  sourceInterfaceSlug: "caiso-public-queue-report",
  retrievalPurpose: "research",
  artifacts: [{ label: ARTIFACT, url: "https://www.caiso.com/documents/publicqueuereport.xlsx" }],

  parse(artifacts): QueueExtraction {
    const artifact = artifacts.get(ARTIFACT);
    if (artifact === undefined) throw new QueueSourceFormatError("caiso", `artifact ${ARTIFACT} was not retrieved`);

    const workbook = XlsxWorkbook.open(artifact.body);
    const deferrals: QueueDeferral[] = [];
    const records: NormalizedQueueRecord[] = [];
    let reportRunDate: string | null = null;

    for (const { name, partition } of SHEETS) {
      let sheet: XlsxSheet;
      try {
        sheet = workbook.sheet(name);
      } catch {
        throw new QueueSourceFormatError("caiso", `the workbook has no sheet named "${name}"`);
      }
      const columns = headerIndex(sheet, name);

      // "Report Run Date: 09/21/2026" sits above the header on the active sheet and is the only
      // freshness stamp CAISO publishes.
      if (reportRunDate === null) {
        for (const row of sheet.rows.filter((candidate) => candidate.row < HEADER_ROW)) {
          for (const cell of row.cells.values()) {
            const match = /report run date:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i.exec(cell.value ?? "");
            if (match !== null) reportRunDate = isoDate(match[1]!);
          }
        }
      }

      const queuePositionCol = column(columns, "Queue Position");
      if (queuePositionCol === null) {
        throw new QueueSourceFormatError("caiso", `sheet ${name} has no Queue Position column`);
      }
      const nameCol = column(columns, "Project Name", "Project Name - Confidential");
      const statusCol = column(columns, "Application Status");
      const netMwCol = column(columns, "Net MWs to Grid");
      const receivedCol = column(columns, "Interconnection Request Receive Date");
      const queueDateCol = column(columns, "Queue Date");
      const proposedCol = column(columns, "Proposed On-line Date (as filed with IR)");
      // Only the completed sheet publishes an *actual* date. The other two publish a "Current"
      // on-line date, which is a forecast and must never become operational evidence.
      const actualCol = column(columns, "Actual On-line Date");
      const currentCol = column(columns, "Current On-line Date");
      const withdrawnCol = column(columns, "Withdrawn Date");
      const withdrawalReasonCol = column(columns, "Reason for Withdrawal");
      const deliverabilityCol = column(columns, "Full Capacity, Partial or Energy Only (FC/P/EO)");
      const countyCol = column(columns, "County");
      const stateCol = column(columns, "State");
      const utilityCol = column(columns, "Utility");
      const regionCol = column(columns, "PTO Study Region");
      const stationCol = column(columns, "Station or Transmission Line");
      const studyProcessCol = column(columns, "Study Process");
      const agreementCol = column(columns, "Interconnection Agreement Status");
      const suspensionCol = column(columns, "Suspension Status");

      const componentColumns = [1, 2, 3].map((index) => ({
        index,
        type: column(columns, `Type-${index}`),
        fuel: column(columns, `Fuel-${index}`),
        mw: column(columns, `MW-${index}`),
      }));

      for (const row of sheet.rows.filter((candidate) => candidate.row > HEADER_ROW)) {
        const nativeQueueId = text(row, queuePositionCol);
        if (nativeQueueId === null) continue; // A spacer row; CAISO pads the bottom of each sheet.

        const locator = {
          extractionMethod: "workbook_row" as const,
          workbookSheet: name, workbookRow: row.row, container: name,
        };

        const applicationStatus = text(row, statusCol);
        const withdrawnOn = date(row, withdrawnCol);
        const actualInServiceOn = date(row, actualCol);
        const agreementStatus = text(row, agreementCol);
        const suspensionStatus = text(row, suspensionCol);

        // Sheet membership is CAISO's own lifecycle statement and outranks every other signal.
        let lifecycleStage: LifecycleStage;
        if (partition === "withdrawn") {
          lifecycleStage = "withdrawn";
        } else if (partition === "completed") {
          const operational = operationalStage({ nativeSaysOperational: true, actualInServiceOn });
          lifecycleStage = operational ?? "operational";
        } else if (suspensionStatus !== null && /suspend/i.test(suspensionStatus)) {
          lifecycleStage = "suspended";
        } else if (agreementStatus !== null && /executed/i.test(agreementStatus)) {
          lifecycleStage = "agreement_executed";
        } else if (agreementStatus !== null && trimmed(agreementStatus) !== null) {
          lifecycleStage = "agreement_pending";
        } else {
          lifecycleStage = "study";
        }

        const resources: NormalizedResource[] = [];
        const quantities: NormalizedQuantity[] = [];
        const families: Technology[] = [];

        for (const component of componentColumns) {
          const nativeType = text(row, component.type);
          const nativeFuel = text(row, component.fuel);
          const componentMw = numeric(text(row, component.mw));
          if (nativeType === null && nativeFuel === null && componentMw === null) continue;

          const technology = technologyFor(nativeFuel) ?? technologyFor(nativeType);
          if (technology === null && (nativeFuel !== null || nativeType !== null)) {
            deferrals.push({
              nativeQueueId, deferralKind: "unmapped_technology",
              nativeValue: nativeFuel ?? nativeType,
              detail: `CAISO published a technology in Type-${component.index}/Fuel-${component.index} this adapter does not map`,
              locator,
            });
          }
          families.push(technology ?? "unknown");
          resources.push({
            componentOrdinal: component.index,
            nativeTechnology: nativeType, nativeFuel,
            technology: technology ?? "unknown",
            // CAISO genuinely separates its components, which is why this is the one adapter that
            // sets this true — and why the component MW below must never be summed.
            isSourceSeparated: true,
          });
          if (componentMw !== null) {
            quantities.push({
              nativeField: `MW-${component.index}`, quantityKind: "component_mw", value: componentMw,
              unit: "MW", resourceOrdinal: component.index, direction: "injection",
            });
          }
        }

        if (resources.length === 0) {
          resources.push({ componentOrdinal: 1, nativeTechnology: null, nativeFuel: null,
            technology: "unknown", isSourceSeparated: false });
        }

        // The authoritative project quantity, read from its own column.
        const netMw = numeric(text(row, netMwCol));
        if (netMw !== null) {
          quantities.push({ nativeField: "Net MWs to Grid", quantityKind: "net_mw_to_grid",
            value: netMw, unit: "MW", resourceOrdinal: null, direction: "injection" });
        }

        const nativeStatus: Record<string, string> = { sourceSheet: name };
        if (applicationStatus !== null) nativeStatus.applicationStatus = applicationStatus;
        if (agreementStatus !== null) nativeStatus.interconnectionAgreementStatus = agreementStatus;
        if (suspensionStatus !== null) nativeStatus.suspensionStatus = suspensionStatus;
        const deliverability = text(row, deliverabilityCol);
        if (deliverability !== null) nativeStatus.deliverability = deliverability;
        const withdrawalReason = text(row, withdrawalReasonCol);
        if (withdrawalReason !== null) nativeStatus.reasonForWithdrawal = withdrawalReason;
        const studyProcess = text(row, studyProcessCol);
        if (studyProcess !== null) nativeStatus.studyProcess = studyProcess;

        const payload: Record<string, unknown> = {};
        for (const [col, cell] of row.cells) {
          if (cell.value !== null && cell.value.trim() !== "") payload[col] = cell.value;
        }

        records.push({
          nativeQueueId,
          nativeProjectName: text(row, nameCol),
          nativeCustomer: null,
          nativeStatus,
          nativeStatusDisplay: [applicationStatus, agreementStatus].filter((part) => part !== null).join(" / ") || name,
          lifecycleStage,
          requestClass: requestClassFor(families),
          requestedOn: date(row, receivedCol) ?? date(row, queueDateCol),
          proposedInServiceOn: date(row, proposedCol),
          // The "Current" on-line date is a forecast, so it is a revision of the proposal and
          // never an actual date, even on a row whose date has long passed.
          revisedInServiceOn: date(row, currentCol),
          actualInServiceOn: lifecycleStage === "operational" ? actualInServiceOn : null,
          agreementExecutedOn: null,
          withdrawnOn: lifecycleStage === "withdrawn" ? withdrawnOn : null,
          nativeState: text(row, stateCol),
          nativeCounty: text(row, countyCol),
          nativeZone: text(row, regionCol),
          nativePoi: text(row, stationCol),
          nativeSubstation: text(row, stationCol),
          nativeTransmissionOwner: text(row, utilityCol),
          sourcePartition: partition,
          quantities,
          resources,
          locator,
          payload,
          canonical: true,
        });
      }
    }

    if (records.length === 0) throw new QueueSourceFormatError("caiso", "the workbook produced no queue rows");

    return {
      // CAISO stamps a report run date and regenerates daily, so it has a real release key.
      snapshot: {
        nativeSnapshotKey: reportRunDate === null ? null : `report-run-${reportRunDate}`,
        sourcePublishedAt: reportRunDate === null ? null : `${reportRunDate}T00:00:00.000Z`,
      },
      records,
      deferrals,
    };
  },
};
