/**
 * PJM: which Load Forecast Report year is currently published?
 *
 * PJM puts the report year in the artifact filename, so the latest release is the highest year
 * it links a data workbook for. The check anchors on `data`, the workbook PD-3C ingests, rather
 * than on the PDF or the tables workbook: a year whose data file is not published is a year
 * Urdais cannot ingest, and calling it the latest vintage would mark PJM permanently behind.
 */

import {
  anchors, PlanningDiscoveryError,
  type DiscoveredVintage, type PlanningSourceChecker,
} from "@/lib/power-delivery/planning/freshness/discovery/types";

const PAGE = "https://www.pjm.com/planning/resource-adequacy-planning/load-forecast-dev-process";
const DATA_WORKBOOK = /(\d{4})-load-report-data\.xlsx$/i;

export const pjmChecker: PlanningSourceChecker = {
  source: "pjm",
  sourceInterfaceSlug: "pjm-load-forecast-report",
  documents: () => [PAGE],

  parse(documents): DiscoveredVintage {
    const page = documents.find((document) => document.url === PAGE);
    if (page === undefined) throw new PlanningDiscoveryError("pjm", "the load forecast page was not retrieved");
    const releases = anchors(page.body)
      .map((anchor) => ({ href: anchor.href, match: DATA_WORKBOOK.exec(anchor.href) }))
      .filter((entry) => entry.match !== null)
      .map((entry) => ({ href: entry.href, year: Number(entry.match![1]) }));
    if (releases.length === 0) {
      throw new PlanningDiscoveryError("pjm", "the load forecast page links no YYYY-load-report-data.xlsx; the page has been reorganised");
    }
    const latest = releases.reduce((newest, entry) => entry.year > newest.year ? entry : newest);
    const absolute = latest.href.startsWith("http") ? latest.href : `https://www.pjm.com${latest.href}`;
    return {
      nativeVintageKey: `load-forecast-${latest.year}`,
      // The page states the year, not the day. Claiming a day would be inventing one.
      publishedAt: `${latest.year}-01-01T00:00:00.000Z`,
      publishedAtPrecision: "year",
      artifactUrl: absolute,
      evidence: { page: PAGE, years_linked: releases.map((entry) => entry.year).sort(), latest_year: latest.year },
    };
  },
};
