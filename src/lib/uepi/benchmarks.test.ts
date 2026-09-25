import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  INTERNAL_ONLY_SERIES_IDS, NOT_BUILT_SERIES_IDS, PUBLISHABLE_SERIES_IDS,
  UEPI_BENCHMARKS, UEPI_BENCHMARK_LIST, benchmarkFor,
} from "@/lib/uepi/benchmarks";
import { UEPI_SERIES_IDS, UepiDomainError, isUepiSeriesId } from "@/lib/uepi/types";

const MIGRATION = "supabase/migrations/20261021100000_uepi_foundation.sql";

describe("1. the identifiers are stable and boring", () => {
  it("is exactly the seven organized U.S. markets", () => {
    expect([...UEPI_SERIES_IDS]).toEqual([
      "uepi-ercot", "uepi-pjm", "uepi-caiso", "uepi-miso", "uepi-iso-ne", "uepi-nyiso", "uepi-spp",
    ]);
  });

  it("uses one identifier per market, in every layer", async () => {
    const migration = await readFile(MIGRATION, "utf8");
    for (const seriesId of UEPI_SERIES_IDS) {
      expect(migration, seriesId).toContain(`'${seriesId}'`);
      expect(UEPI_BENCHMARKS[seriesId].seriesId).toBe(seriesId);
    }
  });

  it("recognises its own ids and nothing else", () => {
    expect(isUepiSeriesId("uepi-ercot")).toBe(true);
    expect(isUepiSeriesId("power-ercot")).toBe(false);
    expect(isUepiSeriesId("uepi-us")).toBe(false);
    expect(() => benchmarkFor("uepi-us")).toThrow(UepiDomainError);
  });

  it("does not couple the public series id to a vendor identifier", () => {
    // The source's own locator is a column on the benchmark, never part of the id.
    expect(UEPI_BENCHMARKS["uepi-ercot"].sourceLocator).toBe("HB_HUBAVG");
    expect(UEPI_BENCHMARKS["uepi-pjm"].sourceLocator).toBe("1");
    // The id is the market, spelled the same way every time. SPP's BAA code happens to be "SPP"
    // as well, which is a coincidence and not a coupling: change the locator and the id stays.
    for (const benchmark of UEPI_BENCHMARK_LIST) {
      expect(benchmark.seriesId, benchmark.market)
        .toBe(`uepi-${benchmark.market.toLowerCase()}`);
    }
  });
});

describe("2. the two constructs stay two constructs", () => {
  it("keeps the delivered-price markets separate from the system-energy markets", () => {
    const delivered = UEPI_BENCHMARK_LIST.filter((b) => b.construct === "delivered_price").map((b) => b.seriesId);
    const energy = UEPI_BENCHMARK_LIST.filter((b) => b.construct === "system_energy_component").map((b) => b.seriesId);
    expect(delivered).toEqual(["uepi-ercot", "uepi-pjm", "uepi-iso-ne"]);
    expect(energy).toEqual(["uepi-caiso", "uepi-miso", "uepi-nyiso", "uepi-spp"]);
  });

  it("says what a system-energy series leaves out, so a surface can print it", () => {
    for (const benchmark of UEPI_BENCHMARK_LIST) {
      if (benchmark.construct !== "system_energy_component") continue;
      expect(benchmark.excludes.length, benchmark.seriesId).toBeGreaterThan(0);
    }
    expect(UEPI_BENCHMARKS["uepi-caiso"].excludes).toContain("the marginal greenhouse-gas component (MGHG)");
  });

  it("pairs a derived series with the expression that derives it, and a published one with none", () => {
    for (const benchmark of UEPI_BENCHMARK_LIST) {
      expect(benchmark.derivationExpression !== null, benchmark.seriesId)
        .toBe(benchmark.derivation === "derived_residual");
    }
    expect(UEPI_BENCHMARKS["uepi-miso"].derivationExpression).toBe("LMP - MCC - MLC");
    expect(UEPI_BENCHMARKS["uepi-nyiso"].derivationExpression)
      .toBe("LBMP - Marginal Cost Losses + Marginal Cost Congestion");
  });
});

describe("3. the postures are the release of UEPI V1", () => {
  it("publishes three markets, stores three, and builds none for ISO-NE", () => {
    expect([...PUBLISHABLE_SERIES_IDS]).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
    expect([...INTERNAL_ONLY_SERIES_IDS]).toEqual(["uepi-pjm", "uepi-miso", "uepi-spp"]);
    expect([...NOT_BUILT_SERIES_IDS]).toEqual(["uepi-iso-ne"]);
  });

  it("keeps every market whose terms forbid a derived publication out of the publishable set", () => {
    for (const benchmark of UEPI_BENCHMARK_LIST) {
      if (benchmark.expectedRightsClassification !== "unsuitable_without_permission") continue;
      expect(benchmark.publicationPosture, benchmark.seriesId).toBe("internal_only");
    }
  });

  it("leaves an unresolved hour convention only on a series nobody may build", () => {
    for (const benchmark of UEPI_BENCHMARK_LIST) {
      if (benchmark.hourConvention !== "unresolved") continue;
      expect(benchmark.publicationPosture, benchmark.seriesId).toBe("not_built");
    }
    expect(UEPI_BENCHMARKS["uepi-iso-ne"].dstEvidence).toBe("unresolved");
  });
});

describe("4. the mirror agrees with the registry the database holds", () => {
  it("registers every benchmark's construct, locator, timezone and posture identically", async () => {
    const migration = await readFile(MIGRATION, "utf8");
    for (const benchmark of UEPI_BENCHMARK_LIST) {
      const row = migration
        .split("\n")
        .findIndex((line) => line.includes(`'${benchmark.seriesId}'`));
      expect(row, `${benchmark.seriesId} is missing from the migration`).toBeGreaterThan(-1);
      const block = migration.split(`'${benchmark.seriesId}'`)[1]!.slice(0, 900);
      expect(block, benchmark.seriesId).toContain(`'${benchmark.construct}'`);
      expect(block, benchmark.seriesId).toContain(`'${benchmark.sourceLocator}'`);
      expect(block, benchmark.seriesId).toContain(`'${benchmark.operatingTimezone}'`);
      expect(block, benchmark.seriesId).toContain(`'${benchmark.publicationPosture}'`);
      expect(block, benchmark.seriesId).toContain(`'${benchmark.dstEvidence}'`);
      expect(block, benchmark.seriesId).toContain(`'${benchmark.sourceInterfaceSlug}'`);
    }
  });

  it("only MISO is exempt from daylight saving, in both places", async () => {
    const migration = await readFile(MIGRATION, "utf8");
    const exempt = UEPI_BENCHMARK_LIST.filter((b) => !b.observesDst).map((b) => b.seriesId);
    expect(exempt).toEqual(["uepi-miso"]);
    expect(migration).toContain("'Etc/GMT+5', false");
  });
});
