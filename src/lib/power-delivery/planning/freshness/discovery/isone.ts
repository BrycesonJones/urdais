/**
 * ISO New England: is there a CELT report newer than the one Urdais serves?
 *
 * The CELT landing page renders its document list client-side, so there is no listing in the
 * HTML to parse. Rather than scrape a rendered page or guess from prose, the check probes
 * ISO-NE's own canonical asset path for each candidate report year and takes the newest that
 * actually exists. That is deterministic, it is evidence the publisher serves directly, and a
 * 404 is a definite answer rather than an ambiguous one.
 *
 * Candidate years run from the report year Urdais holds up to the next calendar year: CELT is
 * annual and published in the spring, so a report more than one year ahead of the wall clock
 * would be a surprise worth failing on rather than silently accepting.
 */

import {
  PlanningDiscoveryError,
  type DiscoveredVintage, type PlanningSourceChecker,
} from "@/lib/power-delivery/planning/freshness/discovery/types";

const ASSET = (year: number): string => `https://www.iso-ne.com/static-assets/documents/100035/${year}_celt.xlsx`;
/** The earliest year worth probing: the vintage PD-3C ingested. */
const FIRST_KNOWN_YEAR = 2026;

export const isoneChecker: PlanningSourceChecker = {
  source: "isone",
  sourceInterfaceSlug: "iso-ne-celt-report",

  documents(now) {
    const horizon = now.getUTCFullYear() + 1;
    const years: number[] = [];
    for (let year = FIRST_KNOWN_YEAR; year <= Math.max(horizon, FIRST_KNOWN_YEAR); year += 1) years.push(year);
    return years.map(ASSET);
  },

  parse(documents): DiscoveredVintage {
    const probes = documents.map((document) => {
      const year = Number(/\/(\d{4})_celt\.xlsx$/.exec(document.url)?.[1] ?? Number.NaN);
      return { url: document.url, year, status: document.status };
    });
    if (probes.some((probe) => !Number.isInteger(probe.year))) {
      throw new PlanningDiscoveryError("isone", "a probe URL was not a CELT asset path");
    }
    const present = probes.filter((probe) => probe.status === 200);
    if (present.length === 0) {
      throw new PlanningDiscoveryError(
        "isone",
        `no CELT workbook was found at ISO-NE's canonical asset path for years ${probes.map((p) => p.year).join(", ")}; the path has moved`,
      );
    }
    const latest = present.reduce((newest, probe) => probe.year > newest.year ? probe : newest);
    return {
      nativeVintageKey: `celt-${latest.year}`,
      // CELT is published in the spring; the probe establishes existence, not a date.
      publishedAt: null,
      publishedAtPrecision: null,
      artifactUrl: latest.url,
      evidence: {
        probes: probes.map((probe) => ({ year: probe.year, status: probe.status })),
        latest_year: latest.year,
        note: "Existence at ISO-NE's own canonical asset path. A 404 is a definite absence, not a parse failure.",
      },
    };
  },
};
