/**
 * What adding a scheduler must not change.
 *
 * Automating ingestion is the one moment in a product's life when it is easiest to quietly widen
 * what it publishes: the job now touches every market every morning, and the distance between
 * "ingested automatically" and "shown automatically" is one forgotten gate. These tests hold
 * that line, and they hold the frozen methodology's.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SPECIFICATION_DIGEST, SPECIFICATION_VERSION, TRAILING_REREAD_DAYS } from "@/lib/uepi/methodology";
import { UEPI_BENCHMARKS } from "@/lib/uepi/benchmarks";
import { IMPLEMENTED_SERIES_IDS } from "@/lib/uepi/source/registry";
import { UEPI_SERIES_IDS } from "@/lib/uepi/types";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

/**
 * A file's code with its comments removed.
 *
 * The source guards below ask what a module *does*, and a comment saying "this never reads
 * `updated_at`" is evidence for the rule rather than a violation of it. Scanning raw text made
 * both guards fail on their own documentation, which is a test that punishes explaining
 * yourself.
 */
function codeOf(relative: string): string {
  return read(relative)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the frozen specification", () => {
  it("is byte-identical: its digest is still the approved one", () => {
    const digest = createHash("sha256")
      .update(read("docs/research/uepi/uepi-v1-specification.md"))
      .digest("hex");
    expect(digest).toBe("14db88a1584b482ac7906cc10389f0176ac44e7982bc510a4d6665e99069939a");
    expect(digest).toBe(SPECIFICATION_DIGEST);
  });

  it("is still 1.0.0; scheduling a product does not version its methodology", () => {
    expect(SPECIFICATION_VERSION).toBe("1.0.0");
  });

  it("leaves the cross-hub tolerances exactly where §G.3 froze them", () => {
    // MISO 2026-05-19 is withheld because its hubs disagree by one cent. Widening this to let
    // a scheduled run "succeed" on that day would be a methodology change wearing an ops hat.
    //
    // Read from the source rather than imported: the constant is deliberately module-private,
    // and exporting it so a test could see it would widen its surface for no other reason.
    const normalize = codeOf("src/lib/uepi/normalize.ts");
    for (const [seriesId, tolerance] of [
      ["uepi-caiso", "0.0001"],
      ["uepi-miso", "0.0001"],
      ["uepi-nyiso", "0.02"],
      ["uepi-spp", "0.001"],
    ] as const) {
      expect(normalize, seriesId).toContain(`"${seriesId}": "${tolerance}"`);
    }
  });

  it("keeps the trailing re-read window the specification names", () => {
    expect(TRAILING_REREAD_DAYS).toBe(7);
  });
});

describe("ingesting a market is not publishing it", () => {
  /** Every market the scheduler will now run, every morning, unattended. */
  const INGESTED = new Set<string>(IMPLEMENTED_SERIES_IDS);

  it("ingests six markets and publishes three", () => {
    expect(INGESTED.size).toBe(6);
    const published = UEPI_SERIES_IDS.filter((id) => UEPI_BENCHMARKS[id].publicationPosture === "publishable");
    expect(published).toEqual(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]);
  });

  it.each([
    ["uepi-ercot", true, true],
    ["uepi-caiso", true, true],
    ["uepi-nyiso", true, true],
    ["uepi-iso-ne", true, false],
    ["uepi-miso", true, false],
    ["uepi-spp", true, false],
    ["uepi-pjm", false, false],
  ] as const)("%s: ingested=%s public=%s", (seriesId, ingested, isPublic) => {
    expect(INGESTED.has(seriesId)).toBe(ingested);
    expect(UEPI_BENCHMARKS[seriesId].publicationPosture === "publishable").toBe(isPublic);
  });

  it("gives the three internal markets a scheduler and still no public posture", () => {
    // The specific regression: automating MISO and SPP must not be mistaken for permission to
    // show them. Their terms forbid publication and the scheduler changes nothing about that.
    for (const seriesId of ["uepi-miso", "uepi-spp", "uepi-iso-ne"] as const) {
      expect(INGESTED.has(seriesId), seriesId).toBe(true);
      expect(UEPI_BENCHMARKS[seriesId].publicationPosture, seriesId).toBe("internal_only");
    }
  });

  it("changes no rights expectation", () => {
    expect(UEPI_BENCHMARKS["uepi-miso"].expectedRightsClassification).toBe("unsuitable_without_permission");
    expect(UEPI_BENCHMARKS["uepi-spp"].expectedRightsClassification).toBe("unsuitable_without_permission");
    expect(UEPI_BENCHMARKS["uepi-pjm"].expectedRightsClassification).toBe("unsuitable_without_permission");
  });
});

describe("the schedule", () => {
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };

  it("registers exactly one UEPI cron", () => {
    expect(vercel.crons.filter((cron) => cron.path === "/api/cron/uepi")).toHaveLength(1);
  });

  it("runs daily in the morning UTC window the specification's rationale requires", () => {
    const uepi = vercel.crons.find((cron) => cron.path === "/api/cron/uepi")!;
    const [minute, hour, ...rest] = uepi.schedule.split(" ");
    expect(rest).toEqual(["*", "*", "*"]);
    expect(Number(hour)).toBe(10);
    expect(Number(minute)).toBeGreaterThanOrEqual(0);
    // §G.6 asks for a slot at which all markets are inside operating day `d` locally. 10:xx UTC
    // is 05:xx CT / 06:xx ET / 03:xx PT, which satisfies that for all four zones.
  });

  it("does not collide with another cron's slot", () => {
    // §G.6 names 10:15, which `transmission-headroom` has since taken. Two crons in the same
    // minute would run concurrently against one pooled connection, which is the thing the
    // staggered schedule exists to avoid.
    const byTime = new Map<string, string[]>();
    for (const cron of vercel.crons) {
      byTime.set(cron.schedule, [...(byTime.get(cron.schedule) ?? []), cron.path]);
    }
    for (const [schedule, paths] of byTime) {
      expect(paths, `${schedule} is shared by ${paths.join(", ")}`).toHaveLength(1);
    }
  });
});

describe("the scheduler reuses the reviewed pipeline", () => {
  it("has no ingestion, parsing, normalization or release logic of its own", () => {
    // The rule that keeps a scheduled release identical to an operator's: the orchestrator may
    // only call the pipeline. If any of these ever appear here, a second ingestion path exists.
    const source = codeOf("src/lib/uepi/ops/scheduled-run.ts");
    for (const forbidden of [
      "parseArtifact", "normalizeHourly", "calculateDailyValue", "evaluateRelease",
      "storeOperatingDay", "retrieveArtifacts", "fetch(",
    ]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).toContain('from "@/lib/uepi/backfill"');
  });

  it("computes freshness without reading any run record", () => {
    // The independence the whole phase turns on: if freshness could see the ledger, a
    // successful run could make a stale market look fresh.
    const source = codeOf("src/lib/uepi/ops/freshness.ts");
    for (const forbidden of ["ingestion_runs", "updated_at", "created_at", "lastRunAt", "Date.now"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    // And the store's freshness read takes its head from the released values alone.
    expect(codeOf("src/lib/uepi/ops/store.ts")).toContain("max(d.operating_date)");
  });
});
