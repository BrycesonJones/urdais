import { describe, expect, it } from "vitest";

import { cecChecker } from "@/lib/power-delivery/planning/freshness/discovery/cec";
import { ercotChecker } from "@/lib/power-delivery/planning/freshness/discovery/ercot";
import { isoneChecker } from "@/lib/power-delivery/planning/freshness/discovery/isone";
import { pjmChecker } from "@/lib/power-delivery/planning/freshness/discovery/pjm";
import { PlanningDiscoveryError, anchors, type DiscoveryDocument } from "@/lib/power-delivery/planning/freshness/discovery/types";

const NOW = new Date("2026-09-22T00:00:00.000Z");
const page = (url: string, body: string, status = 200): DiscoveryDocument => ({ url, status, body });
const link = (href: string, text = "file") => `<a href="${href}">${text}</a>`;

// ------------------------------------------------------------------------------------- ERCOT
const ERCOT_PAGE = "https://www.ercot.com/gridinfo/load/forecast";
const ercotBody = (...links: string[]) => `<html><body>${links.join("\n")}</body></html>`;
const ERCOT_2025 = [
  link("https://www.ercot.com/files/docs/2025/04/08/Summer-and-Winter-Peaks.xlsx"),
  link("https://www.ercot.com/files/docs/2025/04/08/2025_LTLF_Report.docx"),
];

describe("ERCOT release discovery", () => {
  it("names the finalised release the adapter can actually ingest", () => {
    const found = ercotChecker.parse([page(ERCOT_PAGE, ercotBody(...ERCOT_2025))]);
    expect(found).toMatchObject({
      nativeVintageKey: "ltlf-2025-04-adjusted",
      publishedAt: "2025-04-08T00:00:00.000Z",
      publishedAtPrecision: "day",
    });
  });

  it("does not let preliminary or seasonal material become a vintage", () => {
    // The live page carries an October 2025 winter adjustment workbook and Batch Zero material
    // under later dated paths than the April 2025 forecast. Taking the newest file would have
    // invented a release and marked ERCOT stale against it.
    const noisy = ercotBody(
      ...ERCOT_2025,
      link("https://www.ercot.com/files/docs/2025/10/06/ERCOT-Adjusted-Load-Forecast-Winter-2025-2026-for-RS-Magnitude-2025.10.07-.xlsx"),
      link("https://www.ercot.com/files/docs/2026/09/11/14-Batch-Zero-Update.pdf"),
      link("https://www.ercot.com/files/docs/2026/02/01/2026-Preliminary-Load-Forecast.xlsx"),
    );
    expect(ercotChecker.parse([page(ERCOT_PAGE, noisy)]).nativeVintageKey).toBe("ltlf-2025-04-adjusted");
  });

  it("recognises a genuine new release once both canonical pieces are published together", () => {
    const next = ercotBody(
      ...ERCOT_2025,
      link("https://www.ercot.com/files/docs/2026/04/10/Summer-and-Winter-Peaks.xlsx"),
      link("https://www.ercot.com/files/docs/2026/04/10/2026_LTLF_Report.docx"),
    );
    expect(ercotChecker.parse([page(ERCOT_PAGE, next)])).toMatchObject({
      nativeVintageKey: "ltlf-2026-04-adjusted", publishedAt: "2026-04-10T00:00:00.000Z",
    });
  });

  it("refuses a peaks workbook published without a finalised report beside it", () => {
    const orphan = ercotBody(link("https://www.ercot.com/files/docs/2026/04/10/Summer-and-Winter-Peaks.xlsx"));
    expect(() => ercotChecker.parse([page(ERCOT_PAGE, orphan)])).toThrow(/no finalised YYYY_LTLF_Report/);
  });

  it("fails closed when the page stops linking the workbook it ingests", () => {
    expect(() => ercotChecker.parse([page(ERCOT_PAGE, ercotBody(link("/files/docs/2026/04/10/something-else.xlsx")))]))
      .toThrow(PlanningDiscoveryError);
    expect(() => ercotChecker.parse([])).toThrow(/was not retrieved/);
  });
});

// --------------------------------------------------------------------------------------- PJM
const PJM_PAGE = "https://www.pjm.com/planning/resource-adequacy-planning/load-forecast-dev-process";

describe("PJM release discovery", () => {
  it("takes the highest report year that has a data workbook", () => {
    const body = `<html>${link("/-/media/DotCom/library/reports-notices/load-forecast/2025-load-report-data.xlsx")}
      ${link("/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report-data.xlsx")}</html>`;
    expect(pjmChecker.parse([page(PJM_PAGE, body)])).toMatchObject({
      nativeVintageKey: "load-forecast-2026", publishedAtPrecision: "year",
      artifactUrl: "https://www.pjm.com/-/media/DotCom/library/reports-notices/load-forecast/2026-load-report-data.xlsx",
    });
  });

  it("ignores a report year published only as a PDF, which cannot be ingested", () => {
    const body = `<html>${link("/x/2026-load-report-data.xlsx")}${link("/x/2027-load-report.pdf")}</html>`;
    expect(pjmChecker.parse([page(PJM_PAGE, body)]).nativeVintageKey).toBe("load-forecast-2026");
  });

  it("fails closed when no data workbook is linked at all", () => {
    expect(() => pjmChecker.parse([page(PJM_PAGE, "<html>nothing</html>")])).toThrow(/reorganised/);
  });
});

// --------------------------------------------------------------------------------------- CEC
const CEC_PAGE = "https://www.energy.ca.gov/data-reports/california-energy-planning-library/forecasts-and-system-planning/demand-side-3";

describe("CEC release discovery", () => {
  it("matches the CAISO peak forecast form and not its lookalikes", () => {
    const body = `<html>
      ${link("https://efiling.energy.ca.gov/GetDocument.aspx?tn=268124", "CED 2025 Peak Forecast")}
      ${link("/media/12515", "CED 2026 Peak Forecast - POU Planning Areas")}
      ${link("/media/1", "CED 2027 Baseline Forecast - Total State")}
    </html>`;
    const found = cecChecker.parse([page(CEC_PAGE, body)]);
    // The POU and statewide forms carry later years and are deliberately not a CAISO release.
    expect(found.nativeVintageKey).toBe("ced-2025");
    expect(found.evidence).toMatchObject({ matched_title: "CED 2025 Peak Forecast" });
  });

  it("recognises a genuine newer CED peak forecast", () => {
    const body = `<html>${link("/a", "CED 2025 Peak Forecast")}${link("/b", "CED 2027 Peak Forecast")}</html>`;
    expect(cecChecker.parse([page(CEC_PAGE, body)]).nativeVintageKey).toBe("ced-2027");
  });

  it("fails closed when the form title disappears", () => {
    expect(() => cecChecker.parse([page(CEC_PAGE, `<html>${link("/a", "CED 2025 Hourly Forecast - CAISO")}</html>`)]))
      .toThrow(/no anchor titled exactly/);
  });
});

// ------------------------------------------------------------------------------------ ISO-NE
const celt = (year: number, status: number) =>
  page(`https://www.iso-ne.com/static-assets/documents/100035/${year}_celt.xlsx`, "", status);

describe("ISO-NE release discovery", () => {
  it("takes the newest report year that actually exists at the canonical path", () => {
    expect(isoneChecker.parse([celt(2026, 200), celt(2027, 404)]).nativeVintageKey).toBe("celt-2026");
    expect(isoneChecker.parse([celt(2026, 200), celt(2027, 200)]).nativeVintageKey).toBe("celt-2027");
  });

  it("probes from the known vintage up to next year", () => {
    expect(isoneChecker.documents(NOW)).toEqual([
      "https://www.iso-ne.com/static-assets/documents/100035/2026_celt.xlsx",
      "https://www.iso-ne.com/static-assets/documents/100035/2027_celt.xlsx",
    ]);
  });

  it("fails closed when nothing is found at the canonical path", () => {
    expect(() => isoneChecker.parse([celt(2026, 404), celt(2027, 404)])).toThrow(/path has moved/);
  });
});

describe("anchor parsing", () => {
  it("decodes entities in both href and text", () => {
    const parsed = anchors('<a href="https://x/y?tn=1&amp;id=2">CED&nbsp;2025 Peak&#32;Forecast</a>');
    expect(parsed).toEqual([{ href: "https://x/y?tn=1&id=2", text: "CED 2025 Peak Forecast" }]);
  });
});
