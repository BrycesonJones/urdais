/**
 * ERCOT SCED Shadow Prices and Binding Transmission Constraints (NP6-86-CD).
 *
 * One row is one constraint in one SCED interval: a `Limit`, a `Value` (the flow) and the
 * contingency the limit protects against. Both numbers on the same row, already oriented, which is
 * why `Limit - Value` needs no direction selection.
 *
 * What this source is not, and the product copy has to say so, is a view of the ERCOT network.
 * Rows appear only for constraints dispatch was actively tracking — thirty in an interval against
 * thousands of elements — so an element with abundant margin never appears at all. The denominator
 * is invisible.
 *
 * Three things the adapter gets right that a first reading would get wrong:
 *
 *   `ConstraintID` is not an identifier. Across nine artifacts, 28 IDs mapped to several constraint
 *   names and 71 names mapped to several IDs; it is a per-run handle. Identity is the pair
 *   (ConstraintName, ContingencyName), because the same element under a different contingency is a
 *   different constraint carrying a different limit.
 *
 *   `CCTStatus` is the Constraint Competitiveness Test — market-power mitigation, tested before
 *   each SCED run. It is orthogonal to headroom (it occurs in all four combinations of contingency
 *   kind and binding state) and must never gate eligibility. It is kept as native metadata.
 *
 *   A limit of 85,999.1 is not a limit. ERCOT leaves a constraint monitored with its limit
 *   effectively disabled; taken at face value `EASTEX` reports 83,449 MW of margin. There is no
 *   documented sentinel to match, so the bound lives in configuration and the row is retained and
 *   marked rather than deleted in the parser.
 *
 * The listing is a rolling seven-day window with no archive, so ingestion is forward-only and a
 * missed sweep is permanently lost.
 */

import { readZipDirectory, readZipMember } from "@/lib/power-delivery/planning/xlsx/zip";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { parseNumeric } from "@/lib/transmission-headroom/derive";
import type {
  ParsedDeferral, ParsedObservation, ParseResult, TransmissionAdapter, TransmissionArtifactRef,
} from "@/lib/transmission-headroom/ingest/types";

export const ERCOT_REPORT_TYPE_ID = 12302;
const LISTING = `https://www.ercot.com/misapp/GetReports.do?reportTypeId=${ERCOT_REPORT_TYPE_ID}`;
const DOWNLOAD = "https://www.ercot.com/misdownload/servlets/mirDownload?doclookupId=";

const EXPECTED_HEADER = [
  "SCEDTimeStamp", "RepeatedHourFlag", "ConstraintID", "ConstraintName", "ContingencyName",
  "ShadowPrice", "MaxShadowPrice", "Limit", "Value", "ViolatedMW",
  "FromStation", "ToStation", "FromStationkV", "ToStationkV", "CCTStatus",
];

/**
 * The pair that is actually identity.
 *
 * Joined on ASCII Unit Separator rather than NUL: PostgreSQL rejects a NUL byte in a text column
 * outright, so a NUL-joined key would fail at the first insert. 0x1F cannot appear in an ERCOT
 * constraint or contingency name, so neither half can forge the separator.
 */
export const ENTITY_KEY_SEPARATOR = String.fromCharCode(0x1f);

export function ercotEntityKey(constraintName: string, contingencyName: string): string {
  return `${constraintName.trim()}${ENTITY_KEY_SEPARATOR}${contingencyName.trim()}`;
}

export class ErcotFormatError extends Error {
  constructor(message: string) {
    super(`ERCOT NP6-86-CD: ${message}`);
    this.name = "ErcotFormatError";
  }
}

/** Pull (artifact name, doclookupId) pairs out of the MIS listing page. */
export function parseErcotListing(html: string): { name: string; id: string }[] {
  const pattern = /labelOptional_ind'>(cdr\.[^<]+?_csv\.zip)<\/td>[\s\S]*?doclookupId=(\d+)'/g;
  const found: { name: string; id: string }[] = [];
  for (const match of html.matchAll(pattern)) found.push({ name: match[1]!, id: match[2]! });
  return found;
}

/** ERCOT prints Central clock time; the flag marks the repeated autumn hour. */
export function parseErcotTimestamp(raw: string, repeatedHour: boolean): { at: Date; ambiguous: boolean } | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (match === null) return null;
  const [, mm, dd, yyyy, hh, mi, ss] = match;
  const year = Number(yyyy), month = Number(mm), day = Number(dd);
  const hour = Number(hh), minute = Number(mi), second = Number(ss);
  for (const offsetHours of repeatedHour ? [6] : [5, 6]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute, second));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(candidate);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    if (Number(get("year")) === year && Number(get("month")) === month
      && Number(get("day")) === day && Number(get("hour")) % 24 === hour % 24
      && Number(get("minute")) === minute) {
      return { at: candidate, ambiguous: repeatedHour };
    }
  }
  return { at: new Date(Date.UTC(year, month - 1, day, hour + 6, minute, second)), ambiguous: true };
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim());
}

export function parseErcotCsv(text: string, sourceLabel: string): ParseResult {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new ErcotFormatError(`${sourceLabel} is empty`);

  const header = splitCsvLine(lines[0]!);
  for (const [index, expected] of EXPECTED_HEADER.entries()) {
    if (header[index] !== expected) {
      throw new ErcotFormatError(
        `${sourceLabel} column ${index + 1} is ${header[index] ?? "(absent)"}, expected ${expected}`);
    }
  }

  const observations: ParsedObservation[] = [];
  const deferrals: ParsedDeferral[] = [];
  // Identity is the pair plus the instant; a repeat inside one artifact is a genuine collision.
  const seen = new Set<string>();

  for (const [index, line] of lines.slice(1).entries()) {
    const rowOrdinal = index + 1;
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(EXPECTED_HEADER.map((key, i) => [key, cells[i] ?? ""]));

    const constraintName = row.ConstraintName ?? "";
    const contingencyName = row.ContingencyName ?? "";
    if (constraintName.trim() === "" || contingencyName.trim() === "") {
      deferrals.push({
        reason: "missing_required_field", rowOrdinal, nativeValue: line.slice(0, 120),
        detail: `${sourceLabel} row ${rowOrdinal} has no constraint name or contingency name, so it has no identity`,
      });
      continue;
    }
    const entityKey = ercotEntityKey(constraintName, contingencyName);

    const repeatedHour = (row.RepeatedHourFlag ?? "N").trim().toUpperCase() === "Y";
    const stamp = parseErcotTimestamp(row.SCEDTimeStamp ?? "", repeatedHour);
    if (stamp === null) {
      deferrals.push({
        reason: "malformed_numeric", rowOrdinal, nativeEntityKey: entityKey,
        nativeValue: row.SCEDTimeStamp ?? "",
        detail: `${sourceLabel} row ${rowOrdinal} SCEDTimeStamp is unparseable`,
      });
      continue;
    }

    const dedupe = `${entityKey}${ENTITY_KEY_SEPARATOR}${stamp.at.toISOString()}`;
    if (seen.has(dedupe)) {
      deferrals.push({
        reason: "identity_collision", rowOrdinal, nativeEntityKey: entityKey,
        detail: `${sourceLabel} row ${rowOrdinal} repeats ${constraintName} under ${contingencyName} at the same interval`,
      });
      continue;
    }
    seen.add(dedupe);

    const limit = parseNumeric(row.Limit);
    const value = parseNumeric(row.Value);
    if (!limit.ok || !value.ok) {
      // Narrow to the failing side explicitly: a union of ok/not-ok cannot be indexed generically.
      const bad = limit.ok ? value : limit;
      const field = limit.ok ? "Value" : "Limit";
      if (!bad.ok) {
        deferrals.push({
          reason: bad.reason, rowOrdinal, nativeEntityKey: entityKey, nativeValue: bad.raw,
          detail: `${sourceLabel} row ${rowOrdinal} ${field} is ${bad.reason}`,
        });
      }
      continue;
    }

    const kv = (raw: string | undefined) => {
      const parsed = parseNumeric(raw);
      return parsed.ok && parsed.value > 0 ? parsed.value : null;
    };
    const station = (raw: string | undefined) => {
      const text = (raw ?? "").trim();
      return text === "" ? null : text;
    };

    observations.push({
      entityKind: "element",
      nativeEntityKey: entityKey,
      nativeName: constraintName.trim(),
      nativeContingencyName: contingencyName.trim(),
      // BASE CASE means the system intact. Anything else names an outage, and the two are never
      // collapsed: they are different questions with different limits.
      contingencyKind: contingencyName.trim().toUpperCase() === "BASE CASE"
        ? "base_case" : "post_contingency",
      fromStation: station(row.FromStation),
      toStation: station(row.ToStation),
      fromStationKv: kv(row.FromStationkV),
      toStationKv: kv(row.ToStationkV),
      nativeTimestamp: (row.SCEDTimeStamp ?? "").trim(),
      observedAt: stamp.at,
      timestampZoneStatus: stamp.ambiguous ? "ambiguous" : "assumed_market_local",
      flowNativeField: "Value",
      flowRawValue: (row.Value ?? "").trim(),
      flowMw: value.value,
      unitAsPublished: "MW",
      limits: [{
        nativeField: "Limit", direction: "undirected",
        rawValue: (row.Limit ?? "").trim(), limitMw: limit.value,
      }],
      rowOrdinal,
      payload: row,
      // Kept, never acted on. ShadowPrice is the source-backed binding indicator and ConstraintID
      // is the per-run handle that must not be mistaken for identity.
      nativeMetadata: {
        ConstraintID: (row.ConstraintID ?? "").trim(),
        ShadowPrice: (row.ShadowPrice ?? "").trim(),
        MaxShadowPrice: (row.MaxShadowPrice ?? "").trim(),
        ViolatedMW: (row.ViolatedMW ?? "").trim(),
        CCTStatus: (row.CCTStatus ?? "").trim(),
        RepeatedHourFlag: (row.RepeatedHourFlag ?? "").trim(),
      },
    });
  }

  return { observations, deferrals };
}

export const ercotAdapter: TransmissionAdapter = {
  key: "ercot",
  sourceInterfaceSlug: "ercot-sced-binding-constraints",
  gridAreaSlug: "ercot",
  entityKind: "element",

  async discover({ limit, fetchText }) {
    // Whatever the publisher currently exposes. There is no archive and no window to ask for:
    // artifacts older than roughly seven days are gone, so "everything listed" is the only
    // meaningful request.
    const listing = await fetchText(LISTING);
    const entries = parseErcotListing(listing);
    if (entries.length === 0) throw new ErcotFormatError("listing exposed no CSV artifacts");
    const selected = limit === undefined ? entries : entries.slice(0, limit);
    return selected.map((entry) => ({
      url: `${DOWNLOAD}${entry.id}`, nativeKey: entry.name, isZip: true,
    }));
  },

  parse(artifact: RetrievedArtifact, ref: TransmissionArtifactRef): ParseResult {
    const entries = [...readZipDirectory(artifact.body).entries()]
      .filter(([name]) => name.toLowerCase().endsWith(".csv"));
    if (entries.length === 0) throw new ErcotFormatError(`${ref.nativeKey} holds no CSV`);
    const observations: ParsedObservation[] = [];
    const deferrals: ParsedDeferral[] = [];
    for (const [name, entry] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      const result = parseErcotCsv(readZipMember(artifact.body, entry).toString("utf8"), name);
      observations.push(...result.observations);
      deferrals.push(...result.deferrals);
    }
    return { observations, deferrals };
  },
};
