import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { SOURCE_FIXTURES } from "@/lib/uepi/source/fixtures/manifest";
import { PUBLISHABLE_SERIES_IDS, benchmarkFor } from "@/lib/uepi/benchmarks";
import {
  IMPLEMENTED_SERIES_IDS, UEPI_ADAPTERS, UNIMPLEMENTED_SERIES_IDS, adapterFor, isAvailable,
  unavailableReason,
} from "@/lib/uepi/source/registry";
import { UepiSourceError } from "@/lib/uepi/source/types";
import { UEPI_SERIES_IDS } from "@/lib/uepi/types";

describe("1. six markets are implemented and one is not", () => {
  it("implements every market whose source Urdais can actually read", () => {
    expect([...IMPLEMENTED_SERIES_IDS])
      .toEqual(["uepi-ercot", "uepi-caiso", "uepi-miso", "uepi-iso-ne", "uepi-nyiso", "uepi-spp"]);
    expect([...UNIMPLEMENTED_SERIES_IDS]).toEqual(["uepi-pjm"]);
    expect(IMPLEMENTED_SERIES_IDS.length + UNIMPLEMENTED_SERIES_IDS.length).toBe(UEPI_SERIES_IDS.length);
  });

  it("gives every implemented adapter a source interface and a retrieval purpose", () => {
    for (const seriesId of IMPLEMENTED_SERIES_IDS) {
      const adapter = adapterFor(seriesId);
      expect(adapter.sourceInterfaceSlug, seriesId).toMatch(/^[a-z0-9-]+$/);
      expect(["production", "research"], seriesId).toContain(adapter.retrievalPurpose);
    }
  });

  it("records every retrieval as research, because no source interface is production-approved", () => {
    // Not a rights judgement. The schema refuses a production retrieval from an interface whose
    // terms axes are not both `permitted`, and an ambiguous source cannot reach that state
    // without a legal answer. Publication is decided separately, at read time.
    for (const seriesId of IMPLEMENTED_SERIES_IDS) {
      expect(adapterFor(seriesId).retrievalPurpose, seriesId).toBe("research");
    }
  });
});

describe("2. the two recovered markets are now readable", () => {
  it("returns a working adapter for ERCOT and ISO-NE", () => {
    for (const seriesId of ["uepi-ercot", "uepi-iso-ne"] as const) {
      const entry = UEPI_ADAPTERS[seriesId];
      expect(isAvailable(entry), seriesId).toBe(true);
      expect(unavailableReason(seriesId), seriesId).toBeNull();
      expect(adapterFor(seriesId).seriesId, seriesId).toBe(seriesId);
    }
  });

  it("presents credentials for exactly the two authenticated sources", () => {
    for (const seriesId of ["uepi-ercot", "uepi-iso-ne"] as const) {
      expect(adapterFor(seriesId).authorization, seriesId).toBeDefined();
    }
    for (const seriesId of ["uepi-caiso", "uepi-miso", "uepi-nyiso", "uepi-spp"] as const) {
      expect(adapterFor(seriesId).authorization, seriesId).toBeUndefined();
    }
  });

  it("does not make ISO-NE publishable merely because its source can be read", () => {
    // Evidence of a readable source is not a right to publish. ISO-NE moved from `not_built` to
    // `internal_only`, which the publication gate refuses exactly as it refuses PJM, MISO and SPP.
    expect(benchmarkFor("uepi-iso-ne").publicationPosture).toBe("internal_only");
    expect(benchmarkFor("uepi-iso-ne").expectedRightsClassification).toBe("ambiguous_requires_legal_review");
    expect([...PUBLISHABLE_SERIES_IDS]).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
  });
});

describe("3. PJM is still blocked, on two independent grounds", () => {
  it("names the probe result and the membership condition", () => {
    const pjm = unavailableReason("uepi-pjm")!;
    expect(pjm.reason).toBe("SOURCE_CREDENTIAL_REQUIRED");
    expect(pjm.detail).toMatch(/HTTP 401/);
  });

  it("throws rather than returning something that could be called", () => {
    expect(() => adapterFor("uepi-pjm")).toThrow(UepiSourceError);
    expect(() => adapterFor("uepi-pjm")).toThrow(/SOURCE_CREDENTIAL_REQUIRED/);
  });

  it("has no fixture and no adapter file", async () => {
    expect(SOURCE_FIXTURES.filter((fixture) => fixture.seriesId === "uepi-pjm")).toHaveLength(0);
    const entries = await import("node:fs/promises").then((fs) => fs.readdir("src/lib/uepi/source/adapters"));
    expect(entries.filter((name) => name.startsWith("pjm"))).toHaveLength(0);
  });

  it("keeps PJM's publication block separate from its credential block", () => {
    // A key would make PJM readable and would not make it publishable. Both facts are recorded,
    // because a later reader who obtains a key must not conclude the series can be shown.
    expect(unavailableReason("uepi-pjm")!.detail).toMatch(/terms prohibit publishing/);
  });

  it("does not fall back to a third-party mirror for any market", async () => {
    const sources = await Promise.all(
      ["caiso", "ercot", "isone", "miso", "nyiso", "spp"].map((name) =>
        readFile(`src/lib/uepi/source/adapters/${name}.ts`, "utf8")));
    const forbidden = /gridstatus|eia\.gov|kaggle|yahoo|quandl|barchart/i;
    for (const source of sources) expect(source).not.toMatch(forbidden);
  });
});

describe("4. every implemented market is pinned to a real dated artifact", () => {
  it("has at least one fixture per implemented adapter", () => {
    for (const seriesId of IMPLEMENTED_SERIES_IDS) {
      expect(SOURCE_FIXTURES.filter((fixture) => fixture.seriesId === seriesId).length, seriesId)
        .toBeGreaterThanOrEqual(1);
    }
  });

  it("has transition-day evidence for every implemented market", () => {
    // Not generic arithmetic: a file from the operator, on the day the clocks changed.
    for (const seriesId of IMPLEMENTED_SERIES_IDS) {
      const dates = SOURCE_FIXTURES.filter((fixture) => fixture.seriesId === seriesId)
        .map((fixture) => fixture.operatingDate);
      expect(dates, seriesId).toContain("2026-03-08");
      expect(dates.some((date) => date === "2025-11-02"), `${seriesId} fall-back fixture`).toBe(true);
    }
  });

  it("fetches every market over HTTP from the operator's own host", () => {
    const hosts = SOURCE_FIXTURES.map((fixture) => new URL(fixture.url).hostname);
    expect(new Set(hosts)).toEqual(new Set([
      "oasis.caiso.com", "mis.nyiso.com", "docs.misoenergy.org", "portal.spp.org",
      "api.ercot.com", "webservices.iso-ne.com",
    ]));
  });
});
