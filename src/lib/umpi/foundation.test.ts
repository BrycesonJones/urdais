import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MARKETS } from "@/data/mock/market-detail";
import { productionIdentityFor, identityKey } from "./identity";
import { UMPI_CADENCE, UMPI_CHANGE_LABEL, UMPI_PUBLISHED_UNIT, UMPI_SERIES, UMPI_SERIES_CODES, UMPI_EXPORT_UV_MIX_WARNING } from "./types";

const migration = () =>
  readFileSync(path.join(process.cwd(), "supabase", "migrations", "20261008100000_umpi_foundation.sql"), "utf8");

describe("canonical series definitions", () => {
  it("are the two V1 series, in index points, monthly, with a MoM change", () => {
    expect(UMPI_SERIES_CODES).toEqual(["UMPI-KR-DRAM-PPI", "UMPI-KR-DRAM-EXPORT-UV"]);
    expect(UMPI_PUBLISHED_UNIT).toBe("index_points");
    expect(UMPI_CADENCE).toBe("monthly");
    expect(UMPI_CHANGE_LABEL).toBe("MoM");
  });

  it("keep the price index and the unit-value index apart", () => {
    const ppi = UMPI_SERIES["UMPI-KR-DRAM-PPI"];
    const uv = UMPI_SERIES["UMPI-KR-DRAM-EXPORT-UV"];

    expect(ppi.seriesKind).toBe("official_price_index");
    expect(ppi.levelIsUrdaisDerived).toBe(false);
    expect(ppi.baseOwner).toBe("source_agency");
    // A price index is quality-adjusted by the agency. A mix warning on it would be false.
    expect(ppi.mixWarningRequired).toBe(false);

    expect(uv.seriesKind).toBe("derived_unit_value_index");
    expect(uv.levelIsUrdaisDerived).toBe(true);
    expect(uv.baseOwner).toBe("urdais");
    expect(uv.mixWarningRequired).toBe(true);
    expect(UMPI_EXPORT_UV_MIX_WARNING).toMatch(/not a pure price index/);
  });

  it("carry the attribution each agency's terms require", () => {
    expect(UMPI_SERIES["UMPI-KR-DRAM-PPI"].attributionText).toContain("Bank of Korea");
    expect(UMPI_SERIES["UMPI-KR-DRAM-EXPORT-UV"].attributionText).toContain("Korea Customs Service");
    expect(UMPI_SERIES["UMPI-KR-DRAM-EXPORT-UV"].attributionText).toContain("8542321010");
  });
});

describe("the TypeScript constants and the migration agree", () => {
  it("register the same two series codes", () => {
    const sql = migration();
    for (const code of UMPI_SERIES_CODES) expect(sql).toContain(`'${code}'`);
  });

  it("register the same source identities, and only those", () => {
    const sql = migration();
    expect(identityKey(productionIdentityFor("UMPI-KR-DRAM-PPI"))).toBe("bok:404Y016/30911201AA/M");
    expect(sql).toContain("'404Y016', '30911201AA', 'M'");
    // Phase 3's migration registered 15100475; Phase 4's migration corrected the binding to the
    // aggregate-by-item dataset. The TypeScript identity follows the correction.
    expect(identityKey(productionIdentityFor("UMPI-KR-DRAM-EXPORT-UV"))).toBe("kcs:8542321010/15101609");
    expect(sql).toContain("'8542321010', '15100475'");
    const correction = readFileSync(
      path.join(process.cwd(), "supabase", "migrations", "20261009100000_umpi_customs_aggregate_source.sql"),
      "utf8",
    );
    expect(correction).toContain("'15101609'");
    expect(correction).toContain("country-dimension");
  });

  it("registers the methodology as a draft and initializes no series", () => {
    const sql = migration();
    expect(sql).toContain("'0.1.0-draft', 'draft'");
    expect(sql).toContain("publication_state, attribution_text");
    // Every series row in the migration is seeded not_initialized.
    expect(sql).toMatch(/'not_initialized'/);
    expect(sql).not.toMatch(/insert into pipeline\.umpi_observations/);
    expect(sql).not.toMatch(/insert into pipeline\.umpi_publications/);
    expect(sql).not.toMatch(/insert into pipeline\.umpi_index_bases/);
  });

  it("refuses the deferred export price index in the schema, not only in code", () => {
    expect(migration()).toContain("umpi_source_series_no_export_price_index");
  });

  it("stores no credential: only environment variable names appear", () => {
    const sql = migration();
    expect(sql).toContain("UMPI_ECOS_API_KEY");
    expect(sql).toContain("UMPI_DATA_GO_KR_SERVICE_KEY");
    // A name, never a value.
    expect(sql).not.toMatch(/serviceKey=[A-Za-z0-9%]{10,}/);
    expect(sql).not.toMatch(/api_key'\s*,\s*'[A-Za-z0-9]{16,}'/);
  });
});

describe("the demo surface and the production foundation are separate", () => {
  const memory = MARKETS.find((market) => market.symbol === "UMPI");

  it("the demo market still exists and is still demo data", () => {
    // Phase 3 does not touch the frontend. The demo surface is left exactly as it was.
    expect(memory).toBeDefined();
    const units = new Set(memory!.families?.flatMap((f) => f.instruments.map((i) => i.unit)) ?? []);
    expect(units.has("$/part")).toBe(true);
  });

  it("shares no identifier with the canonical series, so a demo point cannot be read as production", () => {
    const demoIds = new Set(memory!.families?.flatMap((f) => f.instruments.map((i) => i.id)) ?? []);
    for (const code of UMPI_SERIES_CODES) {
      expect(demoIds.has(code)).toBe(false);
    }
    // And no canonical series carries the demo unit.
    for (const code of UMPI_SERIES_CODES) {
      expect(UMPI_PUBLISHED_UNIT).not.toBe("$/part");
      expect(UMPI_SERIES[code].baseLabel).not.toContain("$");
    }
  });

  it("the production library does not import the demo data", () => {
    // The only file under src/lib/umpi that may mention the mock is this test.
    const dir = path.join(process.cwd(), "src", "lib", "umpi");
    const walk = (rel: string): string[] =>
      readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(path.join(rel, entry.name)) : [path.join(rel, entry.name)],
      );
    for (const file of walk(".")) {
      // Two tests import the demo data deliberately, to assert it cannot reach production.
      if (file.endsWith("foundation.test.ts") || file.endsWith("read/read-model.test.ts")) continue;
      const source = readFileSync(path.join(dir, file), "utf8");
      expect(source, file).not.toContain("data/mock");
    }
  });
});
