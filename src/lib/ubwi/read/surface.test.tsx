import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { UbwiSection } from "@/components/ubwi/ubwi-section";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { findMarket } from "@/data/mock/market-detail";
import { UBWI_EXPLANATION, ubwiSurface } from "./surface";

const NOW = "2026-09-15T03:10:39Z";
const surface = ubwiSurface({ now: NOW });

describe("the UBWI public surface", () => {
  it("withholds the value while the publication gate refuses", () => {
    expect(surface.status).toBe("withheld");
    if (surface.status !== "withheld") throw new Error("unreachable");
    // Phase 2E cleared the imputed-share ceiling with Taiwan. The remaining refusal is
    // the BTC supply source's own terms, and the surface quotes the gate's code rather
    // than inventing its own explanation for why there is no number.
    expect(surface.gateFailures).toEqual(["NUMERATOR_SOURCE_NOT_RIGHTS_CLEARED"]);
    expect(surface.reason).toContain("withholds the value rather than relaxing the gate");
  });

  it("shows observed and modelled shares, and never calls modelled wealth observed", () => {
    render(<UbwiSection surface={surface} />);
    expect(screen.getByText("Directly observed")).toBeInTheDocument();
    expect(screen.getByText("Modelled")).toBeInTheDocument();
    expect(
      screen.getByText(/Modelled wealth, not observed wealth/),
    ).toBeInTheDocument();
  });

  it("shows Total Global Wealth, the Bitcoin market capitalization and the range", () => {
    render(<UbwiSection surface={surface} />);
    expect(screen.getByText("Total Global Wealth")).toBeInTheDocument();
    expect(screen.getByText("Bitcoin market capitalization")).toBeInTheDocument();
    expect(screen.getByText("Sensitivity range")).toBeInTheDocument();
    expect(screen.getByText(/Not a confidence interval/)).toBeInTheDocument();
  });

  it("names China among the large economies it does not observe", () => {
    render(<UbwiSection surface={surface} />);
    expect(screen.getByText("China")).toBeInTheDocument();
    expect(screen.getByText("Large economies not directly observed")).toBeInTheDocument();
  });

  it("carries the explanatory line and a methodology link", () => {
    render(<UbwiSection surface={surface} />);
    expect(screen.getByText(UBWI_EXPLANATION)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Methodology, sources and publication gate/ }),
    ).toHaveAttribute("href", "/docs/methodology/ubwi");
  });

  it("shows no value, no points and no history", () => {
    const { container } = render(<UbwiSection surface={surface} />);
    const text = container.textContent ?? "";
    expect(text).not.toContain("pts");
    expect(text).not.toContain("points");
    // No published value means no headline number and no percentage change.
    expect(text).not.toMatch(/Updated /);
  });

  it("gives the shares that add up to the whole", () => {
    const total =
      surface.observedSharePercent +
      surface.modeledSharePercent +
      (surface.bitcoinMarketCapUsd / surface.totalGlobalWealthUsd) * 100;
    expect(total).toBeCloseTo(100, 8);
    // The disclosure the product decision named: roughly 62/38 observed vs modelled.
    expect(surface.observedSharePercent).toBeGreaterThan(55);
    expect(surface.modeledSharePercent).toBeGreaterThan(35);
  });

  it("keeps UBWI off the watchlist and out of the demo dataset", () => {
    expect(INDEX_SNAPSHOTS.find((row) => row.symbol === "UBWI")).toBeUndefined();
    const ubwi = findMarket("ubwi")!;
    expect(ubwi.families.flatMap((family) => family.instruments)).toHaveLength(0);
  });
});

describe("the seeded methodology hash matches the document", () => {
  const doc = readFileSync(path.join(process.cwd(), "docs", "methodology", "ubwi.md"));
  const docHash = createHash("sha256").update(doc).digest("hex");
  const read = (file: string) =>
    readFileSync(path.join(process.cwd(), "supabase", "migrations", file), "utf8");

  it("pins the current version to the current document", () => {
    const amendment = read("20260915000400_ubwi_chainlink_and_taiwan.sql");
    expect(amendment).toContain(docHash);
    const specHash = createHash("sha256").update(`UBWI-1.1.0:${docHash}`).digest("hex");
    expect(amendment).toContain(specHash);
  });

  it("leaves the superseded version pinned to the document it was recorded from", () => {
    // 1.0.0's hash is deliberately no longer the file's. A methodology version pins the
    // document at the commit it was recorded from, and rewriting it to match a later
    // edit would destroy exactly the history the version exists to keep.
    const seed = read("20260915000200_ubwi_production_v1_seed.sql");
    expect(seed).toContain("612613bc0e93bdbde4b897d52db354b9696b0aaf193a585d673e6e696532dda8");
    expect(seed).not.toContain(docHash);
  });
});
