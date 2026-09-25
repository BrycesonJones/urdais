/**
 * MISO: the day-ahead ex-post system energy component, from the daily market report.
 *
 * MISO publishes no MEC column, so the specification derives the system energy component as the
 * residual `LMP - MCC - MLC` and reads it from one node. That residual is identical at every
 * internal location -- measured at 0.0000 spread across all eight official hubs on 23 September
 * 2026, 8 March 2026 and 2 November 2025 -- which is what makes it the market-wide price rather
 * than a hub's price.
 *
 * Two traps this adapter exists to avoid. The file it reads is the **ex-post** one: the ex-ante
 * sibling sits at a nearly identical URL and is a different price, by dollars. And the hours are
 * Eastern *Standard* Time all year, so a MISO day is always 24 hours; converting them onto
 * prevailing time would delete an hour MISO actually priced every spring.
 */

import { parsePreambleCsv, rowRecord } from "@/lib/interconnection-queue/csv/preamble";
import { benchmarkFor } from "@/lib/uepi/benchmarks";
import { sumDecimal } from "@/lib/uepi/decimal";
import { expectedIntervalStarts, operatingDayWindow } from "@/lib/uepi/operating-day";
import {
  UepiSourceError,
  type AdapterParseResult, type AdapterRecord, type ArtifactRequest,
  type RejectedRow, type UepiSourceAdapter,
} from "@/lib/uepi/source/types";

const BENCHMARK = benchmarkFor("uepi-miso");

/** The eight official commercial hubs. The file's `Type = Hub` flag covers hundreds of others. */
const OFFICIAL_HUBS = new Set([
  "ARKANSAS.HUB", "ILLINOIS.HUB", "INDIANA.HUB", "LOUISIANA.HUB",
  "MICHIGAN.HUB", "MINN.HUB", "MS.HUB", "TEXAS.HUB",
]);

const CARRIER_NODE = "INDIANA.HUB";
const CROSS_CHECK_NODE = "MINN.HUB";

const COMPONENTS = ["LMP", "MCC", "MLC"] as const;
type Component = (typeof COMPONENTS)[number];

/**
 * MISO spells a value below one without its leading zero: `.6`, `-.37`.
 *
 * Found in the committed artifacts, not anticipated -- 41 of the 144 carrier cells on
 * 23 September 2026 are written that way, and none of the other three markets does it. The
 * canonical decimal form keeps its leading digit, so the spelling is repaired here, narrowly and
 * visibly: exactly `.d+` and `-.d+` are accepted and rewritten, everything else still fails. The
 * cell as MISO printed it survives in the raw record either way.
 */
function canonicalizeMisoNumber(value: string): string {
  const text = value.trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return text;
  const leadingDot = /^(-?)\.(\d+)$/.exec(text);
  if (leadingDot !== null) return `${leadingDot[1]}0.${leadingDot[2]}`;
  return text;
}

function compact(date: string): string {
  return date.replaceAll("-", "");
}

export const misoAdapter: UepiSourceAdapter = {
  seriesId: "uepi-miso",
  sourceInterfaceSlug: BENCHMARK.sourceInterfaceSlug,
  // MISO's site terms forbid derivative works, so the series is retained internally and never
  // published. The retrieval purpose says so rather than leaving it to a later reader.
  retrievalPurpose: "research",

  artifactsFor(operatingDate: string): ArtifactRequest[] {
    return [{
      label: "day",
      url: `https://docs.misoenergy.org/marketreports/${compact(operatingDate)}_da_expost_lmp.csv`,
    }];
  },

  parse(operatingDate: string, artifacts): AdapterParseResult {
    const artifact = artifacts.get("day");
    if (artifact === undefined) {
      throw new UepiSourceError(this.seriesId, "SOURCE_UNAVAILABLE", `no artifact for ${operatingDate}`);
    }
    const text = artifact.body.toString("utf8");
    const parsed = parsePreambleCsv(
      text,
      (values) => values[0]?.trim() === "Node" && values[1]?.trim() === "Type" && values[2]?.trim() === "Value",
    );

    // The preamble states the report's own date and its clock. Both are checked: a wrong-date file
    // and a file that has quietly moved off Eastern Standard Time are different problems, and
    // neither may be discovered later by a reader wondering why a day looks odd.
    const preambleText = parsed.preamble.map((row) => row.values.join(",")).join(" | ");
    const stated = preambleText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (stated === null) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the report preamble states no date; it reads ${JSON.stringify(preambleText.slice(0, 120))}`);
    }
    const statedDate = `${stated[3]}-${stated[1]}-${stated[2]}`;
    if (statedDate !== operatingDate) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the report states operating day ${statedDate}, not ${operatingDate}`);
    }
    if (!/Eastern Standard Time|\(EST\)/i.test(preambleText)) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        "the report no longer states that hours-ending are Eastern Standard Time; the fixed-offset "
        + "assumption this market depends on cannot be confirmed");
    }
    if (!/ExPost/i.test(preambleText)) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the report does not identify itself as ex-post; it reads ${JSON.stringify(preambleText.slice(0, 80))}`);
    }

    const hourColumns = parsed.header.filter((column) => /^HE \d+$/.test(column));
    const window = operatingDayWindow(BENCHMARK, operatingDate);
    const expected = expectedIntervalStarts(window);
    if (hourColumns.length !== expected.length) {
      throw new UepiSourceError(this.seriesId, "SCHEMA_MISMATCH",
        `the report has ${hourColumns.length} hour columns where MISO's fixed-offset day has ${expected.length}`);
    }

    const rejected: RejectedRow[] = [];
    const wanted = new Map<string, Partial<Record<Component, Record<string, string>>>>();
    let examined = 0;

    for (const row of parsed.rows) {
      examined += 1;
      const record = rowRecord(parsed.header, row);
      const node = record.Node ?? "";
      const value = (record.Value ?? "").trim() as Component;
      if (node !== CARRIER_NODE && node !== CROSS_CHECK_NODE) {
        // Filtering on the eight names rather than on `Type = Hub`: that flag covers hundreds of
        // ARR, aggregate and MVP locations, some of them negative, none of them this benchmark.
        rejected.push({ sourceRow: row.line, reason: "NOT_CANONICAL_BENCHMARK",
          detail: OFFICIAL_HUBS.has(node) ? `${node} is an official hub but not a carrier` : `${node} is not a carrier node` });
        continue;
      }
      if (!(COMPONENTS as readonly string[]).includes(value)) {
        rejected.push({ sourceRow: row.line, reason: "UNSUPPORTED_SOURCE_ROW",
          detail: `${node} row states Value='${value}', which is not one of ${COMPONENTS.join(", ")}` });
        continue;
      }
      const forNode = wanted.get(node) ?? {};
      forNode[value] = record;
      wanted.set(node, forNode);
    }

    const build = (node: string): AdapterRecord[] => {
      const parts = wanted.get(node);
      if (parts === undefined) {
        throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
          `${artifact.url} holds no ${node} rows`);
      }
      for (const component of COMPONENTS) {
        if (parts[component] === undefined) {
          throw new UepiSourceError(this.seriesId, "MISSING_CANONICAL_BENCHMARK",
            `${node} has no ${component} row, so the energy component cannot be derived`);
        }
      }
      return hourColumns.map((column, index) => {
        const lmp = parts.LMP![column];
        const mcc = parts.MCC![column];
        const mlc = parts.MLC![column];
        if (lmp === undefined || mcc === undefined || mlc === undefined) {
          throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
            `${node} ${column} is blank in at least one component; a blank is never read as zero`);
        }
        let energy: string;
        try {
          energy = sumDecimal([
            { value: canonicalizeMisoNumber(lmp), sign: 1 },
            { value: canonicalizeMisoNumber(mcc), sign: -1 },
            { value: canonicalizeMisoNumber(mlc), sign: -1 },
          ]);
        } catch (error) {
          throw new UepiSourceError(this.seriesId, "INVALID_PRICE",
            `${node} ${column} has an unparseable component: ${error instanceof Error ? error.message : String(error)}`);
        }
        return {
          intervalStartUtc: expected[index]!,
          hourOrdinal: index + 1,
          benchmarkPrice: energy,
          raw: {
            seriesId: this.seriesId,
            rowOrdinal: parsed.header.indexOf(column) + 1,
            nativeOperatingDate: statedDate,
            nativeIntervalLabel: column,
            // Eastern Standard Time is a fixed offset, so the instant is arithmetic rather than a
            // published field. MISO prints no UTC column.
            nativeIntervalUtc: null,
            nativeValue: lmp,
            nativeComponents: { LMP: lmp, MCC: mcc, MLC: mlc, Node: node },
            nativeSourceVersion: { report: "da_expost_lmp", clock: "EST" },
            rawPayload: { Node: node, "HE": column, LMP: lmp, MCC: mcc, MLC: mlc },
          },
        };
      });
    };

    return {
      seriesId: this.seriesId,
      operatingDate,
      records: build(CARRIER_NODE),
      crossCheckRecords: build(CROSS_CHECK_NODE),
      rejected,
      examinedRowCount: examined,
      sourceSchema: {
        header: parsed.header.slice(0, 3).join(",") + `,${hourColumns.length} hour columns`,
        clock: "Eastern Standard Time, fixed offset",
        carrierNode: CARRIER_NODE,
        crossCheckNode: CROSS_CHECK_NODE,
        report: "da_expost_lmp",
      },
      warnings: [],
    };
  },
};
