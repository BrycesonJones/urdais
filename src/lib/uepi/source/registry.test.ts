import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { SOURCE_FIXTURES } from "@/lib/uepi/source/fixtures/manifest";
import {
  IMPLEMENTED_SERIES_IDS, UEPI_ADAPTERS, UNIMPLEMENTED_SERIES_IDS, adapterFor, isAvailable,
  unavailableReason,
} from "@/lib/uepi/source/registry";
import { UepiSourceError } from "@/lib/uepi/source/types";
import { UEPI_SERIES_IDS } from "@/lib/uepi/types";

describe("1. four markets are implemented and three are not", () => {
  it("implements exactly the markets that could be read without a credential", () => {
    expect([...IMPLEMENTED_SERIES_IDS]).toEqual(["uepi-caiso", "uepi-miso", "uepi-nyiso", "uepi-spp"]);
    expect([...UNIMPLEMENTED_SERIES_IDS]).toEqual(["uepi-ercot", "uepi-pjm", "uepi-iso-ne"]);
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

describe("2. ISO-NE cannot run, and says what would change that", () => {
  it("refuses with an authenticated-source-evidence reason", () => {
    const entry = UEPI_ADAPTERS["uepi-iso-ne"];
    expect(isAvailable(entry)).toBe(false);
    const unavailable = unavailableReason("uepi-iso-ne")!;
    expect(unavailable.reason).toBe("AUTHENTICATED_SOURCE_EVIDENCE_REQUIRED");
    expect(unavailable.unblockedBy.length).toBeGreaterThanOrEqual(3);
    expect(unavailable.unblockedBy.join(" ")).toMatch(/authenticated/i);
    expect(unavailable.unblockedBy.join(" ")).toMatch(/transition day/i);
  });

  it("throws rather than returning something that could be called", () => {
    expect(() => adapterFor("uepi-iso-ne")).toThrow(UepiSourceError);
    expect(() => adapterFor("uepi-iso-ne")).toThrow(/AUTHENTICATED_SOURCE_EVIDENCE_REQUIRED/);
  });

  it("has no fixture, because no first-party payload has ever been observed", () => {
    expect(SOURCE_FIXTURES.filter((fixture) => fixture.seriesId === "uepi-iso-ne")).toHaveLength(0);
  });

  it("has no adapter file that could be wired up by accident", async () => {
    const entries = await import("node:fs/promises").then((fs) => fs.readdir("src/lib/uepi/source/adapters"));
    expect(entries.filter((name) => name.includes("iso-ne") || name.includes("isone"))).toHaveLength(0);
  });
});

describe("3. ERCOT and PJM are credential-blocked, and the refusal records the evidence", () => {
  it("names the probe result for each", () => {
    const ercot = unavailableReason("uepi-ercot")!;
    expect(ercot.reason).toBe("SOURCE_CREDENTIAL_REQUIRED");
    expect(ercot.detail).toMatch(/HTTP 302/);
    expect(ercot.detail).toMatch(/subscription key/);
    const pjm = unavailableReason("uepi-pjm")!;
    expect(pjm.reason).toBe("SOURCE_CREDENTIAL_REQUIRED");
    expect(pjm.detail).toMatch(/HTTP 401/);
  });

  it("keeps PJM's publication block separate from its credential block", () => {
    // A key would make PJM readable and would not make it publishable. Both facts are recorded,
    // because a later reader who obtains a key must not conclude the series can be shown.
    expect(unavailableReason("uepi-pjm")!.detail).toMatch(/terms prohibit publishing/);
  });

  it("does not fall back to a third-party mirror for either market", async () => {
    const sources = await Promise.all(
      ["caiso", "miso", "nyiso", "spp"].map((name) =>
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
    ]));
  });
});
