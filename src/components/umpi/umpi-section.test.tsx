import { fireEvent, render, screen, within } from "@testing-library/react";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { UmpiSection } from "@/components/umpi/umpi-section";
import { buildUmpiReadModel, unconfiguredUmpiReadModel, type PublicationRow } from "@/lib/umpi/read/read-model";

const ppi = (month: string, level: number, change: number | null): PublicationRow => ({
  seriesCode: "UMPI-KR-DRAM-PPI",
  referenceMonth: month,
  level,
  change,
  changeWithheldReason: change === null ? "no_prior_month" : null,
  tradeUnitValueUsdPerKg: null,
  publishedAt: "2026-09-22T23:07:00.000Z",
  methodologyVersion: "1.0.0",
  methodologyEffectiveFrom: "2026-09-22",
  base: "2020=100",
  attributionNotice: "Source: Bank of Korea",
});

const uv = (month: string, level: number, change: number | null, unitValue: number): PublicationRow => ({
  seriesCode: "UMPI-KR-DRAM-EXPORT-UV",
  referenceMonth: month,
  level,
  change,
  changeWithheldReason: change === null ? "no_prior_month" : null,
  tradeUnitValueUsdPerKg: unitValue,
  publishedAt: "2026-09-22T23:07:00.000Z",
  methodologyVersion: "1.0.0",
  methodologyEffectiveFrom: "2026-09-22",
  base: "2020 calendar-year aggregate = 100",
  attributionNotice: "Source: Korea Customs Service, HSK 8542321010",
});

/**
 * Production's actual shape, as the live smoke returned it: eight consecutive PPI months, and a
 * unit-value series carrying its 2020 base year, a five-year hole, then eight 2026 months.
 */
const production = () =>
  buildUmpiReadModel([
    ppi("2026-01", 247.68, null),
    ppi("2026-02", 267.0, 0.07800388),
    ppi("2026-03", 317.4, 0.18876404),
    ppi("2026-04", 437.49, 0.37835539),
    ppi("2026-05", 478.98, 0.09483645),
    ppi("2026-06", 496.84, 0.03728757),
    ppi("2026-07", 538.74, 0.08433298),
    ppi("2026-08", 553.02, 0.02650629),
    ...Array.from({ length: 12 }, (_, i) =>
      uv(`2020-${String(i + 1).padStart(2, "0")}`, 90 + i, i === 0 ? null : 0.01, 12000 + i),
    ),
    ...Array.from({ length: 5 }, (_, i) =>
      uv(`2026-0${i + 1}`, 420 + i * 40, 0.05, 60000 + i * 3000),
    ),
    uv("2026-06", 579.664327, -0.03703574, 74686.887),
    uv("2026-07", 674.999771, 0.16446664, 86970.389),
    uv("2026-08", 687.048079, 0.01784935, 88522.754),
  ]);

/** A series that has just started: too little history for any fixed window. */
const shortHistory = () =>
  buildUmpiReadModel([
    ppi("2026-07", 538.74, null),
    ppi("2026-08", 553.02, 0.02650629),
  ]);

const text = (container: HTMLElement) => container.textContent ?? "";

describe("the UMPI surface reads production and nothing else", () => {
  it("imports no demo data anywhere on the render path", () => {
    const dir = path.join(process.cwd(), "src", "components", "umpi");
    for (const file of readdirSync(dir)) {
      if (file.endsWith(".test.tsx")) continue;
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toContain("data/mock");
      expect(source, file).not.toContain("mock/market-detail");
    }
    // And the server loader reaches the read model, not the mock dataset.
    const surface = readFileSync(path.join(process.cwd(), "src/lib/umpi/read/surface.ts"), "utf8");
    expect(surface).not.toContain("data/mock");
    expect(surface).toContain("loadUmpiReadModel");
  });

  it("is what /markets/UMPI routes to, ahead of the generic market page", () => {
    // The generic page is built around one headline instrument with daily ranges. UMPI must
    // never fall through to it: the branch has to come before the default render, and it has to
    // read the production surface rather than the routed mock market.
    const page = readFileSync(
      path.join(process.cwd(), "src/app/markets/[symbol]/page.tsx"),
      "utf8",
    );
    expect(page).toContain('market.symbol === "UMPI"');
    expect(page).toContain("loadUmpiSurface");
    expect(page.indexOf('market.symbol === "UMPI"')).toBeLessThan(page.indexOf("<MarketDetailPage"));
  });

  it("renders no trace of the demo memory market it replaced", () => {
    const { container } = render(<UmpiSection model={production()} />);
    const rendered = text(container);
    for (const term of [
      "DDR5",
      "DDR4",
      "DDR3",
      "eTT",
      "HBM3E",
      "HBM4",
      "HBM3",
      "HBM",
      "$/part",
      "$/GB",
      "USD/chip",
      "per chip",
      "spot price",
      "chip price",
    ]) {
      expect(rendered, `${term} must not appear on the production UMPI surface`).not.toContain(term);
    }
  });

  it("shows no daily vocabulary on a monthly index", () => {
    const { container } = render(<UmpiSection model={production()} />);
    const rendered = text(container);
    // "today" and a 1D/1W horizon are the generic market page's vocabulary. A month-over-month
    // index that says "today" is claiming a daily observation it never made.
    expect(rendered).not.toMatch(/\btoday\b/i);
    expect(rendered).not.toMatch(/\b1D\b/);
    expect(rendered).not.toMatch(/\b1W\b/);
    expect(rendered).not.toMatch(/\b7D\b/);
    expect(rendered).not.toContain("24h");
  });

  it("leaks no internal identifier, digest or rights marker", () => {
    const { container } = render(<UmpiSection model={production()} />);
    const rendered = text(container);
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(rendered).not.toMatch(/\b[0-9a-f]{64}\b/i);
    for (const marker of [
      "founder_accepted_risk",
      "ambiguous_requires_legal_review",
      "source_retrieval_id",
      "internal_only",
      "provenance_hash",
      "inputs_digest",
    ]) {
      expect(rendered, marker).not.toContain(marker);
    }
  });
});

describe("two series and no composite", () => {
  it("offers exactly the two public series, defaulting to the official price index", () => {
    render(<UmpiSection model={production()} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(tabs[0]).toHaveAccessibleName(/UMPI-KR DRAM PPI/);
    expect(tabs[1]).toHaveAttribute("aria-selected", "false");
  });

  it("states plainly that there is no single UMPI level", () => {
    const { container } = render(<UmpiSection model={production()} />);
    expect(text(container)).toContain("no single UMPI level");
    // The family carries no headline number of its own: the only large level on the page is the
    // selected series'. A composite would have to come from somewhere, and there is nowhere.
    expect(production().family.hasCompositeLevel).toBe(false);
  });

  it("switches the whole semantic context when the series changes", () => {
    const { container } = render(<UmpiSection model={production()} />);

    expect(text(container)).toContain("553.02");
    expect(text(container)).toContain("2020=100");
    expect(text(container)).toContain("Bank of Korea");
    expect(text(container)).not.toContain("Korea Customs Service");

    fireEvent.click(screen.getByRole("tab", { name: /Export Unit-Value/ }));

    const after = text(container);
    expect(after).toContain("687.05");
    expect(after).toContain("2020 calendar-year aggregate = 100");
    expect(after).toContain("Korea Customs Service");
    expect(after).toContain("8542321010");
    // No stale Series A metadata left behind: the PPI level, base and agency are all gone.
    expect(after).not.toContain("553.02");
    expect(after).not.toContain("Bank of Korea");
    expect(after).not.toContain("404Y016");
  });
});

describe("the headline describes a month", () => {
  it("shows the level, the MoM change and the reference month", () => {
    const { container } = render(<UmpiSection model={production()} />);
    const rendered = text(container);
    expect(rendered).toContain("553.02");
    expect(rendered).toContain("index points");
    expect(rendered).toContain("+2.65%");
    expect(rendered).toContain("MoM");
    expect(rendered).toContain("Aug 2026");
    expect(rendered).toContain("Monthly");
  });

  it("keeps the publication instant distinct from the month described", () => {
    const { container } = render(<UmpiSection model={production()} />);
    const rendered = text(container);
    expect(rendered).toContain("Reference month");
    expect(rendered).toContain("Last published");
    // The month is a month; the publication instant is a date. Collapsing them is how a monthly
    // index starts reading as a daily one.
    expect(rendered).toMatch(/Reference month\s*Aug 2026/);
  });

  it("says why a change is absent rather than printing a zero", () => {
    const model = buildUmpiReadModel([ppi("2026-08", 553.02, null)]);
    const { container } = render(<UmpiSection model={model} />);
    expect(text(container)).toContain("no prior month to compare against");
    // A withheld change is not a flat month.
    expect(text(container)).not.toContain("0.00%");
  });
});

describe("the unit-value series carries its caveat", () => {
  it("shows the mix warning in the page body, not only in a title attribute", () => {
    render(<UmpiSection model={production()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Export Unit-Value/ }));
    const warning = screen.getByText(/not a pure price index/);
    expect(warning).toBeVisible();
    expect(warning.textContent).toContain("composition/mix of exported DRAM");
  });

  it("names the underlying USD/kg figure a trade unit value and never a price", () => {
    const { container } = render(<UmpiSection model={production()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Export Unit-Value/ }));
    const rendered = text(container);
    expect(rendered).toContain("Trade unit value");
    expect(rendered).toContain("$88,522.75 / kg");
    // The index's own unit stays index points; USD/kg is a separate, named quantity.
    expect(rendered).toContain("index points");
    for (const wrong of ["chip price", "spot price", "DRAM price", "average price"]) {
      expect(rendered, wrong).not.toContain(wrong);
    }
  });

  it("shows no warning on the price index, where it would be false", () => {
    const { container } = render(<UmpiSection model={production()} />);
    expect(text(container)).not.toContain("not a pure price index");
  });
});

describe("the chart shows published months only", () => {
  it("describes the series in text, for a reader who cannot see the line", () => {
    render(<UmpiSection model={production()} />);
    const chart = screen.getByRole("img");
    expect(chart).toHaveAccessibleName(/UMPI-KR DRAM PPI/);
    expect(chart).toHaveAccessibleName(/8 published months/);
    expect(chart).toHaveAccessibleName(/Jan 2026 to Aug 2026/);
  });

  it("breaks the line across a gap and says so", () => {
    const { container } = render(<UmpiSection model={production()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Export Unit-Value/ }));
    // Two contiguous runs -- the 2020 base year and 2026 -- drawn as two paths, never joined.
    expect(container.querySelectorAll("svg path")).toHaveLength(2);
    expect(text(container)).toContain("nothing is interpolated across a gap");
  });

  it("draws a single published month as a dot, with no line and no change", () => {
    const model = buildUmpiReadModel([ppi("2026-08", 553.02, null)]);
    const { container } = render(<UmpiSection model={model} />);
    expect(container.querySelectorAll("svg path")).toHaveLength(0);
    expect(container.querySelectorAll("svg circle")).toHaveLength(1);
    expect(text(container)).toContain("no window to measure a change over yet");
  });

  it("renders no chart at all when the series has no published month", () => {
    const model = buildUmpiReadModel([]);
    const { container } = render(<UmpiSection model={model} />);
    expect(container.querySelector("svg")).toBeNull();
    expect(text(container)).toContain("No published months for this series");
  });
});

describe("range controls suit a monthly index", () => {
  it("offers only horizons the published history can fill", () => {
    render(<UmpiSection model={production()} />);
    const labels = within(screen.getByRole("group", { name: "Chart range" }))
      .getAllByRole("button")
      .map((button) => button.textContent);
    // Eight months fill a three- and six-month window but not a year, so 1Y is not offered.
    expect(labels).toEqual(["3M", "6M", "All"]);
    expect(labels).not.toContain("1D");
    expect(labels).not.toContain("1W");
    expect(labels).not.toContain("1Y");
  });

  it("offers only the whole history when there is too little of it for any window", () => {
    render(<UmpiSection model={shortHistory()} />);
    const labels = within(screen.getByRole("group", { name: "Chart range" }))
      .getAllByRole("button")
      .map((button) => button.textContent);
    expect(labels).toEqual(["All"]);
  });

  it("does not let a range redefine the headline change", () => {
    const { container } = render(<UmpiSection model={production()} />);
    fireEvent.click(screen.getByRole("tab", { name: /Export Unit-Value/ }));
    const group = screen.getByRole("group", { name: "Chart range" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(1);

    const headlineBefore = text(container).includes("+1.78%");
    fireEvent.click(buttons[0]!);
    // The window's own change is labelled as the window's; the headline stays MoM.
    expect(text(container)).toContain("MoM");
    expect(text(container).includes("+1.78%")).toBe(headlineBefore);
    expect(text(container)).toContain("Over this window");
  });
});

describe("methodology and source come from the read model", () => {
  it("shows the approved version, its effective date, the base and the cadence", () => {
    const { container } = render(<UmpiSection model={production()} />);
    const rendered = text(container);
    expect(rendered).toContain("1.0.0");
    expect(rendered).toContain("Sep 22, 2026");
    expect(rendered).toContain("2020=100");
    expect(rendered).toContain("Monthly");
    expect(screen.getByRole("link", { name: /UMPI-KR DRAM/ })).toHaveAttribute(
      "href",
      "/docs/methodology/umpi-kr-dram",
    );
  });

  it("carries each agency's required attribution with the series it belongs to", () => {
    const { container } = render(<UmpiSection model={production()} />);
    expect(text(container)).toContain("Source: Bank of Korea");
    expect(text(container)).toContain("Economic Statistics System (ECOS)");

    fireEvent.click(screen.getByRole("tab", { name: /Export Unit-Value/ }));
    expect(text(container)).toContain("Source: Korea Customs Service, HSK 8542321010");
  });
});

describe("the surface fails closed", () => {
  it("shows no figure and states the reason when no database is configured", () => {
    const { container } = render(<UmpiSection model={unconfiguredUmpiReadModel()} />);
    const rendered = text(container);
    expect(rendered).toContain("No published data");
    expect(rendered).toContain("Urdais cannot reach its published data");
    // The whole point: no level, no change, no chart, and nothing borrowed from the demo market.
    expect(container.querySelector("svg")).toBeNull();
    expect(rendered).not.toMatch(/\d+\.\d{2}\s*index points/);
    expect(rendered).not.toContain("HBM");
    expect(rendered).not.toContain("DDR");
  });

  it("distinguishes an unreachable database from a series with nothing published", () => {
    const empty = buildUmpiReadModel([]);
    const { container } = render(<UmpiSection model={empty} />);
    expect(text(container)).toContain("no published observations");
    expect(text(container)).not.toContain("Urdais cannot reach its published data");
  });
});

describe("the surface says how current it is", () => {
  const withFreshness = (state: string, overrides: Record<string, unknown> = {}) => {
    const model = production();
    return {
      ...model,
      freshness: state,
      series: model.series.map((series) => ({
        ...series,
        freshness: {
          state,
          expectedReferenceMonth: "2026-09",
          latestReferenceMonth: series.latest?.referenceMonth ?? null,
          dueAt: "2026-10-29T00:00:00.000Z",
          staleSince: state === "stale" ? "2026-10-29T00:00:00.000Z" : null,
          lastCheckedAt: "2026-11-05T00:00:00.000Z",
          reason: "test",
          ...overrides,
        },
      })),
    } as typeof model;
  };

  it("says nothing at all when the series is current", () => {
    const { container } = render(<UmpiSection model={withFreshness("fresh")} />);
    // A badge on every page that reads "up to date" is furniture; a reader stops seeing it long
    // before the day it would matter.
    expect(text(container)).not.toContain("Awaiting the next monthly release");
    expect(text(container)).not.toContain("This series is behind");
  });

  it("distinguishes waiting for the agency from being late", () => {
    const waiting = render(<UmpiSection model={withFreshness("awaiting_release")} />);
    expect(text(waiting.container)).toContain("Awaiting the next monthly release");
    expect(text(waiting.container)).toContain("Sep 2026");
    // Waiting is not a fault and must not be worded as one.
    expect(text(waiting.container)).not.toContain("behind");
    waiting.unmount();

    const late = render(<UmpiSection model={withFreshness("stale")} />);
    expect(text(late.container)).toContain("This series is behind");
    expect(text(late.container)).toContain("is not current");
  });

  it("keeps every historical point readable while the newest month is late", () => {
    const { container } = render(<UmpiSection model={withFreshness("stale")} />);
    // The gate withholds currentness, never history: dropping the chart to signal a problem with
    // its newest row would destroy the evidence a reader needs to judge the gap.
    expect(container.querySelector("svg")).not.toBeNull();
    expect(text(container)).toContain("553.02");
    expect(text(container)).toContain("8 published months");
  });

  it("names an unreachable source and an unverifiable one differently", () => {
    const down = render(<UmpiSection model={withFreshness("source_unavailable")} />);
    expect(text(down.container)).toContain("The source could not be reached");
    down.unmount();

    const unsure = render(<UmpiSection model={withFreshness("unknown")} />);
    expect(text(unsure.container)).toContain("Currentness cannot be confirmed");
    expect(text(unsure.container)).toContain("cannot be vouched for");
  });

  it("exposes no operational internals alongside the freshness verdict", () => {
    const { container } = render(<UmpiSection model={withFreshness("stale")} />);
    const rendered = text(container);
    for (const marker of ["operational_run", "failure_stage", "umpi_source_checks", "pg_advisory", "INFO-200"]) {
      expect(rendered, marker).not.toContain(marker);
    }
    expect(rendered).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});
