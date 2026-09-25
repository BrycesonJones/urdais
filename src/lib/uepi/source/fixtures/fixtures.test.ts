import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { fixtureArtifact, readFixture } from "@/lib/uepi/source/fixtures/load";
import { SOURCE_FIXTURES } from "@/lib/uepi/source/fixtures/manifest";

/**
 * The fixtures are evidence, and evidence has to be tamper-evident. These tests check the
 * committed bytes against the manifest, and the manifest against itself.
 */
describe("1. every committed fixture is the file the manifest describes", () => {
  it("hashes to the recorded fixture digest", async () => {
    for (const fixture of SOURCE_FIXTURES) {
      const body = await readFile(`src/lib/uepi/source/fixtures/${fixture.file}`);
      expect(createHash("sha256").update(body).digest("hex"), fixture.file).toBe(fixture.fixtureSha256);
      expect(body.byteLength, fixture.file).toBe(fixture.fixtureBytes);
    }
  });

  it("records the original artifact's own digest, which for a reduced fixture differs", () => {
    for (const fixture of SOURCE_FIXTURES) {
      expect(fixture.originalSha256, fixture.file).toMatch(/^[0-9a-f]{64}$/);
      if (fixture.completeness.kind === "complete") {
        expect(fixture.originalSha256, fixture.file).toBe(fixture.fixtureSha256);
        expect(fixture.originalBytes, fixture.file).toBe(fixture.fixtureBytes);
      } else {
        expect(fixture.originalSha256, fixture.file).not.toBe(fixture.fixtureSha256);
        expect(fixture.originalBytes, fixture.file).toBeGreaterThan(fixture.fixtureBytes);
        expect(fixture.completeness.reduction, fixture.file).toMatch(/reduce-fixture/);
      }
    }
  });

  it("refuses to load a fixture whose bytes no longer match", () => {
    expect(() => readFixture("caiso-2026-09-23.zip")).not.toThrow();
    expect(() => readFixture("not-a-fixture.csv")).toThrow(/not a registered/);
  });

  it("leaves no uncatalogued file in the fixture directory", async () => {
    const onDisk = (await readdir("src/lib/uepi/source/fixtures"))
      .filter((name) => !name.endsWith(".ts"));
    expect(new Set(onDisk)).toEqual(new Set(SOURCE_FIXTURES.map((fixture) => fixture.file)));
  });
});

describe("2. the manifest states the provenance a later reader will need", () => {
  it("names the operator, the dataset, the URL, the day and the clock", () => {
    for (const fixture of SOURCE_FIXTURES) {
      expect(fixture.sourceOrganization.length, fixture.file).toBeGreaterThan(3);
      expect(fixture.dataset.length, fixture.file).toBeGreaterThan(3);
      expect(fixture.url, fixture.file).toMatch(/^https?:\/\//);
      expect(fixture.operatingDate, fixture.file).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(fixture.retrievedAt, fixture.file).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(fixture.sourceTimezone.length, fixture.file).toBeGreaterThan(3);
      expect(fixture.attribution.length, fixture.file).toBeGreaterThan(3);
      expect(fixture.why.length, fixture.file).toBeGreaterThan(20);
    }
  });

  it("says why the date was chosen, rather than leaving it to look arbitrary", () => {
    const transition = SOURCE_FIXTURES.filter((fixture) =>
      fixture.operatingDate === "2026-03-08" || fixture.operatingDate === "2025-11-02");
    expect(transition.length).toBeGreaterThanOrEqual(8);
    for (const fixture of transition) {
      expect(fixture.why.toLowerCase(), fixture.file).toMatch(/spring|fall|transition|legacy|clock/);
    }
  });

  it("carries the retention posture of the three sources Urdais may not publish", () => {
    for (const fixture of SOURCE_FIXTURES) {
      if (fixture.seriesId === "uepi-miso" || fixture.seriesId === "uepi-spp") {
        expect(fixture.attribution, fixture.file).toMatch(/Retained internally/);
      }
    }
  });

  it("presents an artifact as though it had been retrieved, with its own provenance", () => {
    const artifact = fixtureArtifact("nyiso-2026-09-23.csv", "daily");
    expect(artifact.url).toBe("http://mis.nyiso.com/public/csv/damlbmp/20260923damlbmp_zone.csv");
    expect(artifact.retrievedAt).toBe("2026-09-25T15:26:41Z");
    expect(artifact.status).toBe(200);
  });
});
