/**
 * ERCOT Transmission Project and Information Tracking (TPIT).
 *
 * One XLSX, republished in place roughly three times a year. Four sheets — Future, Planned,
 * Completed, Cancelled — share a single 33-column schema and partition the tracker with no
 * overlap at all: 1,424 / 358 / 262 / 78 distinct project numbers, zero intersection between any
 * pair.
 *
 * That partition is the lifecycle. The workbook does carry a Transmission Status column, and this
 * adapter reads it, stores it and mostly ignores it, because ERCOT's own field dictionary marks it
 * Optional while marking Actual In-Service Date "Required once energized in the field" — and
 * because it disagrees with sheet membership on 117 of 262 completed rows. Trusting it would
 * misfile nearly half of ERCOT's completions.
 *
 * Nine completed rows carry an actual date of year 9999. ERCOT is asserting the project is
 * complete and has not said when. Those rows stay in_service with an unknown date.
 *
 * The contact sheet is never opened. It holds names, emails and phone numbers, and GBV-1 excluded
 * it; the domain-violation check proves it never arrived.
 */

import { createHash } from "node:crypto";

import { parseQuantity, parseSpreadsheetDate } from "@/lib/grid-buildout/dates";
import type {
  BuildoutAdapter, ParsedDeferral, ParsedMilestone, ParsedProjectRow, ParsedQuantityValue,
  ParsedRelationship, ParsedSnapshot,
} from "@/lib/grid-buildout/ingest/types";
import { BuildoutSourceShapeError } from "@/lib/grid-buildout/types";
import type { DriverBasis, DriverClass, LifecycleBasis, LifecycleState } from "@/lib/grid-buildout/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { XlsxWorkbook, cellText, indexToColumn } from "@/lib/power-delivery/planning/xlsx/workbook";

/**
 * The workbook helpers are 1-based: `indexToColumn(1)` is column A. The column map below is
 * 0-based so it reads against the verified GBV-1 inventory, so every lookup shifts by one.
 */
const columnLetter = (zeroBased: number): string => indexToColumn(zeroBased + 1);

export const ERCOT_ARTIFACT_URL =
  "https://www.ercot.com/files/docs/2022/03/02/ERCOT-July-Ad-Hoc-TPIT-No-Cost-071326-UPDATE.xlsx";

/** The header sits on row 2 and data begins on row 3 in every lifecycle sheet. */
const HEADER_ROW = 2;
const FIRST_DATA_ROW = 3;

/**
 * Sheet names carry the vintage (`FutureTPIT071326NoCost`), so they are matched by prefix. The
 * lifecycle a sheet asserts is a property of the list, not of anything inside the row.
 */
const LIFECYCLE_SHEETS: { prefix: string; list: string; state: LifecycleState | null }[] = [
  { prefix: "Future", list: "future", state: null },
  { prefix: "Planned", list: "planned", state: null },
  { prefix: "Completed", list: "completed", state: "in_service" },
  { prefix: "Cancelled", list: "cancelled", state: "cancelled" },
];

/** Sheets that must never be read. The contact sheet is personal data. */
const EXCLUDED_SHEET_PREFIXES = ["TransmissionOwnerProjContac", "TSPResponsibility", "Cost Summary", "ImprovementCost"];

/** Column index (0-based) to the publisher's own heading, as verified in GBV-1. */
export const ERCOT_COLUMNS: Record<string, number> = {
  projectNumber: 0,
  title: 1,
  description: 2,
  comments: 3,
  terminalFrom: 4,
  terminalTo: 5,
  status: 6,
  associatedProjects: 7,
  transmissionOwner: 8,
  ownerProjectNumber: 10,
  projectedInService: 11,
  actualInService: 12,
  serviceLevelKv: 13,
  milesNew: 14,
  milesRebuilt: 15,
  autotransformerMva: 16,
  reactiveMvar: 17,
  countyFrom: 18,
  countyTo: 19,
  tier: 20,
  rpgNumber: 21,
  rpgSubmitted: 22,
  rpgReviewCompleted: 23,
  bodReviewCompleted: 24,
  sswgBuses: 25,
  inSswgBaseCases: 26,
  partOfInterface: 27,
  phaseNumber: 30,
  modProjectNumber: 31,
  rtpProjectNumber: 32,
};

/** Column 9 is TSP/Company Contact. It is never read, so it is absent from the map above. */
export const ERCOT_CONTACT_COLUMN_INDEX = 9;

/**
 * An ERCOT interconnection request number, e.g. `23INR0419`. This is an explicit publisher
 * identifier tying the row to the interconnection process, so it is sufficient evidence for a
 * driver class. Wording alone is not.
 */
const INTERCONNECTION_REQUEST = /\b\d{2}INR\d{3,5}\b/i;

/** Generation and storage wording. A signal only — it yields `unknown` and a recorded gap. */
const GENERATION_WORDING =
  /\b(solar|wind|BESS|battery|storage|generator|genco|gen[- ]?tie|interconnect\w*)\b/i;

/** A point of delivery serves load. Demand connection, not network buildout. */
const POINT_OF_DELIVERY = /\bPOD\b|point of delivery/i;

function normaliseStatus(raw: string | null): LifecycleState | null {
  if (raw === null) return null;
  switch (raw.trim().toLowerCase()) {
    case "under construction": return "under_construction";
    case "planned": return "planned";
    case "conceptual": return "proposed";
    default: return null;
  }
}

function classifyDriver(text: string): { klass: DriverClass; basis: DriverBasis; evidence: string | null } {
  const request = INTERCONNECTION_REQUEST.exec(text);
  if (request !== null) {
    return { klass: "generator_interconnection", basis: "publisher_identifier", evidence: request[0] };
  }
  if (POINT_OF_DELIVERY.test(text)) {
    // "POD" is ERCOT's own abbreviation in the project title, not an inference from prose.
    return { klass: "load_interconnection", basis: "publisher_identifier", evidence: "point of delivery" };
  }
  // Everything else is unknown. ERCOT publishes no driver field, and wording is not evidence.
  return { klass: "unknown", basis: GENERATION_WORDING.test(text) ? "text_signal_only" : "none", evidence: null };
}

export const ercotBuildoutAdapter: BuildoutAdapter = {
  key: "ercot",
  sourceSlug: "ercot-tpit-transmission-projects",
  marketSlug: "ercot",

  artifactUrl(): string {
    return ERCOT_ARTIFACT_URL;
  },

  parse(artifact: RetrievedArtifact): ParsedSnapshot {
    const workbook = XlsxWorkbook.open(artifact.body);
    const names = workbook.sheetNames();
    const deferrals: ParsedDeferral[] = [];
    const lists: ParsedSnapshot["lists"] = [];

    for (const spec of LIFECYCLE_SHEETS) {
      const name = names.find((candidate) => candidate.startsWith(spec.prefix));
      if (name === undefined) {
        throw new BuildoutSourceShapeError(
          `ERCOT TPIT has no sheet beginning "${spec.prefix}"; sheets are ${names.join(", ")}`);
      }
      if (EXCLUDED_SHEET_PREFIXES.some((excluded) => name.startsWith(excluded))) continue;

      const sheet = workbook.sheet(name);
      const header = (index: number): string | null => cellText(sheet, HEADER_ROW, columnLetter(index));

      // A moved or renamed column must fail loudly rather than silently read the wrong field.
      const projectHeader = header(ERCOT_COLUMNS.projectNumber!);
      if (projectHeader === null || !/ERCOT Project Number/i.test(projectHeader)) {
        throw new BuildoutSourceShapeError(
          `ERCOT sheet ${name} column A is "${projectHeader ?? "(empty)"}", expected ERCOT Project Number`);
      }
      const actualHeader = header(ERCOT_COLUMNS.actualInService!);
      if (actualHeader === null || !/Actual In-Service Date/i.test(actualHeader)) {
        throw new BuildoutSourceShapeError(
          `ERCOT sheet ${name} column M is "${actualHeader ?? "(empty)"}", expected Actual In-Service Date`);
      }

      const rows: ParsedProjectRow[] = [];
      let ordinal = 0;

      for (const row of sheet.rows) {
        if (row.row < FIRST_DATA_ROW) continue;
        const text = (index: number): string | null => {
          const value = row.cells.get(columnLetter(index))?.value ?? null;
          return value === null || value.trim() === "" ? null : value.trim();
        };
        const nativeId = text(ERCOT_COLUMNS.projectNumber!);
        if (nativeId === null) continue;
        ordinal += 1;

        const payload: Record<string, string> = {};
        for (const [field, index] of Object.entries(ERCOT_COLUMNS)) {
          const value = text(index);
          if (value !== null) payload[field] = value;
        }
        payload.nativeList = spec.list;

        const nativeStatus = text(ERCOT_COLUMNS.status!);
        const statusState = normaliseStatus(nativeStatus);

        // Sheet membership wins where the sheet asserts a state. Only the two sheets that do not
        // assert one fall back to the optional status column.
        let state: LifecycleState;
        let basis: LifecycleBasis;
        if (spec.state !== null) {
          state = spec.state;
          basis = "source_list_membership";
          if (statusState !== null && statusState !== spec.state) {
            deferrals.push({
              reason: "status_contradicts_list", nativeList: spec.list, nativeKey: nativeId,
              nativeValue: nativeStatus,
              detail: `${spec.list} sheet membership asserts ${spec.state}; the optional status column says `
                + `"${nativeStatus}". Membership is authoritative and the status is retained as evidence.`,
              rowOrdinal: ordinal,
            });
          }
        } else if (statusState !== null) {
          state = statusState;
          basis = "native_status_text";
        } else {
          state = "unknown";
          basis = "unmapped";
          deferrals.push({
            reason: "unmapped_lifecycle", nativeList: spec.list, nativeKey: nativeId,
            nativeValue: nativeStatus,
            detail: nativeStatus === null
              ? `${spec.list} sheet carries no state and the optional status column is empty.`
              : `${spec.list} sheet carries no state and status "${nativeStatus}" has no defensible class.`,
            rowOrdinal: ordinal,
          });
        }

        const milestones: ParsedMilestone[] = [];
        const addDate = (
          kind: ParsedMilestone["kind"], index: number, field: string,
        ): void => {
          // ERCOT asks TSPs for Month/Yr, so a day component is not asserted even though the cells
          // are typed as dates.
          const parsed = parseSpreadsheetDate(text(index), { precision: "month" });
          if (parsed.quality === "not_reported") return;
          milestones.push({
            kind, vintageLabel: null, date: parsed.date, quality: parsed.quality,
            precision: parsed.precision, native: parsed.native, sourceField: field,
          });
          if (parsed.quality === "sentinel_unknown") {
            deferrals.push({
              reason: "sentinel_date", nativeList: spec.list, nativeKey: nativeId,
              nativeValue: parsed.native,
              detail: `${field} holds ERCOT's placeholder rather than a date. The lifecycle state is `
                + `unaffected; only the date is unknown.`,
              rowOrdinal: ordinal,
            });
          } else if (parsed.quality === "unparseable") {
            deferrals.push({
              reason: "unparseable_date", nativeList: spec.list, nativeKey: nativeId,
              nativeValue: parsed.native, detail: `${field} could not be read as a date.`, rowOrdinal: ordinal,
            });
          }
        };
        addDate("target_in_service_current", ERCOT_COLUMNS.projectedInService!, "Projected In-Service Date (Month/Yr)");
        addDate("actual_in_service", ERCOT_COLUMNS.actualInService!, "Actual In-Service Date (Month/Yr)");
        addDate("approved", ERCOT_COLUMNS.rpgReviewCompleted!, "Date RPG Review Completed (Month/Yr)");

        const quantities: ParsedQuantityValue[] = [];
        const addQuantity = (kind: ParsedQuantityValue["kind"], index: number, field: string): void => {
          const raw = text(index);
          const parsed = parseQuantity(raw);
          if (raw !== null && parsed.value === null) {
            deferrals.push({
              reason: "unparseable_quantity", nativeList: spec.list, nativeKey: nativeId,
              nativeValue: raw, detail: `${field} could not be read as a number.`, rowOrdinal: ordinal,
            });
          }
          quantities.push({ kind, value: parsed.value, isReported: parsed.isReported, native: parsed.native });
        };
        addQuantity("service_level_kv", ERCOT_COLUMNS.serviceLevelKv!, "Service Level kV");
        addQuantity("circuit_miles_new", ERCOT_COLUMNS.milesNew!, "Trans Circuit Miles New");
        addQuantity("circuit_miles_rebuilt", ERCOT_COLUMNS.milesRebuilt!, "Trans Circuit Miles Rebuilt");
        addQuantity("autotransformer_capacity_mva", ERCOT_COLUMNS.autotransformerMva!, "Autotransformer Capacity (MVA)");
        addQuantity("reactive_capability_mvar", ERCOT_COLUMNS.reactiveMvar!, "Reactive Capability Added (Mvar)");

        const relationships: ParsedRelationship[] = [];
        const associated = text(ERCOT_COLUMNS.associatedProjects!);
        if (associated !== null) {
          for (const piece of associated.split(/[,;/]/)) {
            const related = piece.trim();
            // Never join on a name. Only an identifier-shaped token is a stated relationship.
            if (related !== "" && /^[0-9]{3,}[A-Z]?$/i.test(related) && related !== nativeId) {
              relationships.push({ kind: "associated_with", relatedNativeId: related });
            }
          }
        }
        const rtp = text(ERCOT_COLUMNS.rtpProjectNumber!);
        if (rtp !== null) relationships.push({ kind: "references_plan_item", relatedNativeId: rtp });

        const driver = classifyDriver(`${payload.title ?? ""} ${payload.description ?? ""}`);
        if (driver.basis === "text_signal_only") {
          deferrals.push({
            reason: "driver_signal_only", nativeList: spec.list, nativeKey: nativeId,
            nativeValue: payload.title ?? null,
            detail: "Wording suggests interconnection-driven work and ERCOT states no driver. "
              + "Classified unknown and excluded from headline metrics.",
            rowOrdinal: ordinal,
          });
        }


        rows.push({
          rowOrdinal: ordinal, nativeId, title: payload.title ?? null,
          description: payload.description ?? null, sponsor: payload.transmissionOwner ?? null,
          nativeStatus, tier: payload.tier ?? null,
          lifecycle: { state, basis }, driver, milestones, quantities, relationships, payload,
        });
      }

      lists.push({ name: spec.list, rows });
    }

    return {
      nativeSnapshotKey: ercotSnapshotKey(names),
      sourcePublishedAt: null,
      lists,
      deferrals,
    };
  },
};

/**
 * ERCOT stamps the vintage into its sheet names (`CompletedTPIT071326NoCost`), so the key is read
 * from there rather than from the URL, which never changes.
 */
export function ercotSnapshotKey(sheetNames: readonly string[]): string {
  for (const name of sheetNames) {
    const match = /TPIT(\d{6})/.exec(name);
    if (match !== null) return `tpit-${match[1]}`;
  }
  return `tpit-${createHash("sha256").update(sheetNames.join("|")).digest("hex").slice(0, 12)}`;
}

/** Exposed so a test can assert the contact column is genuinely unreachable. */
export function ercotReadableColumnIndexes(): number[] {
  return Object.values(ERCOT_COLUMNS).sort((a, b) => a - b);
}
