/**
 * NYISO External Limits and Flows.
 *
 * One row is one interface at one instant: a signed flow and a limit for each direction. It is the
 * only source in TH-1 that publishes a flow and its limit together as a standing series, which is
 * what makes NYISO the lead market for this product.
 *
 * Four properties of this feed shape the adapter, and all four were measured rather than assumed:
 *
 *   It is an event series, not a five-minute grid. A single observed day carried 289 timestamps
 *   including three off-grid ones (04:39, 04:41, 17:37) and two skipped slots. Nothing here
 *   synthesises, forward-fills or interpolates a timestamp; every instant is the publisher's own.
 *
 *   Identity is the Point ID. Eight of twenty-five Point IDs were renamed across the archive, some
 *   twice, so the name is a display attribute. The sharper trap is the inverse: `CENTRAL-EAST`
 *   (23313) ends in January 2005 and `CENTRAL EAST - VC` (23330) begins in February — different
 *   IDs, and a name matcher would have welded two entities into one continuous series.
 *
 *   +/-9999 is a sentinel. Exact magnitude, never a threshold, because the largest genuine limit in
 *   the archive is 9899.
 *
 *   The timestamp carries no zone. It is recorded as assumed market-local rather than silently
 *   relabelled UTC.
 *
 * Usable history begins 2005-02-01. Before that every row carries an unsigned 9999 in both limit
 * columns, so no limit is published at all and there is nothing to measure against.
 */

import { readZipDirectory, readZipMember } from "@/lib/power-delivery/planning/xlsx/zip";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";
import { parseNumeric } from "@/lib/transmission-headroom/derive";
import type {
  ParsedDeferral, ParsedObservation, ParseResult, TransmissionAdapter, TransmissionArtifactRef,
} from "@/lib/transmission-headroom/ingest/types";

const BASE = "https://mis.nyiso.com/public/csv/ExternalLimitsFlows";

/** The first day NYISO publishes a usable limit. Earlier files exist and must not be ingested. */
export const NYISO_USABLE_HISTORY_START = "2005-02-01";

const EXPECTED_HEADER = [
  "Timestamp", "Interface Name", "Point ID", "Flow (MWH)",
  "Positive Limit (MWH)", "Negative Limit (MWH)",
];

export class NyisoFormatError extends Error {
  constructor(message: string) {
    super(`NYISO External Limits and Flows: ${message}`);
    this.name = "NyisoFormatError";
  }
}

const pad = (value: number) => String(value).padStart(2, "0");
const ymd = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;

/**
 * Today's file name, in NYISO's calendar rather than the machine's.
 *
 * The file is named for the Eastern calendar day. Deriving it from UTC asks for tomorrow's file
 * every evening after 20:00 Eastern, which 404s until midnight and then returns a nearly empty
 * one -- a gap that would appear as a missing day rather than as an error.
 */
export function marketToday(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}${get("month")}${get("day")}`;
}

export function nyisoDailyUrl(day: Date): string {
  return `${BASE}/${ymd(day)}ExternalLimitsFlows.csv`;
}

export function nyisoMonthlyArchiveUrl(year: number, month: number): string {
  return `${BASE}/${year}${pad(month)}01ExternalLimitsFlows_csv.zip`;
}

/**
 * The publisher's local timestamp.
 *
 * Parsed as a wall clock in America/New_York and stored with the zone status that says so. The
 * repeated hour each autumn is genuinely ambiguous in this format, and the adapter does not pretend
 * otherwise: it records the instant it derived and marks the status rather than inventing an offset
 * the file does not carry.
 */
export function parseNyisoTimestamp(raw: string): { at: Date; ambiguous: boolean } | null {
  const match = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match === null) return null;
  const [, mm, dd, yyyy, hh, mi, ss] = match;
  const month = Number(mm), day = Number(dd), year = Number(yyyy);
  const hour = Number(hh), minute = Number(mi), second = Number(ss ?? "0");

  // Eastern is UTC-5, or UTC-4 while daylight time is in effect. Resolving which applies needs the
  // instant, which needs the offset, so try both and keep the one whose local rendering matches.
  for (const offsetHours of [4, 5]) {
    const candidate = new Date(Date.UTC(year, month - 1, day, hour + offsetHours, minute, second));
    const local = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(candidate);
    const get = (type: string) => local.find((part) => part.type === type)?.value ?? "";
    if (Number(get("year")) === year && Number(get("month")) === month
      && Number(get("day")) === day && Number(get("hour")) % 24 === hour % 24
      && Number(get("minute")) === minute) {
      return { at: candidate, ambiguous: false };
    }
  }
  // Inside the repeated autumn hour both offsets render the same local time, so the instant cannot
  // be recovered from this string. Take standard time and mark it ambiguous.
  return { at: new Date(Date.UTC(year, month - 1, day, hour + 5, minute, second)), ambiguous: true };
}

function splitCsvLine(line: string): string[] {
  return line.split(",").map((cell) => cell.trim());
}

/** Parse one daily CSV. Exported so a caller can feed it a member of a monthly archive. */
export function parseNyisoCsv(text: string, sourceLabel: string): ParseResult {
  const lines = text.split(/\r\n|\n|\r/).filter((line) => line.trim() !== "");
  if (lines.length === 0) throw new NyisoFormatError(`${sourceLabel} is empty`);

  const header = splitCsvLine(lines[0]!);
  for (const [index, expected] of EXPECTED_HEADER.entries()) {
    if (header[index] !== expected) {
      throw new NyisoFormatError(
        `${sourceLabel} column ${index + 1} is ${header[index] ?? "(absent)"}, expected ${expected}`);
    }
  }

  const observations: ParsedObservation[] = [];
  const deferrals: ParsedDeferral[] = [];

  for (const [index, line] of lines.slice(1).entries()) {
    const rowOrdinal = index + 1;
    const cells = splitCsvLine(line);
    const [rawTs, name, pointId, rawFlow, rawPos, rawNeg] = cells;

    if (!pointId || pointId.trim() === "") {
      deferrals.push({
        reason: "missing_required_field", detail: `${sourceLabel} row ${rowOrdinal} has no Point ID`,
        rowOrdinal, nativeValue: line.slice(0, 120),
      });
      continue;
    }
    const stamp = parseNyisoTimestamp(rawTs ?? "");
    if (stamp === null) {
      deferrals.push({
        reason: "malformed_numeric", nativeEntityKey: pointId, nativeValue: rawTs ?? "",
        detail: `${sourceLabel} row ${rowOrdinal} timestamp is unparseable`, rowOrdinal,
      });
      continue;
    }

    const flow = parseNumeric(rawFlow);
    if (!flow.ok) {
      deferrals.push({
        reason: flow.reason, nativeEntityKey: pointId, nativeValue: flow.raw,
        detail: `${sourceLabel} row ${rowOrdinal} flow is ${flow.reason}`, rowOrdinal,
      });
      continue;
    }
    const positive = parseNumeric(rawPos);
    const negative = parseNumeric(rawNeg);
    // A row with an unreadable limit still has a real flow worth keeping, so the row is not
    // dropped; the unusable side is recorded and the derivation will find no eligible limit.
    for (const [label, parsed, raw] of [
      ["Positive Limit (MWH)", positive, rawPos] as const,
      ["Negative Limit (MWH)", negative, rawNeg] as const,
    ]) {
      if (!parsed.ok) {
        deferrals.push({
          reason: parsed.reason, nativeEntityKey: pointId, nativeValue: raw ?? "",
          detail: `${sourceLabel} row ${rowOrdinal} ${label} is ${parsed.reason}`, rowOrdinal,
        });
      }
    }

    observations.push({
      entityKind: "interface",
      nativeEntityKey: pointId.trim(),
      nativeName: (name ?? "").trim(),
      contingencyKind: "not_applicable",
      nativeTimestamp: (rawTs ?? "").trim(),
      observedAt: stamp.at,
      timestampZoneStatus: stamp.ambiguous ? "ambiguous" : "assumed_market_local",
      flowNativeField: "Flow (MWH)",
      flowRawValue: (rawFlow ?? "").trim(),
      flowMw: flow.value,
      unitAsPublished: "MWH",
      limits: [
        ...(positive.ok ? [{
          nativeField: "Positive Limit (MWH)", direction: "positive" as const,
          rawValue: (rawPos ?? "").trim(), limitMw: positive.value,
        }] : []),
        ...(negative.ok ? [{
          nativeField: "Negative Limit (MWH)", direction: "negative" as const,
          rawValue: (rawNeg ?? "").trim(), limitMw: negative.value,
        }] : []),
      ],
      rowOrdinal,
      payload: {
        Timestamp: (rawTs ?? "").trim(), "Interface Name": (name ?? "").trim(),
        "Point ID": pointId.trim(), "Flow (MWH)": (rawFlow ?? "").trim(),
        "Positive Limit (MWH)": (rawPos ?? "").trim(), "Negative Limit (MWH)": (rawNeg ?? "").trim(),
      },
      nativeMetadata: {},
    });
  }

  return { observations, deferrals };
}

export const nyisoAdapter: TransmissionAdapter = {
  key: "nyiso",
  sourceInterfaceSlug: "nyiso-external-limits-flows",
  gridAreaSlug: "nyiso",
  entityKind: "interface",

  async discover({ window, limit }) {
    // No directory listing exists — the path returns 403 — so names are constructed, never crawled.
    if (window === undefined) {
      const key = marketToday();
      return [{
        url: `${BASE}/${key}ExternalLimitsFlows.csv`, nativeKey: key,
        coverageStart: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`,
      }];
    }
    const refs: TransmissionArtifactRef[] = [];
    const floor = new Date(`${NYISO_USABLE_HISTORY_START}T00:00:00Z`);
    const start = window.start < floor ? floor : window.start;
    const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    while (cursor <= window.end) {
      const year = cursor.getUTCFullYear(), month = cursor.getUTCMonth() + 1;
      refs.push({
        url: nyisoMonthlyArchiveUrl(year, month), nativeKey: `${year}${pad(month)}`,
        coverageStart: `${year}-${pad(month)}-01`, isZip: true,
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      if (limit !== undefined && refs.length >= limit) break;
    }
    return refs;
  },

  parse(artifact: RetrievedArtifact, ref: TransmissionArtifactRef): ParseResult {
    if (ref.isZip !== true) {
      return parseNyisoCsv(artifact.body.toString("utf8"), ref.nativeKey);
    }
    // A monthly archive is up to 31 daily files. They are parsed in name order so a row ordinal is
    // reproducible, and each member keeps its own label for provenance.
    const entries = [...readZipDirectory(artifact.body).entries()]
      .filter(([name]) => name.toLowerCase().endsWith(".csv"))
      .sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) throw new NyisoFormatError(`${ref.nativeKey} archive holds no CSV`);

    const observations: ParsedObservation[] = [];
    const deferrals: ParsedDeferral[] = [];
    for (const [name, entry] of entries) {
      const result = parseNyisoCsv(readZipMember(artifact.body, entry).toString("utf8"), name);
      observations.push(...result.observations);
      deferrals.push(...result.deferrals);
    }
    return { observations, deferrals };
  },
};
