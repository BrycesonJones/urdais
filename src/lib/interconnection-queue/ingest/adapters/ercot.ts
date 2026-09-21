/**
 * ERCOT Generator Interconnection Status Report.
 *
 * The first market whose history has to be accumulated rather than read out of the current file.
 * ERCOT publishes a monthly workbook and keeps every one: 99 artifacts across 93 report periods
 * on the Market Information System, back to December 2018, with six corrections republished as
 * separate files. Each artifact becomes its own snapshot, so the archive is 99 observed source
 * states and a project's presence in each of them is a fact the raw records already record.
 *
 * Three things about this workbook need saying.
 *
 * Its header is stacked. The column names sit on row 23 with continuations on rows 24 through 27,
 * so a reader pinned to one row gets "Changes from Last Report" where it expected a milestone
 * date. The resolver below reconstructs each column's full label from the whole header block and
 * matches semantically, because the block has moved between historical variants.
 *
 * Its MW can be negative. The sheet says so: capacity for repowering projects "are reported on a
 * net change basis with respect to the original capacity amount, and thus may have zero or
 * negative values". A negative queue MW is a real reduction, not a data error and not a
 * withdrawal, and it is stored exactly as published.
 *
 * Its batteries are not identified by fuel. 866 of the current large-generator rows carry
 * technology BA against fuel OTH. Classifying on fuel alone files every battery in the fleet as
 * "other". Both native fields are kept and the pair decides.
 */

import { XlsxWorkbook, type XlsxRow, type XlsxSheet } from "@/lib/power-delivery/planning/xlsx/workbook";
import { excelSerialDate, isoDate, numeric, trimmed }
  from "@/lib/interconnection-queue/ingest/normalize";
import { QueueSourceFormatError, type NormalizedQuantity, type NormalizedQueueRecord,
  type NormalizedResource, type QueueAdapter, type QueueArtifactRef, type QueueDeferral,
  type QueueExtraction } from "@/lib/interconnection-queue/ingest/types";
import type { LifecycleStage, Technology } from "@/lib/interconnection-queue/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

const ARCHIVE_URL = "https://www.ercot.com/misapp/servlets/IceDocListJsonWS?reportTypeId=15933";
const DOWNLOAD = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId=";

/**
 * The project sheet has been named three ways across the archive, and the names overlap.
 *
 * Until 2021 there was one sheet called "Project Details". From January 2022 a separate
 * "Project Details - Small Gen" appears beside it while the main sheet keeps its old name. Later
 * the main sheet becomes "Project Details - Large Gen". Matching on the exact current name loses
 * every artifact before that rename, which is 41 of the 99.
 */
const SHEET_PATTERNS = [
  { pattern: /^project details(?: - large gen)?$/i, sizeCategory: "large_gen" },
  { pattern: /^project details - small gen$/i, sizeCategory: "small_gen" },
] as const;

const MONTHS = ["january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december"] as const;

/** `GIS_Report_June_2023_Corrected` to a period and a correction flag. */
export function ercotReportPeriod(friendlyName: string): { period: string | null; isCorrection: boolean } {
  const isCorrection = /correct|revis/i.test(friendlyName);
  const body = friendlyName.replace(/^GIS_Report_?/i, "");
  const match = /^([A-Za-z]+)_?(\d{4})/.exec(body);
  if (match === null) return { period: null, isCorrection };
  const name = match[1]!.toLowerCase();
  const index = MONTHS.findIndex((month) => month === name || month.slice(0, 3) === name.slice(0, 3));
  if (index === -1) return { period: null, isCorrection };
  return { period: `${match[2]}-${String(index + 1).padStart(2, "0")}-01`, isCorrection };
}

type MisDocument = {
  DocID: string; FriendlyName: string; PublishDate: string; Extension: string; ContentSize: string;
};

/**
 * Every GIS workbook the MIS holds, oldest publication first.
 *
 * Order matters: a correction published after the artifact it corrects must be ingested after it,
 * or the original would end up canonical for that period.
 */
export async function discoverErcotArchive(
  fetch: (url: string) => Promise<RetrievedArtifact>,
): Promise<QueueArtifactRef[]> {
  const listing = await fetch(ARCHIVE_URL);
  let parsed: unknown;
  try {
    parsed = JSON.parse(listing.body.toString("utf8"));
  } catch (error) {
    throw new QueueSourceFormatError("ercot", `the MIS listing is not JSON: ${(error as Error).message}`);
  }
  const documents = (parsed as { ListDocsByRptTypeRes?: { DocumentList?: { Document?: MisDocument }[] } })
    ?.ListDocsByRptTypeRes?.DocumentList;
  if (!Array.isArray(documents)) {
    throw new QueueSourceFormatError("ercot", "the MIS listing has no DocumentList");
  }

  const refs: QueueArtifactRef[] = [];
  for (const entry of documents) {
    const document = entry?.Document;
    if (document === undefined) continue;
    // The report type also carries the co-located battery report, which is a different artifact.
    if (!/^GIS_Report/i.test(document.FriendlyName)) continue;
    if (document.Extension.toLowerCase() !== "xlsx") continue;
    const { period, isCorrection } = ercotReportPeriod(document.FriendlyName);
    refs.push({
      label: document.FriendlyName,
      url: `${DOWNLOAD}${document.DocID}`,
      reportPeriod: period,
      publishedAt: new Date(document.PublishDate).toISOString(),
      isCorrection,
      nativeDocumentId: document.DocID,
      archiveMetadata: {
        friendlyName: document.FriendlyName, publishDate: document.PublishDate,
        contentSize: document.ContentSize, reportTypeId: "15933",
      },
    });
  }
  if (refs.length === 0) throw new QueueSourceFormatError("ercot", "the MIS listing contains no GIS workbooks");
  // Ordered by the period each artifact reports on, then by when it was published.
  //
  // Publication order alone is wrong here: ERCOT uploaded its whole December 2018 to April 2020
  // backlog on a single day in June 2020, so publication date says nothing about which month a
  // file describes. Sorting by report period first puts the archive in true chronological order,
  // and the secondary sort still puts a correction after the artifact it corrects.
  refs.sort((a, b) => {
    const left = a.reportPeriod ?? "9999-99-99";
    const right = b.reportPeriod ?? "9999-99-99";
    if (left !== right) return left < right ? -1 : 1;
    return (a.publishedAt ?? "") < (b.publishedAt ?? "") ? -1 : 1;
  });
  return refs;
}

// ------------------------------------------------------------------ the stacked header

const squash = (value: string): string => value.replace(/\s+/g, " ").trim();

/**
 * Reconstruct each column's full label from the header block.
 *
 * ERCOT stacks a label across consecutive rows — "Approval Date for" / "Submission of Proof of" /
 * "Site Control" is one column name written on three rows — so a column's label is the
 * concatenation of every non-empty cell in its column within the block.
 */
export function resolveHeader(sheet: XlsxSheet): { columns: Map<string, string>; headerRow: number } {
  // The header block starts at the row holding the identifier column and runs until data begins.
  const identifier = sheet.rows.find((row) =>
    [...row.cells.values()].some((cell) => cell.value !== null && /^INR$/i.test(cell.value.trim())));
  if (identifier === undefined) {
    throw new QueueSourceFormatError("ercot", `no INR column was found in sheet ${sheet.name}`);
  }
  // Data begins at the first row whose identifier cell looks like a real INR.
  const identifierColumn = [...identifier.cells.entries()]
    .find(([, cell]) => cell.value !== null && /^INR$/i.test(cell.value.trim()))![0];
  const firstData = sheet.rows.find((row) =>
    row.row > identifier.row
    && /^\d{2}INR\d+[a-z]?$/i.test((row.cells.get(identifierColumn)?.value ?? "").trim()));
  if (firstData === undefined) {
    throw new QueueSourceFormatError("ercot", `sheet ${sheet.name} has a header but no project rows`);
  }

  const parts = new Map<string, string[]>();
  for (const row of sheet.rows) {
    if (row.row < identifier.row || row.row >= firstData.row) continue;
    for (const [column, cell] of row.cells) {
      const text = cell.value === null ? "" : squash(cell.value);
      if (text === "") continue;
      const list = parts.get(column) ?? [];
      list.push(text);
      parts.set(column, list);
    }
  }
  const columns = new Map<string, string>();
  for (const [column, list] of parts) columns.set(column, squash(list.join(" ")));
  return { columns, headerRow: firstData.row - 1 };
}

/** Find the column whose reconstructed label matches, by exact text then by pattern. */
function column(columns: Map<string, string>, exact: string[], pattern?: RegExp): string | null {
  for (const [col, label] of columns) {
    if (exact.some((candidate) => label.toLowerCase() === candidate.toLowerCase())) return col;
  }
  if (pattern !== undefined) {
    for (const [col, label] of columns) if (pattern.test(label)) return col;
  }
  return null;
}

const text = (row: XlsxRow, col: string | null): string | null =>
  col === null ? null : trimmed(row.cells.get(col)?.value ?? null);

const date = (row: XlsxRow, col: string | null): string | null => {
  const raw = text(row, col);
  if (raw === null) return null;
  // ERCOT writes 1-1-1900 for "a real date is not available"; excelSerialDate's floor rejects it.
  return excelSerialDate(raw) ?? isoDate(raw);
};

/**
 * ERCOT's technology code decides, and the fuel qualifies it.
 *
 * BA is a battery whatever the fuel says, and 866 of the current large-generator rows are exactly
 * that: technology BA against fuel OTH.
 */
export function ercotTechnology(fuel: string | null, technology: string | null): Technology | null {
  const code = (technology ?? "").trim().toUpperCase();
  switch (code) {
    case "BA": return "battery_storage";
    case "PV": return "solar";
    case "WT": return "wind";
    case "CC": case "GT": case "IC": case "ST": return fuelFamily(fuel) ?? "natural_gas";
    case "OT": return fuelFamily(fuel) ?? "other_generation";
    default: break;
  }
  return fuelFamily(fuel);
}

function fuelFamily(fuel: string | null): Technology | null {
  switch ((fuel ?? "").trim().toUpperCase()) {
    case "SOL": return "solar";
    case "WIN": return "wind";
    case "GAS": return "natural_gas";
    case "NUC": return "nuclear";
    case "COA": case "PET": return "coal";
    case "HYD": case "WAT": return "hydro";
    case "BIO": return "biomass";
    case "GEO": return "geothermal";
    case "OIL": return "other_generation";
    case "OTH": return null;
    default: return null;
  }
}

/** ERCOT's study phase is a sentence, and it decomposes into three independent facts. */
export function ercotLifecycle(phase: string | null, energized: string | null): {
  stage: LifecycleStage; unmapped: string | null;
} {
  const value = (phase ?? "").trim();
  if (value === "") return { stage: "unknown", unmapped: null };
  const hasAgreement = /(?:^|,)\s*IA\b/.test(value) && !/No IA/i.test(value);
  const studyStarted = /SS Started|SS Completed|FIS Started|FIS Completed/i.test(value);
  // An approved-for-energization date is ERCOT stating a milestone was reached. It is not an
  // actual commercial operation date and never makes a project operational: ERCOT publishes no
  // actual COD in this workbook at all.
  if (hasAgreement) return { stage: energized === null ? "agreement_executed" : "under_construction", unmapped: null };
  if (studyStarted) return { stage: "study", unmapped: null };
  return { stage: "unknown", unmapped: value };
}

function projectRows(
  sheet: XlsxSheet, sizeCategory: string, deferrals: QueueDeferral[], label: string,
): NormalizedQueueRecord[] {
  const { columns, headerRow } = resolveHeader(sheet);
  const inr = column(columns, ["INR"])!;
  const name = column(columns, ["Project Name"], /project name/i);
  const phase = column(columns, ["GIM Study Phase"], /study phase/i);
  const entity = column(columns, ["Interconnecting Entity"], /interconnecting entity/i);
  const poi = column(columns, ["POI Location"], /poi location/i);
  const county = column(columns, ["County"], /^county$/i);
  const zone = column(columns, ["CDR Reporting Zone"], /reporting zone/i);
  const cod = column(columns, ["Projected COD"], /projected cod/i);
  const fuelCol = column(columns, ["Fuel"], /^fuel$/i);
  const technologyCol = column(columns, ["Technology"], /^technology$/i);
  const capacity = column(columns, ["Capacity (MW)"], /capacity \(mw\)|^capacity$/i);
  const energization = column(columns, [], /approved for energization/i);
  const synchronization = column(columns, [], /approved for synchronization/i);
  const constructionStart = column(columns, [], /construction start/i);

  // Identity and quantity are required everywhere. The study phase is not: ERCOT publishes one
  // for large generators and tracks small ones by a model-ready date instead, so a small-gen
  // sheet with no phase is the source being different rather than the reader being broken.
  const required: [string, string | null][] = [["INR", inr], ["Capacity (MW)", capacity],
    ["Fuel", fuelCol], ["Technology", technologyCol]];
  const missing = required.filter(([, col]) => col === null).map(([field]) => field);
  if (missing.length > 0) {
    throw new QueueSourceFormatError("ercot",
      `sheet ${sheet.name} in ${label} does not expose ${missing.join(", ")}; `
      + `resolved columns were ${[...columns.values()].slice(0, 12).join(" | ")}`);
  }
  if (phase === null) {
    // Recorded once for the sheet rather than once per row: it is one fact about the artifact.
    deferrals.push({
      nativeQueueId: null, deferralKind: "unmapped_status", nativeValue: null,
      detail: `${label} sheet ${sheet.name} publishes no study phase, so every request in it is `
        + "held at unknown rather than assigned a stage the source does not state",
      locator: { extractionMethod: "workbook_row", workbookSheet: sheet.name, container: label },
    });
  }

  const records: NormalizedQueueRecord[] = [];
  for (const row of sheet.rows) {
    if (row.row <= headerRow) continue;
    const nativeQueueId = text(row, inr);
    if (nativeQueueId === null || !/^\d{2}INR\d+[a-z]?$/i.test(nativeQueueId)) continue;

    const locator = { extractionMethod: "workbook_row" as const, workbookSheet: sheet.name,
      workbookRow: row.row, container: label };

    const nativePhase = text(row, phase);
    const energizedOn = date(row, energization);
    const { stage, unmapped } = phase === null
      ? { stage: "unknown" as LifecycleStage, unmapped: null }
      : ercotLifecycle(nativePhase, energizedOn);
    if (unmapped !== null) {
      deferrals.push({ nativeQueueId, deferralKind: "unmapped_status", nativeValue: unmapped,
        detail: "ERCOT published a study phase this adapter does not decompose", locator });
    }

    const nativeFuel = text(row, fuelCol);
    const nativeTechnology = text(row, technologyCol);
    const family = ercotTechnology(nativeFuel, nativeTechnology);
    if (family === null && (nativeFuel !== null || nativeTechnology !== null)) {
      deferrals.push({ nativeQueueId, deferralKind: "unmapped_technology",
        nativeValue: `${nativeFuel ?? ""}/${nativeTechnology ?? ""}`,
        detail: "ERCOT published a fuel and technology pair this adapter does not map", locator });
    }
    const resources: NormalizedResource[] = [{
      componentOrdinal: 1, nativeTechnology, nativeFuel,
      technology: family ?? "unknown",
      // ERCOT marks co-location in a separate monthly report, not in this row.
      isSourceSeparated: false,
    }];

    const quantities: NormalizedQuantity[] = [];
    const raw = text(row, capacity);
    const value = numeric(raw);
    if (raw !== null && value === null) {
      deferrals.push({ nativeQueueId, deferralKind: "unparseable_value", nativeValue: raw,
        detail: "ERCOT Capacity (MW) is not a number", locator: { ...locator, field: "Capacity (MW)" } });
    } else if (value !== null) {
      // Stored exactly as published, sign included. A repowering that reduces capacity is a
      // negative number and means what it says.
      quantities.push({ nativeField: "Capacity (MW)", quantityKind: "maximum_facility_output",
        value, unit: "MW", resourceOrdinal: null, direction: "injection" });
    }

    const payload: Record<string, unknown> = {};
    for (const [col, cell] of row.cells) {
      if (cell.value !== null && cell.value.trim() !== "") {
        payload[`${col}:${columns.get(col) ?? col}`] = cell.value;
      }
    }

    const nativeStatus: Record<string, string> = { sizeCategory };
    if (nativePhase !== null) nativeStatus.gimStudyPhase = nativePhase;
    if (nativeFuel !== null) nativeStatus.fuel = nativeFuel;
    if (nativeTechnology !== null) nativeStatus.technology = nativeTechnology;
    const synchronizedOn = date(row, synchronization);
    if (energizedOn !== null) nativeStatus.approvedForEnergization = energizedOn;
    if (synchronizedOn !== null) nativeStatus.approvedForSynchronization = synchronizedOn;
    if (Object.keys(nativeStatus).length === 1) nativeStatus.gimStudyPhase = "";

    records.push({
      nativeQueueId,
      nativeProjectName: text(row, name),
      nativeCustomer: text(row, entity),
      nativeStatus,
      nativeStatusDisplay: nativePhase,
      lifecycleStage: stage,
      requestClass: family === "battery_storage" ? "storage" : family === null ? "unknown" : "generation",
      requestedOn: null,
      proposedInServiceOn: date(row, cod),
      revisedInServiceOn: null,
      // ERCOT publishes no actual commercial operation date in this workbook. Energization and
      // synchronization are milestones and are kept as native status, never promoted to a COD.
      actualInServiceOn: null,
      agreementExecutedOn: null,
      withdrawnOn: null,
      nativeState: "TX",
      nativeCounty: text(row, county),
      nativeZone: text(row, zone),
      nativePoi: text(row, poi),
      nativeSubstation: text(row, poi),
      nativeTransmissionOwner: null,
      sourcePartition: sizeCategory,
      quantities,
      resources,
      locator,
      payload,
      canonical: true,
      ...(constructionStart === null ? {} : {}),
    });
  }
  return records;
}

export const ercotQueueAdapter: QueueAdapter = {
  key: "ercot",
  marketSlug: "ercot",
  sourceInterfaceSlug: "ercot-gis-report",
  retrievalPurpose: "research",
  artifacts: [{ label: "gis-report", url: ARCHIVE_URL }],

  discover: discoverErcotArchive,

  parse(artifacts, ref): QueueExtraction {
    const artifact = [...artifacts.values()][0];
    if (artifact === undefined) throw new QueueSourceFormatError("ercot", "no artifact was retrieved");

    let workbook: XlsxWorkbook;
    try {
      workbook = XlsxWorkbook.open(artifact.body);
    } catch (error) {
      throw new QueueSourceFormatError("ercot", `the artifact is not a readable workbook: ${(error as Error).message}`);
    }

    const deferrals: QueueDeferral[] = [];
    const records: NormalizedQueueRecord[] = [];
    const label = ref?.label ?? artifact.label;

    let found = 0;
    for (const { pattern, sizeCategory } of SHEET_PATTERNS) {
      const name = workbook.sheetNames().find((candidate) => pattern.test(candidate.trim()));
      if (name === undefined) {
        // A small-generator sheet simply does not exist before 2022. Its absence is recorded
        // rather than assumed away; an artifact with no project sheet at all fails below.
        if (sizeCategory === "small_gen") continue;
        deferrals.push({ nativeQueueId: null, deferralKind: "unsupported_row", nativeValue: pattern.source,
          detail: `${label} has no sheet matching ${pattern.source}`,
          locator: { extractionMethod: "workbook_row", container: label } });
        continue;
      }
      found += 1;
      records.push(...projectRows(workbook.sheet(name), sizeCategory, deferrals, label));
    }
    if (found === 0) {
      throw new QueueSourceFormatError("ercot", `${label} exposes neither project details sheet`);
    }
    if (records.length === 0) {
      throw new QueueSourceFormatError("ercot", `${label} produced no project rows`);
    }

    return {
      snapshot: {
        // The period the workbook reports on, and whether this artifact is a reissue of it. Both
        // come from the publisher's own archive index rather than from the file's contents.
        nativeSnapshotKey: ref?.reportPeriod === null || ref?.reportPeriod === undefined
          ? `gis-${artifact.sha256.slice(0, 12)}`
          : `gis-${ref.reportPeriod.slice(0, 7)}${ref.isCorrection ? "-correction" : ""}`,
        sourcePublishedAt: ref?.publishedAt ?? null,
      },
      records,
      deferrals,
    };
  },
};
