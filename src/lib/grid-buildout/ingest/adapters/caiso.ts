/**
 * CAISO Transmission Development Forum, Approved Projects (Transmission Planning Process).
 *
 * One XLSX posted twice a year, a sheet per participating transmission owner plus a legend.
 * 233 project rows across ten owner sheets.
 *
 * The reason this source is worth ingesting is the shape of its columns rather than its size. Each
 * sheet carries a frozen `In-service Date at Approval in Transmission Plan` beside roughly fifteen
 * dated `Previous In-Service <Month Year> TDF` columns and a current one. The workbook is its own
 * longitudinal archive: every revision a project's expected date has been through is readable from
 * a single retrieval, without Urdais having snapshotted earlier forums. Each of those columns is
 * therefore a milestone observation in its own right, labelled with its vintage, and never
 * flattened into just "original" and "current".
 *
 * What this source cannot do is completions. Only eight of 233 rows read as in service, and
 * `Project Status` is uncontrolled free text — four spellings of "in-flight", two of "in service".
 * So no status string is mapped mechanically here. Only the two states GBV-1 established as
 * defensible are canonicalised; everything else stays unknown with the publisher's text intact.
 *
 * The sibling generator-interconnection workbook is a different object at a different URL and is
 * never read by this adapter.
 */

import { parseSpreadsheetDate } from "@/lib/grid-buildout/dates";
import type {
  BuildoutAdapter, ParsedDeferral, ParsedMilestone, ParsedProjectRow, ParsedSnapshot,
} from "@/lib/grid-buildout/ingest/types";
import { BuildoutSourceShapeError } from "@/lib/grid-buildout/types";
import type { LifecycleBasis, LifecycleState } from "@/lib/grid-buildout/types";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { XlsxWorkbook, columnToIndex, indexToColumn } from "@/lib/power-delivery/planning/xlsx/workbook";

/** The workbook helpers are 1-based; column positions here are 0-based. */
const columnLetter = (zeroBased: number): string => indexToColumn(zeroBased + 1);

export const CAISO_ARTIFACT_URL =
  "https://www.caiso.com/documents/approved-projects-transmission-planning-process-jul-2026.xlsx";

/** Explicitly recorded so the exclusion is visible in code, not only in a document. */
export const CAISO_EXCLUDED_INTERCONNECTION_ARTIFACT_URL =
  "https://www.caiso.com/documents/network-upgrades-generation-interconnection-jul-2026.xlsx";

/** Not a project list. The legend sheet is skipped rather than parsed and discarded. */
const NON_PROJECT_SHEETS = new Set(["Impact Category"]);

/** Column counts differ per owner, so every column is located by heading rather than by position. */
const HEADINGS = {
  projectId: /^TP Project ID$/i,
  project: /^Project$/i,
  pto: /^PTO$/i,
  planApproved: /^Transmission Plan Approved$/i,
  isdAtApproval: /In-?service Date at Approval in Transmission Plan/i,
  status: /^Project Status$/i,
  permitFiling: /Expected CPUC Permit Application Filing/i,
  constructionStart: /Expected Construction Start/i,
  reason: /Reason for ISD Change/i,
  delayResolver: /^Delay Resolver$/i,
  notes: /^Notes$/i,
} as const;

/** `Previous In-Service Jan 2024 TDF`, `Current In-Service July 2026 TDF`. */
const VINTAGE_COLUMN = /^(Previous|Current)\s+In-?Service\s+(.+?)\s*TDF$/i;
/** `Expected In-Service Date 2020-2021 Transmission Plan` — a plan-cycle target, not a TDF vintage. */
const PLAN_CYCLE_COLUMN = /^Expected In-?Service Date\s*(.+?)\s*Transmission Plan$/i;

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Only the states GBV-1 found defensible are mapped. Everything else — including all four
 * spellings of "in-flight" — stays unknown with the native string preserved, because a status
 * vocabulary nobody controls is not a lifecycle.
 */
function mapStatus(raw: string | null): { state: LifecycleState; basis: LifecycleBasis } {
  if (raw === null) return { state: "unknown", basis: "unmapped" };
  const text = collapse(raw).toLowerCase();
  if (text === "cancelled" || text === "canceled") {
    return { state: "cancelled", basis: "native_status_text" };
  }
  return { state: "unknown", basis: "unmapped" };
}

export const caisoBuildoutAdapter: BuildoutAdapter = {
  key: "caiso",
  sourceSlug: "caiso-tdf-approved-tpp-projects",
  marketSlug: "caiso",

  artifactUrl(): string {
    return CAISO_ARTIFACT_URL;
  },

  parse(artifact: RetrievedArtifact): ParsedSnapshot {
    const workbook = XlsxWorkbook.open(artifact.body);
    const deferrals: ParsedDeferral[] = [];
    const lists: ParsedSnapshot["lists"] = [];
    let vintageLabelSeen = false;

    for (const name of workbook.sheetNames()) {
      if (NON_PROJECT_SHEETS.has(name)) continue;
      const sheet = workbook.sheet(name);

      // Locate the header row by finding the row that names the project identifier.
      let headerRow: number | null = null;
      const columns = new Map<string, number>();
      const vintages: { index: number; label: string; heading: string; isCurrent: boolean }[] = [];
      const planCycles: { index: number; label: string; heading: string }[] = [];

      for (const row of sheet.rows.slice(0, 8)) {
        for (const [ref, cell] of row.cells) {
          void ref;
          if (cell.value !== null && HEADINGS.projectId.test(collapse(cell.value))) headerRow = row.row;
        }
        if (headerRow !== null) break;
      }
      if (headerRow === null) {
        deferrals.push({
          reason: "unknown_vintage_column", nativeList: name, nativeKey: null, nativeValue: null,
          detail: `Sheet ${name} has no "TP Project ID" heading in its first eight rows and was not parsed.`,
          rowOrdinal: null,
        });
        continue;
      }

      const header = sheet.rows.find((candidate) => candidate.row === headerRow);
      if (header === undefined) continue;
      for (const [ref, cell] of header.cells) {
        if (cell.value === null) continue;
        const heading = collapse(cell.value);
        const at = columnToIndex(ref.replace(/\d+$/, "")) - 1;
        for (const [field, pattern] of Object.entries(HEADINGS)) {
          if (pattern.test(heading)) columns.set(field, at);
        }
        const vintage = VINTAGE_COLUMN.exec(heading);
        if (vintage !== null) {
          vintages.push({
            index: at, label: collapse(vintage[2] ?? ""), heading,
            isCurrent: (vintage[1] ?? "").toLowerCase() === "current",
          });
          vintageLabelSeen = true;
          continue;
        }
        const planCycle = PLAN_CYCLE_COLUMN.exec(heading);
        if (planCycle !== null) {
          planCycles.push({ index: at, label: collapse(planCycle[1] ?? ""), heading });
        }
      }

      const projectColumn = columns.get("projectId");
      if (projectColumn === undefined) continue;

      const rows: ParsedProjectRow[] = [];
      let ordinal = 0;

      for (const row of sheet.rows) {
        if (row.row <= headerRow) continue;
        const text = (index: number | undefined): string | null => {
          if (index === undefined) return null;
          const value = row.cells.get(columnLetter(index))?.value ?? null;
          return value === null || value.trim() === "" ? null : collapse(value);
        };
        const nativeId = text(projectColumn);
        if (nativeId === null) continue;
        // A repeated header inside the body is chrome, not a project.
        if (HEADINGS.projectId.test(nativeId)) continue;
        ordinal += 1;

        const payload: Record<string, string> = { nativeList: name };
        for (const [field, index] of columns) {
          const value = text(index);
          if (value !== null) payload[field] = value;
        }

        const nativeStatus = text(columns.get("status"));
        const { state, basis } = mapStatus(nativeStatus);
        if (state === "unknown" && nativeStatus !== null) {
          deferrals.push({
            reason: "unmapped_lifecycle", nativeList: name, nativeKey: nativeId, nativeValue: nativeStatus,
            detail: "CAISO Project Status is uncontrolled free text. The native string is retained and "
              + "no canonical class is asserted.",
            rowOrdinal: ordinal,
          });
        }

        const milestones: ParsedMilestone[] = [];
        const addDate = (
          kind: ParsedMilestone["kind"], index: number | undefined, field: string,
          vintageLabel: string | null,
        ): void => {
          if (index === undefined) return;
          const raw = text(index);
          const parsed = parseSpreadsheetDate(raw, { precision: "day" });
          if (parsed.quality === "not_reported") return;
          milestones.push({
            kind, vintageLabel, date: parsed.date, quality: parsed.quality,
            precision: parsed.precision, native: parsed.native, sourceField: field,
          });
          if (parsed.quality === "unparseable") {
            deferrals.push({
              reason: "unparseable_date", nativeList: name, nativeKey: nativeId, nativeValue: parsed.native,
              detail: `${field} could not be read as a date.`, rowOrdinal: ordinal,
            });
          } else if (parsed.quality === "sentinel_unknown") {
            deferrals.push({
              reason: "sentinel_date", nativeList: name, nativeKey: nativeId, nativeValue: parsed.native,
              detail: `${field} holds a placeholder such as TBD rather than a date.`, rowOrdinal: ordinal,
            });
          }
        };

        addDate("approved", columns.get("planApproved"), "Transmission Plan Approved", null);
        addDate("target_in_service_at_approval", columns.get("isdAtApproval"),
          "In-service Date at Approval in Transmission Plan", null);
        addDate("permit_filing_expected", columns.get("permitFiling"),
          "Expected CPUC Permit Application Filing", null);
        // Expected, not actual. There is no actual construction-start kind anywhere in GBV.
        addDate("construction_start_expected", columns.get("constructionStart"),
          "Expected Construction Start", null);

        // Every vintage column becomes its own milestone. Flattening them to first and last would
        // discard the revision history that is the whole reason to ingest this source.
        for (const vintage of vintages) {
          addDate(
            vintage.isCurrent ? "target_in_service_current" : "target_in_service_prior_vintage",
            vintage.index, vintage.heading, vintage.isCurrent ? null : vintage.label);
        }
        for (const cycle of planCycles) {
          addDate("target_in_service_prior_vintage", cycle.index, cycle.heading, `plan ${cycle.label}`);
        }


        rows.push({
          rowOrdinal: ordinal, nativeId, title: payload.project ?? null, description: payload.notes ?? null,
          sponsor: payload.pto ?? null, nativeStatus, tier: null,
          lifecycle: { state, basis },
          // CAISO publishes no driver field. Its TPP workbook is by definition the planning-process
          // portfolio, and the interconnection-driven work lives in the sibling file this adapter
          // never opens — but "not in that file" is not an affirmative driver statement.
          driver: { klass: "unknown", basis: "none", evidence: null },
          milestones, quantities: [], relationships: [], payload,
        });
      }

      lists.push({ name, rows });
    }

    if (!vintageLabelSeen) {
      throw new BuildoutSourceShapeError(
        "CAISO TPP workbook exposed no 'Previous/Current In-Service ... TDF' columns; "
        + "the vintage history this source exists for is missing");
    }

    return {
      nativeSnapshotKey: caisoSnapshotKey(CAISO_ARTIFACT_URL),
      sourcePublishedAt: null,
      lists,
      deferrals,
    };
  },
};

/** CAISO names the forum month in the file name, which is the vintage. */
export function caisoSnapshotKey(url: string): string {
  const match = /-([a-z]{3,9})-(\d{4})\.xlsx$/i.exec(url);
  return match === null ? "tpp-unknown" : `tpp-${match[1]!.toLowerCase()}-${match[2]}`;
}
