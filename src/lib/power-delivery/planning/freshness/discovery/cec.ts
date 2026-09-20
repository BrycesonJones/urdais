/**
 * CAISO via the CEC: is there a newer California Energy Demand peak forecast for the balancing
 * authority area?
 *
 * The anchor is the CED peak forecast form itself -- the workbook PD-3C reads the CAISO rows
 * out of. The CEC publishes a great deal under the CED banner, including a separate peak
 * forecast for publicly owned utility planning areas and a statewide baseline set, and an update
 * to any of those is not a replacement for the CAISO planning demand dataset. The check
 * therefore matches the exact form title and rejects the qualified variants.
 */

import {
  anchors, PlanningDiscoveryError,
  type DiscoveredVintage, type PlanningSourceChecker,
} from "@/lib/power-delivery/planning/freshness/discovery/types";

const PAGE = "https://www.energy.ca.gov/data-reports/california-energy-planning-library/forecasts-and-system-planning/demand-side-3";
/** "CED 2025 Peak Forecast" exactly. "CED 2025 Peak Forecast - POU Planning Areas" is a different dataset. */
const PEAK_FORM = /^CED\s+(\d{4})\s+Peak\s+Forecast$/i;

export const cecChecker: PlanningSourceChecker = {
  source: "cec",
  sourceInterfaceSlug: "cec-california-energy-demand-forecast",
  documents: () => [PAGE],

  parse(documents): DiscoveredVintage {
    const page = documents.find((document) => document.url === PAGE);
    if (page === undefined) throw new PlanningDiscoveryError("cec", "the demand forecast page was not retrieved");
    const forms = anchors(page.body)
      .map((anchor) => ({ ...anchor, match: PEAK_FORM.exec(anchor.text) }))
      .filter((entry) => entry.match !== null)
      .map((entry) => ({ href: entry.href, text: entry.text, year: Number(entry.match![1]) }));
    if (forms.length === 0) {
      throw new PlanningDiscoveryError(
        "cec",
        'the demand forecast page links no anchor titled exactly "CED <year> Peak Forecast"; the CAISO planning dataset cannot be identified',
      );
    }
    const latest = forms.reduce((newest, entry) => entry.year > newest.year ? entry : newest);
    return {
      nativeVintageKey: `ced-${latest.year}`,
      // The forecast is identified by its CED year; the page does not date the form.
      publishedAt: null,
      publishedAtPrecision: null,
      artifactUrl: latest.href,
      evidence: {
        page: PAGE,
        matched_title: latest.text,
        years_linked: forms.map((entry) => entry.year).sort(),
        note: "Matched the CED peak forecast form only. The POU planning-area peak forecast and statewide baseline forms are different datasets and do not replace the CAISO balancing-authority forecast.",
      },
    };
  },
};
