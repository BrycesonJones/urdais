/**
 * NYISO Interconnection Queue.
 *
 * The first market that publishes a load interconnection queue as such, and it classifies each
 * load by end use — including a distinct code for AI data centres. Those loads are structurally
 * separate from generation: a different sheet, a different quantity, a different request class.
 * A load MW must never reach a generation total, so it is stored under its own quantity kind and
 * the request class says what it is.
 *
 * Status is a numeric code from 1 to 12 whose legend NYISO prints in a note row rather than
 * publishing as a table. The legend is parsed out of that row; a code the legend does not define
 * keeps its native value, normalizes to unknown and is deferred.
 *
 * Sheet membership is lifecycle evidence, as it is for CAISO: the Withdrawn sheet is withdrawn
 * and the In Service sheet is operational, whatever a status code elsewhere might suggest.
 */

import { XlsxWorkbook, type XlsxRow, type XlsxSheet } from "@/lib/power-delivery/planning/xlsx/workbook";
import { excelSerialDate, isoDate, numeric, requestClassFor, technologyFor, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueArtifactRef, type QueueDeferral,
  type QueueExtraction } from "@/lib/interconnection-queue/ingest/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import type { LifecycleStage, Technology } from "@/lib/interconnection-queue/types";

const ARTIFACT = "interconnection-queue";
const LANDING = "https://www.nyiso.com/interconnections";

/**
 * Find the current workbook rather than hard-coding last month's.
 *
 * NYISO dates the filename — `NYISO-Interconnection-Queue-08312026.xlsx` — and changes the link
 * every month, so a pinned URL silently serves stale data until someone notices. Discovery
 * returns exactly one artifact, and the date in its name becomes the report period.
 */
export async function discoverNyisoQueue(
  fetch: (url: string) => Promise<RetrievedArtifact>,
): Promise<QueueArtifactRef[]> {
  const page = await fetch(LANDING);
  const html = page.body.toString("utf8");
  const match = /href="([^"]*NYISO[- ]?Interconnection[- ]?Queue[^"]*\.xlsx[^"]*)"/i.exec(html);
  if (match === null) {
    throw new QueueSourceFormatError("nyiso", `no interconnection queue workbook is linked from ${LANDING}`);
  }
  const href = match[1]!;
  const url = href.startsWith("http") ? href : `https://www.nyiso.com${href}`;
  const file = /Queue-?(\d{2})(\d{2})(\d{4})\.xlsx/i.exec(href);
  const reportPeriod = file === null ? null : `${file[3]}-${file[1]}-01`;
  return [{
    label: ARTIFACT,
    url,
    reportPeriod,
    publishedAt: file === null ? null : `${file[3]}-${file[1]}-${file[2]}T00:00:00.000Z`,
    isCorrection: false,
    nativeDocumentId: null,
    archiveMetadata: { landingPage: LANDING, href },
  }];
}

/** NYISO's own fuel and type codes, as printed in the Type/Fuel column. */
const TECHNOLOGY_BY_CODE: ReadonlyMap<string, Technology> = new Map([
  ["s", "solar"], ["sun", "solar"],
  ["w", "wind"], ["osw", "wind"], ["wnd", "wind"],
  ["es", "battery_storage"], ["bat", "battery_storage"],
  ["ng", "natural_gas"], ["cc", "natural_gas"], ["ct", "natural_gas"],
  ["nu", "nuclear"], ["h", "hydro"], ["hy", "hydro"], ["wat", "hydro"],
  ["ac", "transmission"], ["dc", "transmission"], ["l", "load"],
]);

/**
 * NYISO's load end-use codes, normalized only where the publisher itself distinguishes.
 *
 * DAT-AI is the one that matters: it is NYISO stating that a load is an AI data centre, which no
 * other market publishes. Nothing here is inferred from a project name.
 */
export function nyisoEndUse(code: string | null): { normalized: string; known: boolean } {
  const value = (code ?? "").trim().toUpperCase();
  if (value === "") return { normalized: "unknown", known: true };
  if (value === "DAT-AI") return { normalized: "data_center_ai", known: true };
  if (value === "DAT" || value.startsWith("DAT-")) return { normalized: "data_center", known: true };
  if (value.startsWith("M-")) return { normalized: "manufacturing", known: true };
  if (value === "RD") return { normalized: "research", known: true };
  if (value === "O") return { normalized: "other", known: true };
  return { normalized: "unknown", known: false };
}

/**
 * The status legend, which NYISO prints in note cells rather than publishing as a table.
 *
 * It does not fit in one cell. The generation sheet splits it across two — the first ends at
 * "10=Accepted Cost Allocation/IA in Progress," and a second cell carries 11 through 15 — and the
 * cluster sheet has its own parallel legend with C-suffixed codes. So every cell that looks like
 * a legend is read, and the codes accumulate across all of them.
 */
export function parseStatusLegend(sheet: XlsxSheet, into?: Map<string, string>): Map<string, string> {
  const legend = into ?? new Map<string, string>();
  for (const row of sheet.rows) {
    for (const cell of row.cells.values()) {
      const value = cell.value;
      if (value === null) continue;
      // A legend cell defines several codes; an ordinary cell that happens to contain "=" does not.
      const pairs = [...value.matchAll(/(?:^|[,:])\s*(\d+[A-Za-z]?|P)\s*=\s*([^,]+)/g)];
      if (pairs.length < 2) continue;
      for (const pair of pairs) legend.set(pair[1]!.trim().toUpperCase(), pair[2]!.trim());
    }
  }
  return legend;
}

/**
 * Map a legend description to a lifecycle stage on what the words actually say.
 *
 * Order matters here, and one distinction carries real weight: NYISO defines both "In Service
 * Commercial" (14) and "In Service for Test" (13), and only the first is commercial operation. A
 * plant on test is energised, not operating, and a rule that matched "in service" loosely would
 * declare it operational. "Partial In-Service" (15) is the same trap in a different shape.
 */
export function stageFromLegend(description: string | null): LifecycleStage | null {
  if (description === null) return null;
  const value = description.toLowerCase();
  if (/withdraw|cancel/.test(value)) return "withdrawn";
  if (/in[- ]service commercial/.test(value)) return "operational";
  if (/in[- ]service for test|partial(?:ly)?[- ]in[- ]service|partial in-service/.test(value)) {
    return "under_construction";
  }
  if (/under construction/.test(value)) return "under_construction";
  if (/ia completed|ia executed|agreement executed|executed/.test(value)) return "agreement_executed";
  if (/ia in progress|ia pending|cost allocation/.test(value)) return "agreement_pending";
  if (/scoping|pending|in progress|approved|performed|commenced|entry decision|study|window|final decision|fes|sris|sis|fs\b/.test(value)) {
    return "study";
  }
  return null;
}

const squash = (value: string): string => value.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A NYISO queue identifier, in every shape the workbook uses: `0001` on the generation sheets,
 * `0290A` where a request was split, and `C24-003` for a cluster project.
 */
const QUEUE_ID = /^[A-Za-z]?\d[\dA-Za-z]*(?:-\d+)?$/;

/**
 * Resolve the header, which NYISO stacks on some sheets and not others.
 *
 * The generation sheets put every label on one row. The In Service sheet splits them across two —
 * "Queue" above "Pos.", "Date" above "of IR" — so a reader that takes a single row finds a column
 * called "Queue" and no dates at all. The header is therefore every row from the one that starts
 * the label block down to the first row whose identifier cell holds a queue number.
 */
function headerIndex(sheet: XlsxSheet): { columns: Map<string, string>; headerRow: number } {
  const start = sheet.rows.find((row) => [...row.cells.values()].some((cell) =>
    cell.value !== null && /^queue(\s*(pos\.?|position|number))?$/i.test(cell.value.trim())));
  if (start === undefined) {
    throw new QueueSourceFormatError("nyiso", `sheet ${sheet.name} has no queue identifier column`);
  }
  const identifierColumn = [...start.cells.entries()].find(([, cell]) =>
    cell.value !== null && /^queue(\s*(pos\.?|position|number))?$/i.test(cell.value.trim()))![0];
  const firstData = sheet.rows.find((row) =>
    row.row > start.row && QUEUE_ID.test((row.cells.get(identifierColumn)?.value ?? "").trim()));
  if (firstData === undefined) {
    throw new QueueSourceFormatError("nyiso", `sheet ${sheet.name} has a header but no queue rows`);
  }

  const parts = new Map<string, string[]>();
  for (const row of sheet.rows) {
    if (row.row < start.row || row.row >= firstData.row) continue;
    for (const [column, cell] of row.cells) {
      const text = cell.value === null ? "" : cell.value.replace(/\s+/g, " ").trim();
      if (text === "") continue;
      const list = parts.get(column) ?? [];
      list.push(text);
      parts.set(column, list);
    }
  }
  const columns = new Map<string, string>();
  for (const [column, list] of parts) {
    const label = squash(list.join(" "));
    if (label !== "" && !columns.has(label)) columns.set(label, column);
  }
  return { columns, headerRow: firstData.row - 1 };
}

function column(columns: Map<string, string>, ...candidates: string[]): string | null {
  for (const candidate of candidates) {
    const found = columns.get(squash(candidate));
    if (found !== undefined) return found;
  }
  return null;
}

const text = (row: XlsxRow, col: string | null): string | null =>
  col === null ? null : trimmed(row.cells.get(col)?.value ?? null);

const date = (row: XlsxRow, col: string | null): string | null => {
  const raw = text(row, col);
  if (raw === null) return null;
  return excelSerialDate(raw) ?? isoDate(raw);
};

type SheetSpec = {
  name: string;
  partition: string;
  /** Lifecycle the sheet itself asserts, which outranks any status code on the row. */
  stage: LifecycleStage | null;
  isLoad: boolean;
};

const SHEETS: readonly SheetSpec[] = [
  { name: "Interconnection Queue", partition: "generation", stage: null, isLoad: false },
  { name: " Cluster Projects", partition: "cluster", stage: null, isLoad: false },
  { name: "Load Projects", partition: "load", stage: null, isLoad: true },
  { name: "Withdrawn", partition: "withdrawn", stage: "withdrawn", isLoad: false },
  { name: "Cluster Projects-Withdrawn", partition: "cluster_withdrawn", stage: "withdrawn", isLoad: false },
  { name: "In Service", partition: "in_service", stage: "operational", isLoad: false },
];

export const nyisoQueueAdapter: QueueAdapter = {
  key: "nyiso",
  marketSlug: "nyiso",
  sourceInterfaceSlug: "nyiso-interconnection-queue",
  retrievalPurpose: "research",
  artifacts: [{ label: ARTIFACT, url: LANDING }],

  discover: discoverNyisoQueue,

  parse(artifacts, ref): QueueExtraction {
    const artifact = artifacts.get(ARTIFACT) ?? [...artifacts.values()][0];
    if (artifact === undefined) throw new QueueSourceFormatError("nyiso", `artifact ${ARTIFACT} was not retrieved`);

    let workbook: XlsxWorkbook;
    try {
      workbook = XlsxWorkbook.open(artifact.body);
    } catch (error) {
      throw new QueueSourceFormatError("nyiso", `the artifact is not a readable workbook: ${(error as Error).message}`);
    }

    const deferrals: QueueDeferral[] = [];
    const records: NormalizedQueueRecord[] = [];
    const legend = new Map<string, string>();

    for (const spec of SHEETS) {
      let sheet: XlsxSheet;
      try {
        sheet = workbook.sheet(spec.name);
      } catch {
        deferrals.push({ nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: spec.name,
          detail: `the workbook has no sheet named "${spec.name}"`,
          locator: { extractionMethod: "workbook_row", container: spec.name } });
        continue;
      }
      parseStatusLegend(sheet, legend);

      const { columns, headerRow } = headerIndex(sheet);
      const queueCol = column(columns, "Queue Pos.", "Queue Position", "Queue Number", "Queue");
      if (queueCol === null) {
        throw new QueueSourceFormatError("nyiso", `sheet ${spec.name} exposes no queue identifier`);
      }
      const nameCol = column(columns, "Project Name", "Project: Project Name");
      const developerCol = column(columns, "Developer/Interconnection Customer", "Owner/Developer",
        "Interconnection Customer Name", "Developer Name");
      const dateCol = column(columns, "Date of IR", "IR Submission Date", "Date of IR");
      const summerCol = column(columns, "SP (MW)");
      const winterCol = column(columns, "WP (MW)");
      const loadCol = column(columns, "Peak MW load");
      const storageCol = column(columns, "Energy Storage Capability");
      const fuelCol = column(columns, "Type/ Fuel", "Type/Fuel");
      const endUseCol = column(columns, "End-Use");
      const statusCol = column(columns, "Project Status #");
      const countyCol = column(columns, "County");
      const stateCol = column(columns, "State", "ST");
      const zoneCol = column(columns, "NYISO Zone", "Z");
      const poiCol = column(columns, "Points of Interconnection", "Interconnection Point");
      const locationCountyCol = column(columns, "Location County");
      const utilityCol = column(columns, "CTO/Utility", "Utility", "Utility ");
      const updatedCol = column(columns, "Last Updated Date", "Last Update");
      const codCol = column(columns, "Proposed COD");
      const backfeedCol = column(columns, "Proposed In-Service/Initial Backfeed Date",
        "Proposed Initial Backfeed Date");

      for (const row of sheet.rows) {
        if (row.row <= headerRow) continue;
        const nativeQueueId = text(row, queueCol);
        if (nativeQueueId === null || !QUEUE_ID.test(nativeQueueId.replace(/\s/g, ""))) continue;

        const locator = { extractionMethod: "workbook_row" as const, workbookSheet: sheet.name,
          workbookRow: row.row, container: spec.name };

        const statusCode = text(row, statusCol);
        const description = statusCode === null ? null : legend.get(statusCode.toUpperCase()) ?? null;
        if (statusCode !== null && description === null) {
          deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: statusCode,
            detail: "NYISO published a status code its own legend does not define", locator });
        }
        // Sheet membership outranks the code: a row on the Withdrawn sheet is withdrawn.
        const stage: LifecycleStage = spec.stage ?? stageFromLegend(description) ?? "unknown";

        const nativeFuel = text(row, fuelCol);
        const families: Technology[] = [];
        const resources: NormalizedResource[] = [];
        if (spec.isLoad) {
          families.push("load");
          resources.push({ componentOrdinal: 1, nativeTechnology: text(row, fuelCol), nativeFuel: null,
            technology: "load", isSourceSeparated: false });
        } else {
          const code = (nativeFuel ?? "").trim().toLowerCase();
          const family = TECHNOLOGY_BY_CODE.get(code) ?? technologyFor(nativeFuel);
          if (family === null && nativeFuel !== null) {
            deferrals.push({ nativeQueueId, deferralKind: "unmapped_technology", nativeValue: nativeFuel,
              detail: "NYISO published a type/fuel code this adapter does not map", locator });
          }
          families.push(family ?? "unknown");
          resources.push({ componentOrdinal: 1, nativeTechnology: null, nativeFuel,
            technology: family ?? "unknown", isSourceSeparated: false });
        }

        const quantities: NormalizedQuantity[] = [];
        const push = (field: string | null, nativeField: string,
          kind: NormalizedQuantity["quantityKind"], direction: NormalizedQuantity["direction"]) => {
          const raw = text(row, field);
          if (raw === null) return;
          const value = numeric(raw);
          if (value === null) {
            deferrals.push({ nativeQueueId, deferralKind: "unparseable_value", nativeValue: raw,
              detail: `NYISO ${nativeField} is not a number`, locator: { ...locator, field: nativeField } });
            return;
          }
          quantities.push({ nativeField, quantityKind: kind, value, unit: "MW",
            resourceOrdinal: null, direction });
        };
        if (spec.isLoad) {
          // A load's MW is a withdrawal from the grid and carries its own quantity kind, so it
          // can never be added to a generation total by accident.
          push(loadCol, "Peak MW load", "other_mw", "withdrawal");
        } else {
          push(summerCol, "SP (MW)", "summer_mw", "injection");
          push(winterCol, "WP (MW)", "winter_mw", "injection");
          push(storageCol, "Energy Storage Capability", "other_mw", "bidirectional");
        }

        const nativeStatus: Record<string, string> = { sourceSheet: sheet.name };
        if (statusCode !== null) nativeStatus.projectStatusCode = statusCode;
        if (description !== null) nativeStatus.projectStatusDescription = description;
        const updated = text(row, updatedCol);
        if (updated !== null) nativeStatus.lastUpdated = updated;

        const nativeEndUse = spec.isLoad ? text(row, endUseCol) : null;
        const endUse = spec.isLoad ? nyisoEndUse(nativeEndUse) : null;
        if (endUse !== null && !endUse.known) {
          deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: nativeEndUse,
            detail: "NYISO published a load end-use code this adapter does not map", locator });
        }
        if (nativeEndUse !== null) nativeStatus.endUse = nativeEndUse;

        const payload: Record<string, unknown> = {};
        for (const [col, cell] of row.cells) {
          if (cell.value !== null && cell.value.trim() !== "") payload[col] = cell.value;
        }

        records.push({
          nativeQueueId: `${spec.isLoad ? "L" : "Q"}${nativeQueueId}`,
          nativeProjectName: text(row, nameCol),
          nativeCustomer: text(row, developerCol),
          nativeStatus,
          // Where a sheet asserts the stage and the row carries no status code, the sheet itself
          // is the publisher's statement and is recorded as such. An operational observation must
          // always be able to say what made it operational.
          nativeStatusDisplay: description ?? statusCode
            ?? (spec.stage === null ? null : `Listed on the NYISO ${sheet.name.trim()} sheet`),
          lifecycleStage: stage,
          requestClass: spec.isLoad ? "load" : requestClassFor(families),
          requestedOn: date(row, dateCol),
          proposedInServiceOn: date(row, codCol) ?? date(row, backfeedCol),
          revisedInServiceOn: null,
          // NYISO publishes no actual in-service date. Membership of the In Service sheet is the
          // operational signal, and the date it happened is not in the workbook.
          actualInServiceOn: null,
          agreementExecutedOn: null,
          withdrawnOn: null,
          nativeState: text(row, stateCol),
          nativeCounty: text(row, countyCol) ?? text(row, locationCountyCol),
          nativeZone: text(row, zoneCol),
          nativePoi: text(row, poiCol),
          nativeSubstation: text(row, poiCol),
          nativeTransmissionOwner: text(row, utilityCol),
          sourcePartition: spec.partition,
          nativeEndUse,
          loadEndUse: endUse === null ? null : endUse.normalized,
          quantities,
          resources,
          locator,
          payload,
          canonical: true,
        });
      }
    }

    if (records.length === 0) throw new QueueSourceFormatError("nyiso", "the workbook produced no queue rows");

    return {
      snapshot: {
        nativeSnapshotKey: ref?.reportPeriod === null || ref?.reportPeriod === undefined
          ? null : `queue-${ref.reportPeriod.slice(0, 7)}`,
        sourcePublishedAt: ref?.publishedAt ?? null,
      },
      records,
      deferrals,
    };
  },
};
