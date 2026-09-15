/**
 * What the UBWI surface renders at each length of real production history.
 *
 * No fixture here is a mock UBWI series. The one-point case is the actual frozen
 * production point; the longer cases are hand-written points standing for days that have
 * not happened yet, and they exist to prove the component's rules, never to be rendered.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UbwiChart } from "@/components/ubwi/ubwi-chart";
import { UbwiSection } from "@/components/ubwi/ubwi-section";
import { ubwiIndexSnapshot, ubwiSurface, UBWI_VALUE_FRACTION_DIGITS } from "@/lib/ubwi/read/surface";

const DAY = 86_400;
const PRODUCTION_POINT = {
  publishedAt: "2026-09-15T04:33:47.738Z",
  valuePercent: 0.26716309468662236,
  changePercent: null,
};
const PRODUCTION_TIME = Math.floor(Date.parse(PRODUCTION_POINT.publishedAt) / 1000);

describe("the UBWI chart", () => {
  it("renders nothing with no production history", () => {
    const { container } = render(<UbwiChart points={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing with one production point, rather than a flat line through it", () => {
    // A single observation is a value, not a history. A horizontal line drawn through it
    // would assert a stability nobody measured.
    const { container } = render(
      <UbwiChart points={[{ time: PRODUCTION_TIME, value: PRODUCTION_POINT.valuePercent }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the chart and its timeframe controls once two points exist", () => {
    render(
      <UbwiChart
        points={[
          { time: PRODUCTION_TIME, value: 0.2672 },
          { time: PRODUCTION_TIME + DAY, value: 0.27 },
        ]}
      />,
    );
    expect(screen.getByRole("group", { name: /timeframe/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /All/ })).toBeInTheDocument();
  });

  it("disables every range the real history cannot support", () => {
    render(
      <UbwiChart
        points={[
          { time: PRODUCTION_TIME, value: 0.2672 },
          { time: PRODUCTION_TIME + DAY, value: 0.27 },
        ]}
      />,
    );
    // Two daily points support "All" and one day. A year of history does not exist and
    // its button must not pretend otherwise.
    expect(screen.getByRole("button", { name: /All/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /1 year/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /1 month/ })).toBeDisabled();
  });

  it("states the whole-history move as a relative percentage return", () => {
    render(
      <UbwiChart
        points={[
          { time: PRODUCTION_TIME, value: 0.2672 },
          { time: PRODUCTION_TIME + DAY, value: 0.27 },
        ]}
      />,
    );
    // 0.2672 -> 0.2700 is +1.05 %, not the +0.00% a percentage-point difference renders as.
    expect(screen.getByRole("button", { name: /All/ })).toHaveTextContent("+1.05%");
  });
});

describe("the UBWI surface with its chart", () => {
  const surface = ubwiSurface({ now: "2026-09-15T04:33:47.738Z", publication: PRODUCTION_POINT });

  it("shows the headline and the withheld-change note with one point, and no chart", () => {
    const { container } = render(<UbwiSection surface={surface} history={[{ time: PRODUCTION_TIME, value: 0.2672 }]} />);
    expect(screen.getByText(/Percentage change is unavailable/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });

  it("keeps every disclosure when the chart appears", () => {
    render(
      <UbwiSection
        surface={ubwiSurface({
          now: "2026-09-16T06:00:00.000Z",
          publication: { publishedAt: "2026-09-16T06:00:00.000Z", valuePercent: 0.27, changePercent: 1.047904 },
        })}
        history={[
          { time: PRODUCTION_TIME, value: 0.2672 },
          { time: PRODUCTION_TIME + DAY, value: 0.27 },
        ]}
      />,
    );
    expect(screen.getByText("Directly observed")).toBeInTheDocument();
    expect(screen.getByText("Modelled")).toBeInTheDocument();
    expect(screen.getByText("Sensitivity range")).toBeInTheDocument();
    expect(screen.getByText("Protocol-derived scheduled issuance", { exact: false })).toBeInTheDocument();
    // The withheld-change note goes away on its own once a change exists.
    expect(screen.queryByText(/Percentage change is unavailable/)).toBeNull();
    // And the chart is there.
    expect(screen.getByRole("group", { name: /timeframe/i })).toBeInTheDocument();
  });

  it("shows no demo badge, no mock history and no back-filled point", () => {
    const { container } = render(
      <UbwiSection
        surface={surface}
        history={[
          { time: PRODUCTION_TIME, value: 0.2672 },
          { time: PRODUCTION_TIME + DAY, value: 0.27 },
        ]}
      />,
    );
    const text = container.textContent ?? "";
    for (const forbidden of ["Demo", "demo", "Sample", "Illustrative", "Research preview"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

describe("the homepage row", () => {
  it("still comes from the newest frozen point, at the shared UBWI precision", () => {
    const row = ubwiIndexSnapshot({
      publishedAt: "2026-09-16T06:00:00.000Z",
      valuePercent: 0.27,
      changePercent: 1.047904,
    });
    expect(row).not.toBeNull();
    expect(row!.symbol).toBe("UBWI");
    expect(row!.value).toBe(0.27);
    expect(row!.changePercent).toBeCloseTo(1.047904, 6);
    expect(row!.valueFractionDigits).toBe(UBWI_VALUE_FRACTION_DIGITS);
    expect(row!.asOf).toBe(Math.floor(Date.parse("2026-09-16T06:00:00.000Z") / 1000));
  });

  it("has no row at all when nothing is published", () => {
    expect(ubwiIndexSnapshot(null)).toBeNull();
  });
});
