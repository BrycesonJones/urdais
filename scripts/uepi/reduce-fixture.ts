/**
 * Reduce a captured UEPI source artifact to a committable fixture, deterministically.
 *
 * Two of the four sources ship files of several megabytes -- MISO prices every node in its
 * footprint, SPP every settlement location -- and committing a year of those would be unreasonable
 * repository weight for evidence of a schema. So those fixtures are row subsets, and this script
 * is how they are produced: it selects whole lines by the locations a parser actually reads, plus
 * a few rows that exist to prove the parser *rejects* them, and changes no character of any line
 * it keeps.
 *
 * What it must never do, and does not: edit a value, round a price, re-order rows, rewrite a
 * header, or synthesise a line. A reduced fixture is a subset of the original file, and the
 * manifest records the original artifact's own digest beside the fixture's so the two can never be
 * confused for one another.
 *
 *   npx tsx scripts/uepi/reduce-fixture.ts miso <source.csv> <fixture.csv>
 *   npx tsx scripts/uepi/reduce-fixture.ts spp  <source.csv> <fixture.csv>
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

/** Locations whose rows are kept in full, because a parser reads them. */
const KEEP = {
  miso: ["INDIANA.HUB", "MINN.HUB"],
  spp: ["SPPNORTH_HUB", "SPPSOUTH_HUB"],
} as const;

/**
 * Rows kept so the fixture can prove what the parser turns away: an official hub that is not a
 * carrier, a participant hub whose name merely contains HUB, a western-market row, and a node
 * that prices negative. Capped, and taken in file order, so the reduction is reproducible.
 */
const SAMPLE_PATTERNS = {
  miso: [/^ILLINOIS\.HUB,/, /^MICHIGAN\.HUB,/, /^NIPS\./, /^AECI\./],
  spp: [/,SWPW,/, /,CSWS_HUB,/, /,AEC,/],
} as const;

const SAMPLES_PER_PATTERN = 3;

function reduce(market: "miso" | "spp", text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];
  const counts = new Map<number, number>();

  for (const line of lines) {
    if (line.trim() === "") continue;
    const isHeaderOrPreamble =
      market === "miso"
        ? !/^[A-Z0-9_.]+\.(HUB|[A-Z0-9_]+),/.test(line) && kept.length < 8
        : line.startsWith("Interval,");
    if (isHeaderOrPreamble) { kept.push(line); continue; }

    if (KEEP[market].some((location) => line.includes(`${location},`) || line.includes(`,${location},`))) {
      kept.push(line);
      continue;
    }
    SAMPLE_PATTERNS[market].forEach((pattern, index) => {
      if (!pattern.test(line)) return;
      const seen = counts.get(index) ?? 0;
      if (seen >= SAMPLES_PER_PATTERN) return;
      counts.set(index, seen + 1);
      kept.push(line);
    });
  }
  return `${kept.join("\n")}\n`;
}

const [market, source, destination] = process.argv.slice(2);
if (market !== "miso" && market !== "spp") throw new Error("market must be 'miso' or 'spp'");
if (source === undefined || destination === undefined) throw new Error("usage: reduce-fixture <market> <source> <destination>");

const original = readFileSync(source);
const reduced = reduce(market, original.toString("utf8"));
writeFileSync(destination, reduced);

const digest = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
console.log(JSON.stringify({
  market,
  source,
  destination,
  originalBytes: original.byteLength,
  originalSha256: digest(original),
  fixtureBytes: Buffer.byteLength(reduced),
  fixtureSha256: digest(reduced),
  originalLines: original.toString("utf8").split(/\r?\n/).filter((line) => line.trim() !== "").length,
  fixtureLines: reduced.split("\n").filter((line) => line.trim() !== "").length,
}, null, 2));
