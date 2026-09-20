/**
 * ERCOT: is there a finalised Long-Term Load Forecast newer than the one Urdais serves?
 *
 * The discovery is anchored on the canonical LTLF artifacts themselves, and deliberately not on
 * "the newest dated file on the page". ERCOT publishes a great deal alongside the forecast --
 * seasonal adjustment workbooks for reliability standards, Batch Zero large-load updates, audit
 * material -- under later dated paths than the forecast itself. The Load Forecast page today
 * carries an October 2025 winter adjustment workbook sitting above the April 2025 LTLF, and a
 * checker that took the latest file would have declared a new vintage that does not exist and
 * marked ERCOT stale on the strength of it.
 *
 * So a release is recognised only when both canonical pieces appear under one dated path: the
 * peaks workbook the adapter ingests, and a finalised `YYYY_LTLF_Report` alongside it. Anything
 * preliminary lacks the finalised report and is not a vintage.
 */

import {
  anchors, PlanningDiscoveryError,
  type DiscoveredVintage, type PlanningSourceChecker,
} from "@/lib/power-delivery/planning/freshness/discovery/types";

const PAGE = "https://www.ercot.com/gridinfo/load/forecast";
/** The workbook PD-3C ingests. A release Urdais cannot ingest is not a release it can serve. */
const PEAKS_ARTIFACT = /\/files\/docs\/(\d{4})\/(\d{2})\/(\d{2})\/Summer-and-Winter-Peaks\.xlsx$/i;
/** The finalised report. Its presence is what separates a vintage from preliminary material. */
const FINAL_REPORT = /\/files\/docs\/(\d{4})\/(\d{2})\/(\d{2})\/(\d{4})_LTLF_Report\.(docx|pdf)$/i;

export const ercotChecker: PlanningSourceChecker = {
  source: "ercot",
  sourceInterfaceSlug: "ercot-long-term-load-forecast",
  documents: () => [PAGE],

  parse(documents): DiscoveredVintage {
    const page = documents.find((document) => document.url === PAGE);
    if (page === undefined) throw new PlanningDiscoveryError("ercot", "the load forecast page was not retrieved");
    const links = anchors(page.body).map((anchor) => anchor.href);

    const peaks = links.map((href) => ({ href, match: PEAKS_ARTIFACT.exec(href) })).filter((entry) => entry.match !== null);
    if (peaks.length === 0) {
      throw new PlanningDiscoveryError("ercot", "the load forecast page no longer links Summer-and-Winter-Peaks.xlsx; the page has been reorganised");
    }
    const reports = links.map((href) => ({ href, match: FINAL_REPORT.exec(href) })).filter((entry) => entry.match !== null);
    if (reports.length === 0) {
      throw new PlanningDiscoveryError("ercot", "the load forecast page links no finalised YYYY_LTLF_Report; only preliminary material is published");
    }

    // Pair each peaks workbook with a finalised report published under the same dated path.
    const releases = peaks.flatMap((entry) => {
      const [, year, month, day] = entry.match!;
      const prefix = `/files/docs/${year}/${month}/${day}/`;
      const report = reports.find((candidate) => candidate.href.includes(prefix));
      if (report === undefined) return [];
      return [{
        peaksUrl: entry.href,
        reportUrl: report.href,
        reportYear: Number(report.match![4]),
        publishedAt: `${year}-${month}-${day}T00:00:00.000Z`,
      }];
    });
    if (releases.length === 0) {
      throw new PlanningDiscoveryError(
        "ercot",
        "no dated path carries both the peaks workbook and a finalised LTLF report; the newest material on the page is not a finalised vintage",
      );
    }

    // The newest finalised release, by the publication date on its own path.
    const latest = releases.reduce((newest, entry) => entry.publishedAt > newest.publishedAt ? entry : newest);
    const [, year, month] = PEAKS_ARTIFACT.exec(latest.peaksUrl)!;
    return {
      nativeVintageKey: `ltlf-${year}-${month}-adjusted`,
      publishedAt: latest.publishedAt,
      publishedAtPrecision: "day",
      artifactUrl: latest.peaksUrl,
      evidence: {
        page: PAGE,
        finalised_report: latest.reportUrl,
        report_year: latest.reportYear,
        finalised_releases_found: releases.length,
        note: "A release counts only when the peaks workbook and a finalised YYYY_LTLF_Report share a dated path. Batch Zero and seasonal adjustment workbooks are excluded by that rule.",
      },
    };
  },
};
