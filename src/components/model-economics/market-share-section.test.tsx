import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarketShareChart } from "@/components/model-economics/market-share-chart";
import { buildMarketShareView, type MarketShareView } from "@/lib/market-share/view";
import { deriveMarketShare } from "@/lib/market-share/derive";
import type { ShareObservation } from "@/lib/market-share/types";

const observation = (
  overrides: Partial<ShareObservation> & { permaslug: string; tokens: bigint },
): ShareObservation => ({
  namespace: null,
  isResidual: false,
  labSlug: null,
  labName: null,
  labAttributionState: "unmapped",
  qualityFlags: [],
  ...overrides,
});

/**
 * A production-shaped view, built through the real derivation and the real view builder rather
 * than hand-written. A fixture that bypassed them could drift from what the page actually
 * receives, which is the failure this whole phase is replacing.
 */
function productionShaped(): MarketShareView {
  const derivation = deriveMarketShare("2026-09-15", "provisional", 10_000n, [
    observation({
      permaslug: "deepseek/deepseek-v4.1-flash-20260910",
      tokens: 5_000n,
      namespace: "deepseek",
      labSlug: "deepseek",
      labName: "DeepSeek",
      labAttributionState: "evidenced",
    }),
    observation({
      permaslug: "openai/gpt-5.6-luna-20260709",
      tokens: 2_000n,
      namespace: "openai",
      labSlug: "openai",
      labName: "OpenAI",
      labAttributionState: "evidenced",
    }),
    observation({
      permaslug: "stealth/ox-alpha",
      tokens: 1_500n,
      namespace: "stealth",
      labAttributionState: "undisclosed",
    }),
    observation({
      permaslug: "openrouter/owl-alpha",
      tokens: 500n,
      namespace: "openrouter",
      labAttributionState: "unmapped",
      qualityFlags: ["SERVING_PLATFORM_AS_AUTHOR"],
    }),
    observation({
      permaslug: "other",
      tokens: 1_000n,
      isResidual: true,
      labAttributionState: "not_applicable",
    }),
  ]);

  const { view } = buildMarketShareView({
    derivation,
    failures: [],
    lineage: {
      date: "2026-09-15",
      publicationId: "pub-1",
      calculationId: "calc-1",
      snapshotId: "snap-1",
      revisionNumber: 1,
      methodologyVersion: "1.0.0",
      universeDescriptor:
        "Token volume exposed by OpenRouter's rankings-daily dataset for the traffic included by that dataset.",
      sourceAttribution: "Source: OpenRouter (openrouter.ai/rankings), as of 2026-09-16T01:00:33.578Z.",
      publishedAt: "2026-09-16T01:05:00.000Z",
      sourceAsOf: "2026-09-16T01:00:33.578Z",
      settlementState: "provisional",
      totalObservedTokens: 10_000n,
    },
  });
  return view!;
}

describe("the Labs / Models toggle", () => {
  it("opens on Labs and shows canonical labs, not namespaces", () => {
    render(<MarketShareChart view={productionShaped()} />);

    expect(screen.getByRole("button", { name: "Labs" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    // 5,000 / 10,000, against the total and not against attributed-only volume.
    expect(screen.getByText("50.00%")).toBeInTheDocument();
  });

  it("switches to Models and shows the source permaslug verbatim", () => {
    render(<MarketShareChart view={productionShaped()} />);
    fireEvent.click(screen.getByRole("button", { name: "Models" }));

    expect(screen.getByRole("button", { name: "Models" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("deepseek/deepseek-v4.1-flash-20260910")).toBeInTheDocument();
    expect(screen.getByText("openai/gpt-5.6-luna-20260709")).toBeInTheDocument();
  });

  it("never lists OpenRouter as a lab", () => {
    render(<MarketShareChart view={productionShaped()} />);
    const labs = screen.getByRole("list", { name: /by lab/i });
    expect(within(labs).queryByText("OpenRouter")).toBeNull();
    // Its volume is present, inside the unattributed row rather than as a participant.
    expect(within(labs).getByText("Unattributed models")).toBeInTheDocument();
  });

  it("keeps the two residuals as separate, differently named rows", () => {
    render(<MarketShareChart view={productionShaped()} />);
    const labs = screen.getByRole("list", { name: /by lab/i });

    // The lab-attribution residual: stealth 1,500 + openrouter 500 = 2,000 = 20 %.
    const unattributed = within(labs).getByText("Unattributed models").closest("li")!;
    expect(within(unattributed).getByText("20.00%")).toBeInTheDocument();

    // The source residual: OpenRouter's own `other` row, 1,000 = 10 %. A different row entirely.
    const residual = within(labs).getByText("Other models").closest("li")!;
    expect(within(residual).getByText("10.00%")).toBeInTheDocument();
    expect(within(residual).getByText(/OpenRouter residual/)).toBeInTheDocument();
  });

  it("states the denominator and the observed universe beside the shares", () => {
    const { container } = render(<MarketShareChart view={productionShaped()} />);

    // The date and the figure both appear, so a reader can check the percentages rather than
    // trust them. The text is split across JSX expressions, so it is asserted on the section.
    const text = container.textContent ?? "";
    expect(text).toContain("2026-09-15");
    expect(text).toMatch(/denominator \S+ observed tokens/);
    expect(text).toContain("Provisional");

    expect(screen.getByText(/rankings-daily dataset for the traffic included/)).toBeInTheDocument();
    expect(screen.getByText("Share of observed OpenRouter token volume represented in UTVI.")).toBeInTheDocument();
  });

  it("carries the source's required attribution", () => {
    render(<MarketShareChart view={productionShaped()} />);
    expect(screen.getByRole("link", { name: "OpenRouter" })).toHaveAttribute("href", "https://openrouter.ai/rankings");
    expect(screen.getByRole("link", { name: "CC BY 4.0" })).toBeInTheDocument();
    expect(screen.getByText(/as of 2026-09-16T01:00:33.578Z/)).toBeInTheDocument();
  });

  it("says so, and shows no table, when nothing is published", () => {
    render(<MarketShareChart view={null} />);
    expect(screen.getByText(/No shares are published/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Labs" })).toBeNull();
  });
});

describe("independence from the demo fixtures", () => {
  it("renders entirely from the view it is given", async () => {
    // The Market Share demo tables are gone; this asserts the component cannot fall back to
    // anything like them. The one remaining demo module must not be reachable from this file.
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync("src/components/model-economics/market-share-chart.tsx", "utf8"),
    );
    expect(source).not.toContain("@/data/mock");
  });
});
