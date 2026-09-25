/**
 * CAISO: the day-ahead Marginal Energy Cost, from OASIS report PRC_LMP.
 *
 * The tariff says the MEC is the same throughout the balancing authority area, and the committed
 * artifact agrees exactly: on 23 September 2026 MCE read 22.51355 at all three trading hubs in
 * every hour while their full LMPs differed by ten dollars. So a hub row is a carrier for reading
 * a system-wide component, not a location whose price is being adopted.
 *
 * Three parsing facts, each measured on a committed artifact rather than assumed:
 *
 *   The 2026 file carries **five** component rows -- LMP, MCC, MCE, MCL and MGHG. A parser written
 *   against the older three-part identity is wrong by the greenhouse-gas term, which was 3.67043
 *   in hour 12 of the sample day.
 *
 *   The price lives in a column named `MW`.
 *
 *   On a fall-back day the repeated hour is labelled **`OPR_HR` 25**, filed between hours 2 and 3,
 *   so the hour-ending index is neither unique nor monotonic. `INTERVALSTARTTIME_GMT` is both.
 *
 * Whether MGHG belongs in the benchmark is an open methodology question (§K.2). It is not an open
 * *parsing* question: specification 1.0.0 defines the benchmark as MCE, and this adapter reads MCE.
 * MGHG is captured alongside as a component so the question stays answerable from stored evidence.
 */

import { splitCsvLine } from "@/lib/interconnection-queue/csv/preamble";
import { readZipDirectory, readZipMember } from "@/lib/power-delivery/planning/xlsx/zip";
import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { operatingDayWindow } from "@/lib/uepi/operating-day";
import {
  UepiSourceError,
  type AdapterParseResult, type AdapterRecord, type ArtifactRequest,
  type RejectedRow, type UepiSourceAdapter,
} from "@/lib/uepi/source/types";

const BENCHMARK = benchmarkFor("uepi-caiso");

const CARRIER_NODE = "TH_NP15_GEN-APND";
const CROSS_CHECK_NODES = ["TH_SP15_GEN-APND", "TH_ZP26_GEN-APND"] as const;

/** The component the tariff defines as system-wide. */
const CANONICAL_LMP_TYPE = "MCE";

const REQUIRED_COLUMNS = [
  "INTERVALSTARTTIME_GMT", "INTERVALENDTIME_GMT", "OPR_DT", "OPR_HR",
  "NODE", "MARKET_RUN_ID", "LMP_TYPE", "XML_DATA_ITEM", "MW",
] as const;

/** OASIS takes a GMT window, and the operating day it means is the market's own Pacific day. */
function oasisWindow(operatingDate: string): { start: string; end: string } {
  const window = operatingDayWindow(BENCHMARK, operatingDate);
  const format = (iso: string) => `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}T${iso.slice(11, 16)}-0000`;
  return { start: format(window.startUtc), end: format(window.endUtc) };
}

export const caisoAdapter: UepiSourceAdapter = {
  seriesId: "uepi-caiso",
  sourceInterfaceSlug: BENCHMARK.sourceInterfaceSlug,
  /**
   * `research`, and not because the rights determination says so.
   *
   * The platform refuses a `production` retrieval from a source interface that is not
   * production-approved, and production approval requires both terms axes to read `permitted`.
   * An ambiguous source cannot reach that state without a legal answer Urdais does not have, so
   * every UEPI retrieval is recorded as research for now. It constrains nothing this phase does:
   * retention and calculation proceed, and whether a value may be *displayed* is decided by
   * `source_use_permissions` at read time, not by the purpose a file was fetched under.
   */
  retrievalPurpose: "research",

  artifactsFor(operatingDate: string): ArtifactRequest[] {
    const { start, end } = oasisWindow(operatingDate);
    const nodes = [CARRIER_NODE, ...CROSS_CHECK_NODES].join(",");
    return [{
      label: "day",
      url: "https://oasis.caiso.com/oasisapi/SingleZip"
        + `?queryname=PRC_LMP&version=12&market_run_id=DAM&resultformat=6`
        + `&startdatetime=${start}&enddatetime=${end}&node=${nodes}`,
    }];
  },

  parse(operatingDate: string, artifacts): AdapterParseResult {
    const artifact = artifacts.get("day");
    if (artifact === undefined) {
      throw new UepiSourceError(this.seriesId, "SOURCE_UNAVAILABLE", `no artifact for ${operatingDate}`);
    }

    const directory = readZipDirectory(artifact.body);
    const members = [...directory.keys()].filter((name) => name.toLowerCase().endsWith(".csv"));
    if (members.length !== 1) {
      // A non-CSV payload is how OASIS answers an invalid query or a rate limit, so this is the
      // first place a 200-with-an-error-document shows up.
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the OASIS archive holds ${members.length} CSV members (${[...directory.keys()].join(", ")})`);
    }
    const memberName = members[0]!;
    const text = readZipMember(artifact.body, directory.get(memberName)!).toString("utf8");
    const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length <= 1) {
      throw new UepiSourceError(this.seriesId, "EMPTY_SOURCE", `${memberName} holds no data rows`);
    }

    const header = splitCsvLine(lines[0]!).map((value) => value.trim());
    for (const column of REQUIRED_COLUMNS) {
      if (!header.includes(column)) {
        throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
          `the PRC_LMP header is missing '${column}'; it reads ${JSON.stringify(header)}`);
      }
    }
    const at = (values: string[], column: string) => (values[header.indexOf(column)] ?? "").trim();

    const window = operatingDayWindow(BENCHMARK, operatingDate);
    const dayStart = Date.parse(window.startUtc);
    const dayEnd = Date.parse(window.endUtc);

    const rejected: RejectedRow[] = [];
    const records: AdapterRecord[] = [];
    const crossCheckRecords: AdapterRecord[] = [];
    /** Components of the carrier's own LMP identity, kept for the release check. */
    const carrierComponents = new Map<string, Record<string, string>>();
    const componentTypes = new Set<string>();
    let examined = 0;

    for (let index = 1; index < lines.length; index += 1) {
      examined += 1;
      const sourceRow = index + 1;
      const values = splitCsvLine(lines[index]!);
      const node = at(values, "NODE");
      const lmpType = at(values, "LMP_TYPE");
      const marketRun = at(values, "MARKET_RUN_ID");
      componentTypes.add(lmpType);

      if (marketRun !== "DAM") {
        rejected.push({ sourceRow, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `market run ${marketRun} is not the day-ahead market` });
        continue;
      }
      const startIso = at(values, "INTERVALSTARTTIME_GMT");
      const startMs = Date.parse(startIso);
      if (Number.isNaN(startMs)) {
        throw new UepiSourceError(this.seriesId, "INVALID_TIMESTAMP",
          `row ${sourceRow} has INTERVALSTARTTIME_GMT '${startIso}'`);
      }
      if (startMs < dayStart || startMs >= dayEnd) {
        rejected.push({ sourceRow, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `${startIso} falls outside operating day ${operatingDate}` });
        continue;
      }

      if (node === CARRIER_NODE && lmpType !== CANONICAL_LMP_TYPE) {
        // Not the benchmark, and not noise either: these four rows are the identity the release
        // check reproduces, so they are kept as evidence rather than discarded.
        const slot = carrierComponents.get(startIso) ?? {};
        slot[lmpType] = at(values, "MW");
        carrierComponents.set(startIso, slot);
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${lmpType} at the carrier is a component of the LMP identity, not the benchmark` });
        continue;
      }
      if (lmpType !== CANONICAL_LMP_TYPE) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${lmpType} at ${node} is not the system energy component` });
        continue;
      }
      if (node !== CARRIER_NODE && !(CROSS_CHECK_NODES as readonly string[]).includes(node)) {
        rejected.push({ sourceRow, reason: "NOT_CANONICAL_BENCHMARK",
          detail: `${node} is not the carrier or a cross-check hub` });
        continue;
      }

      // The price column is named MW. That is CAISO's own naming, and reading it as a quantity
      // rather than a price is the mistake the name invites.
      const price = at(values, "MW");
      if (price === "") {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${node} ${startIso}) has a blank MW column`);
      }
      if (!/^-?\d+(\.\d+)?$/.test(price)) {
        throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
          `row ${sourceRow} (${node} ${startIso}) has MW '${price}', which is not a decimal number`);
      }

      const isCarrier = node === CARRIER_NODE;
      const target = isCarrier ? records : crossCheckRecords;
      if (isCarrier && records.some((existing) => existing.intervalStartUtc === startIso)) {
        throw new UepiSourceError(this.seriesId, "DUPLICATE_INTERVAL",
          `the carrier has two MCE rows for ${startIso}`);
      }
      target.push({
        intervalStartUtc: new Date(startMs).toISOString(),
        hourOrdinal: target.length + 1,
        benchmarkPrice: price,
        raw: {
          seriesId: this.seriesId,
          rowOrdinal: sourceRow,
          nativeOperatingDate: at(values, "OPR_DT"),
          // The hour-ending index, kept verbatim because it is the field that behaves oddly: on a
          // fall-back day the repeated hour is 25, filed between 2 and 3.
          nativeIntervalLabel: `OPR_HR ${at(values, "OPR_HR")}`,
          nativeIntervalUtc: new Date(startMs).toISOString(),
          nativeValue: price,
          nativeComponents: {
            LMP_TYPE: lmpType, XML_DATA_ITEM: at(values, "XML_DATA_ITEM"),
            NODE: node, OPR_HR: at(values, "OPR_HR"), MW: price,
          },
          nativeSourceVersion: { report: "PRC_LMP", version: "12", member: memberName },
          rawPayload: Object.fromEntries(header.map((column, position) => [column, values[position] ?? ""])),
        },
      });
    }

    if (records.length === 0) {
      throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
        `the archive holds no ${CANONICAL_LMP_TYPE} rows at ${CARRIER_NODE} for ${operatingDate}`);
    }

    // Sorted by instant: OASIS files the repeated fall-back hour out of order, and the day's rows
    // are handed on in time order so a positional reader downstream cannot be misled.
    records.sort((left, right) => Date.parse(left.intervalStartUtc) - Date.parse(right.intervalStartUtc));
    records.forEach((record, index) => { (record as { hourOrdinal: number }).hourOrdinal = index + 1; });
    crossCheckRecords.sort((left, right) => Date.parse(left.intervalStartUtc) - Date.parse(right.intervalStartUtc));

    const warnings: string[] = [];
    if (!componentTypes.has("MGHG")) {
      warnings.push("this file carries no MGHG component; the 2026 files do, and its absence changes "
        + "what the published LMP identity means");
    }

    return {
      seriesId: this.seriesId,
      operatingDate,
      records,
      crossCheckRecords,
      rejected,
      examinedRowCount: examined,
      sourceSchema: {
        header: header.join(","),
        member: memberName,
        componentTypes: [...componentTypes].sort().join(","),
        carrierNode: CARRIER_NODE,
        crossCheckNodes: CROSS_CHECK_NODES.join(","),
        priceColumn: "MW",
      },
      warnings,
    };
  },
};

/** The carrier's LMP identity components, exposed for the release check that reproduces it. */
export function caisoIdentityComponents(
  artifacts: ReadonlyMap<string, import("@/lib/uepi/source/types").RetrievedArtifact>,
): Map<string, Record<string, string>> {
  const artifact = artifacts.get("day");
  if (artifact === undefined) return new Map();
  const directory = readZipDirectory(artifact.body);
  const member = [...directory.keys()].find((name) => name.toLowerCase().endsWith(".csv"));
  if (member === undefined) return new Map();
  const lines = readZipMember(artifact.body, directory.get(member)!).toString("utf8").split(/\r?\n/);
  const header = splitCsvLine(lines[0] ?? "").map((value) => value.trim());
  const at = (values: string[], column: string) => (values[header.indexOf(column)] ?? "").trim();
  const byInstant = new Map<string, Record<string, string>>();
  for (const line of lines.slice(1)) {
    if (line.trim() === "") continue;
    const values = splitCsvLine(line);
    if (at(values, "NODE") !== CARRIER_NODE) continue;
    const instant = at(values, "INTERVALSTARTTIME_GMT");
    const slot = byInstant.get(instant) ?? {};
    slot[at(values, "LMP_TYPE")] = at(values, "MW");
    byInstant.set(instant, slot);
  }
  return byInstant;
}
