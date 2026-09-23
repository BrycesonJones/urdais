import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { UbwiSection } from "@/components/ubwi/ubwi-section";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { findMarket } from "@/data/mock/market-detail";
import { UrdaisIndices } from "@/components/market/urdais-indices";
import { PUBLIC_MARKET_CATALOG } from "@/data/market-catalog";
import { UBWI_EXPLANATION, UBWI_VALUE_FRACTION_DIGITS, ubwiIndexSnapshot, ubwiSurface } from "./surface";
import { assembleIndexRail } from "@/lib/market/index-rail";
import { UMPI_WATCHLIST_ROW } from "@/lib/umpi/read/watchlist";

const NOW = "2026-09-15T03:10:39Z";
const surface = ubwiSurface({ now: NOW });

describe("the UBWI public surface", () => {
  it("shows no value before a point is frozen, and does not claim the gate refused", () => {
    // Phase 2E's surface withheld on one gate finding. Methodology 1.2.0 removes it, so
    // with no publication passed the surface is silent for a different reason: the history
    // has not started. Saying "the gate refuses" here would be a fabricated explanation,
    // which is the specific failure this test exists to catch.
    expect(surface.status).toBe("withheld");
    if (surface.status !== "withheld") throw new Error("unreachable");
    expect(surface.gateFailures).toEqual([]);
    expect(surface.reason).toContain("history begins at the first frozen production point");
    expect(surface.reason).not.toContain("gate refuses");
  });

  it("names the protocol derivation as the supply basis, and never a supply vendor", () => {
    expect(surface.supplyProvenance).not.toBeNull();
    expect(surface.supplyProvenance!.basis).toBe("Protocol-derived scheduled issuance");
    expect(surface.supplyProvenance!.referenceBlockHeight).toBe(surface.blockHeight);
    expect(surface.supplyProvenance!.halvingEra).toBe(4);
    expect(surface.supplyProvenance!.blockSubsidyBtc).toBe(3.125);
    expect(surface.supplyProvenance!.caveat).toContain("Transaction fees are excluded");
    expect(surface.supplyProvenance!.caveat).toContain("no lost-coin");
  });

  it("names no retired supply vendor anywhere on the rendered surface", () => {
    const { container } = render(<UbwiSection surface={surface} />);
    const text = container.textContent ?? "";
    for (const forbidden of ["blockchain.info", "Blockchain.com", "Coinbase", "Kraken", "Bitstamp"]) {
      expect(text, `${forbidden} must not appear on the public surface`).not.toContain(forbidden);
    }
    expect(text).toContain("Protocol-derived scheduled issuance");
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

  it("serves the frozen value, with no change and no history, once a point is published", () => {
    // The state the first production print puts the surface into. Everything asserted here
    // is what a reader actually sees on /markets/ubwi with a frozen point behind it.
    const published = ubwiSurface({
      now: NOW,
      publication: {
        publishedAt: "2026-09-15T04:33:47.738Z",
        valuePercent: 0.26716309468662236,
        changePercent: null,
      },
    });
    expect(published.status).toBe("published");
    if (published.status !== "published") throw new Error("unreachable");
    expect(published.valuePercent).toBe(0.26716309468662236);
    expect(published.methodologyVersion).toBe("1.2.0");
    // The first point has no predecessor. Null, never zero: zero would assert that the
    // value did not move, which is a different claim and a false one.
    expect(published.changePercent).toBeNull();
    expect(published.changeWithheldReason).toContain("until a second production observation");
    expect(published.supplyProvenance!.basis).toBe("Protocol-derived scheduled issuance");
  });

  it("renders the published value without inventing a change or a series", () => {
    const published = ubwiSurface({
      now: NOW,
      publication: {
        publishedAt: "2026-09-15T04:33:47.738Z",
        valuePercent: 0.26716309468662236,
        changePercent: null,
      },
    });
    const { container } = render(<UbwiSection surface={published} />);
    const text = container.textContent ?? "";
    expect(text).toContain("0.2672");
    // No fabricated movement, no points series, no back history.
    expect(text).not.toMatch(/[+\-]\d+\.\d+\s*%\s*(today|change)/i);
    expect(text).not.toContain("pts");
    expect(text).not.toContain("Demo");
    for (const forbidden of ["blockchain.info", "Blockchain.com", "Coinbase", "Kraken", "Bitstamp"]) {
      expect(text, `${forbidden} must not appear`).not.toContain(forbidden);
    }
  });

  it("keeps UBWI out of the demo dataset even though it now has a watchlist row", () => {
    // The row exists, but it is built from the frozen production publication. UBWI must
    // never acquire a mock value: that is the whole reason it was pulled from this file.
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
    const amendment = read("20260915000500_ubwi_protocol_scheduled_supply.sql");
    expect(amendment).toContain(docHash);
    const specHash = createHash("sha256").update(`UBWI-1.2.0:${docHash}`).digest("hex");
    expect(amendment).toContain(specHash);
  });

  it("leaves every superseded version pinned to the document it was recorded from", () => {
    // 1.0.0's and 1.1.0's hashes are deliberately no longer the file's. A methodology
    // version pins the document at the commit it was recorded from, and rewriting them to
    // match a later edit would destroy exactly the history the versions exist to keep.
    const seed = read("20260915000200_ubwi_production_v1_seed.sql");
    expect(seed).toContain("612613bc0e93bdbde4b897d52db354b9696b0aaf193a585d673e6e696532dda8");
    expect(seed).not.toContain(docHash);

    const chainlink = read("20260915000400_ubwi_chainlink_and_taiwan.sql");
    expect(chainlink).toContain("adceaefd0de3ec17239f7fd8a55c64c5106d081fc2aaf2fa9da7dc0f7e1b78e6");
    expect(chainlink).not.toContain(docHash);
  });

  it("keeps the superseded hashes asserted in the migration that supersedes them", () => {
    // The 1.2.0 migration re-asserts 1.0.0's and 1.1.0's hashes as invariants, so a later
    // edit that quietly rewrote a superseded row would fail the migration rather than pass
    // silently.
    const amendment = read("20260915000500_ubwi_protocol_scheduled_supply.sql");
    expect(amendment).toContain("612613bc0e93bdbde4b897d52db354b9696b0aaf193a585d673e6e696532dda8");
    expect(amendment).toContain("adceaefd0de3ec17239f7fd8a55c64c5106d081fc2aaf2fa9da7dc0f7e1b78e6");
  });
});

const PUBLICATION = {
  publishedAt: "2026-09-15T04:33:47.738Z",
  valuePercent: 0.26716309468662236,
  changePercent: null,
};

/** The homepage joins the mock rows, UMPI's row and UBWI's, exactly as the page does. */
function homepageRows() {
  const row = ubwiIndexSnapshot(PUBLICATION);
  const base = [...INDEX_SNAPSHOTS, UMPI_WATCHLIST_ROW];
  return assembleIndexRail(row === null ? base : [...base, row]);
}

describe("the UBWI homepage watchlist row", () => {
  it("is built from the frozen production publication, not from the demo dataset", () => {
    const row = ubwiIndexSnapshot(PUBLICATION)!;
    expect(row.symbol).toBe("UBWI");
    expect(row.name).toBe("Urdais Bitcoin Wealth Index");
    expect(row.unit).toBe("%");
    expect(row.value).toBe(PUBLICATION.valuePercent);
    // The old demo series was a points level. Nothing resembling it may come back.
    expect(row.unit).not.toBe("pts");
    expect(row.value).not.toBe(1342.57);
    expect(row.asOf).toBe(Math.floor(Date.parse(PUBLICATION.publishedAt) / 1000));
  });

  it("withholds change until a second production observation exists", () => {
    expect(ubwiIndexSnapshot(PUBLICATION)!.changePercent).toBeNull();
  });

  it("carries enough precision to distinguish values inside UBWI's range", () => {
    // Two decimals would render 0.2672 and 0.2918 both as 0.27 and 0.29 respectively,
    // collapsing most of the defensible band. Four keeps the published value legible.
    expect(ubwiIndexSnapshot(PUBLICATION)!.valueFractionDigits).toBe(UBWI_VALUE_FRACTION_DIGITS);
    expect(UBWI_VALUE_FRACTION_DIGITS).toBeGreaterThanOrEqual(4);
  });

  it("produces no row at all when nothing is published, rather than a placeholder", () => {
    // A failed read and an unpublished index are both null here, and both must yield
    // silence: no fabricated 0.2672, no fallback to the deleted demo series.
    expect(ubwiIndexSnapshot(null)).toBeNull();
    expect(homepageRowsWithout().find((row) => row.symbol === "UBWI")).toBeUndefined();
  });

  it("renders the real value, links to the detail page, and shows no movement line", () => {
    render(<UrdaisIndices indices={homepageRows()} />);
    const link = screen.getByRole("link", { name: /UBWI/ });
    expect(link).toHaveAttribute("href", "/markets/ubwi");
    // Scoped to the UBWI row: this test is about UBWI's row alone. The mock rows beside
    // it now quote neither a level nor a movement, and say "Demo data" instead.
    const row = link.textContent ?? "";
    expect(row).toContain("0.2672");
    expect(row).toContain("%");
    expect(row).not.toContain("Demo");
    expect(row).not.toContain("pts");
    expect(row).not.toMatch(/[+\u2212-]\d+\.\d+\s*%/);
  });

  it("appears in market-catalog order, after the other indices, and changes none of them", () => {
    // The *public* catalog, not the full registry: the rail's order and its membership are the
    // same list, so an index Urdais does not present as a product is neither ordered nor
    // included here, and ordering is checked against what a reader is actually shown.
    // UCPI owns the panel beside the rail rather than a row in it, and UTVI's row is built from
    // a production read this test does not perform, so neither is expected here.
    const expected = PUBLIC_MARKET_CATALOG.map((market) => market.symbol).filter(
      (symbol) => symbol !== "UCPI" && symbol !== "UTVI",
    );
    expect(homepageRows().map((row) => row.symbol)).toEqual(expected);
    // The mock rows keep their existing values untouched by this wiring, and none of UGAI, UAVI
    // or UMPI is among them: each joins the rail from its own module, carrying no number. UPPI
    // and UACI are still built here and still dropped by the rail, which is the withholding
    // mechanism working rather than an empty source.
    expect(INDEX_SNAPSHOTS.map((row) => row.symbol)).toEqual(["UPPI", "UEPI", "UACI"]);
    for (const withheld of ["UPPI", "UACI"]) {
      expect(homepageRows().map((row) => row.symbol), withheld).not.toContain(withheld);
    }
  });
});

function homepageRowsWithout() {
  const row = ubwiIndexSnapshot(null);
  const base = [...INDEX_SNAPSHOTS, UMPI_WATCHLIST_ROW];
  return assembleIndexRail(row === null ? base : [...base, row]);
}
