import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AvailableCapacitySection } from "@/components/compute-analytics/available-capacity-section";
import { observation } from "@/lib/capacity/fixtures";
import { availabilityOnly, exactQuantity, quantityRange } from "@/lib/capacity/normalize";
import { buildCapacityReadModel } from "@/lib/capacity/read/load";
import { emptyCapacityReadModel, emptyCoverage } from "@/lib/capacity/read/read-model";

const NOW = new Date("2026-09-17T12:00:00.000Z");
const fresh = { retrievedAt: "2026-09-17T11:00:00.000Z", observedAt: "2026-09-17T11:00:00.000Z" };

const exact = (n: number) => {
  const result = exactQuantity(n, "accelerator");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};
const available = () => {
  const result = availabilityOnly("available");
  if (!result.ok) throw new Error(result.reason);
  return result.measurement;
};

const capability = (overrides = {}) => ({
  sourceInterfaceSlug: "test-interface",
  providerName: "Test Provider",
  maxTier: 1 as const,
  supportsExactQuantity: true,
  supportsQuantityRange: false,
  supportsAvailabilityState: true,
  supportsRegion: true,
  supportsConfiguration: true,
  quantityUnit: "accelerator" as const,
  freshnessHorizonSeconds: 86_400,
  assessment: "test",
  termsPermitted: true,
  productionApproved: true,
  termsReviewState: "permitted",
  productionAccessState: "production_approved",
  ...overrides,
});

describe("the empty state", () => {
  it("says coverage is insufficient rather than showing a figure", () => {
    render(<AvailableCapacitySection model={emptyCapacityReadModel("no_eligible_source", emptyCoverage())} />);
    expect(screen.getByRole("heading", { name: "Available Compute Capacity" })).toBeInTheDocument();
    expect(screen.getByText(/Insufficient coverage to publish a figure/)).toBeInTheDocument();
  });

  it("shows a dash rather than a zero in the capacity slot", () => {
    const { container } = render(
      <AvailableCapacitySection model={emptyCapacityReadModel("no_eligible_source", emptyCoverage())} />,
    );
    // The distinction the whole dataset turns on. A source count of 0 is an
    // honest zero — Urdais really has assessed no eligible interfaces — but a
    // capacity of 0 would claim the market has none available, so that slot
    // renders an em dash instead.
    const observedGpus = screen.getByText("Observed GPUs").parentElement;
    expect(observedGpus?.textContent).toContain("—");
    expect(container.textContent).not.toMatch(/\b0\s*GPUs?\b/i);
  });

  it("carries both mandatory disclaimers", () => {
    render(<AvailableCapacitySection model={emptyCapacityReadModel("no_eligible_source", emptyCoverage())} />);
    expect(screen.getByText(/does not itself constitute evidence of available compute capacity/)).toBeInTheDocument();
    expect(screen.getByText(/not total installed fleet capacity and not provider utilization/)).toBeInTheDocument();
  });

  it("shows the draft methodology as a draft", () => {
    render(<AvailableCapacitySection model={emptyCapacityReadModel("no_eligible_source", emptyCoverage())} />);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });
});

describe("source coverage", () => {
  it("shows what each assessed source exposes and why it contributes nothing", () => {
    const model = buildCapacityReadModel(
      [
        capability({
          sourceInterfaceSlug: "barred-source",
          providerName: "Barred Co",
          termsPermitted: false,
          termsReviewState: "not_permitted",
        }),
        capability({
          sourceInterfaceSlug: "prices-only",
          providerName: "Prices Co",
          maxTier: 4,
          supportsExactQuantity: false,
          supportsAvailabilityState: false,
          quantityUnit: null,
        }),
      ],
      [],
      NOW,
    );
    render(<AvailableCapacitySection model={model} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("Barred Co")).toBeInTheDocument();
    expect(within(table).getByText(/this use was refused/)).toBeInTheDocument();
    expect(within(table).getByText(/prices only/)).toBeInTheDocument();
    // A capable-but-barred source still shows its capability, so the reason is legible.
    expect(within(table).getByText(/Exact quantity/)).toBeInTheDocument();
  });
});

describe("the populated state", () => {
  it("shows an exact total as a single number", () => {
    const model = buildCapacityReadModel(
      [capability()],
      [
        observation(exact(120), { ...fresh, capacitySourceEntityId: "a" }),
        observation(exact(96), { ...fresh, capacitySourceEntityId: "b" }),
      ],
      NOW,
    );
    render(<AvailableCapacitySection model={model} />);
    expect(screen.getByText("216")).toBeInTheDocument();
    expect(screen.getByText("GPUs")).toBeInTheDocument();
  });

  it("keeps availability-only providers out of the number and names them separately", () => {
    const model = buildCapacityReadModel(
      [capability()],
      [
        observation(exact(742), { ...fresh, capacitySourceEntityId: "a" }),
        observation(available(), { ...fresh, capacitySourceEntityId: "b" }),
        observation(available(), { ...fresh, capacitySourceEntityId: "c", canonicalRegionCode: "DE" }),
        observation(available(), { ...fresh, capacitySourceEntityId: "d", canonicalRegionCode: "JP" }),
      ],
      NOW,
    );
    const { container } = render(<AvailableCapacitySection model={model} />);
    expect(screen.getByText("742")).toBeInTheDocument();
    expect(screen.getByText(/3 additional providers report availability without stating a quantity/)).toBeInTheDocument();
    // The number that would exist if categorical observations were summed in.
    expect(container.textContent).not.toContain("745");
  });

  it("renders a range total as bounds rather than a midpoint", () => {
    const ranged = quantityRange(50, 100, "accelerator");
    if (!ranged.ok) throw new Error(ranged.reason);
    const model = buildCapacityReadModel(
      [capability()],
      [observation(ranged.measurement, { ...fresh, capacitySourceEntityId: "a" })],
      NOW,
    );
    const { container } = render(<AvailableCapacitySection model={model} />);
    expect(screen.getByText("50–100")).toBeInTheDocument();
    expect(container.textContent).not.toContain("75 GPUs");
  });
});

describe("no demo fallback", () => {
  it("renders nothing resembling the removed fleet-utilization demo", () => {
    const { container } = render(
      <AvailableCapacitySection model={emptyCapacityReadModel("no_eligible_source", emptyCoverage())} />,
    );
    const text = container.textContent ?? "";
    // "utilization" survives only inside the disclaimer that disclaims it.
    for (const match of text.matchAll(/utilization/gi)) {
      const context = text.slice(Math.max(0, match.index - 40), match.index);
      expect(context).toMatch(/not /i);
    }
    // No percentage readout, which is the shape the removed chart had.
    expect(text).not.toMatch(/\d+%/);
    expect(text).not.toMatch(/demo/i);
    // The demo fleet sizes that used to appear on this page.
    expect(text).not.toMatch(/380,000|260,000|120,000/);
  });
});
