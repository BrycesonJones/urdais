/**
 * Methodology 1.0.0 semantics and the calculators that apply them.
 *
 * The tests that matter most are the ones that pin a rule the source made easy to get wrong: a
 * reported zero is not missing, a bare year is not a serial, ERCOT's repeats do not merge while
 * CAISO's do, and nothing publishes without the registry saying so.
 */

import { describe, expect, it } from "vitest";

import {
  calculateAnalytics, calculateM1, calculateM2, calculateM3, calculateM4, calculateM5, quantile,
} from "@/lib/grid-buildout/analytics/calculate";
import {
  METHODOLOGY_DOCUMENT_SHA256, METHODOLOGY_SLUG, METHODOLOGY_VERSION, MethodologyRegistrationError,
  assertMethodologyApproved, classifyWorksCharacter, resolvesDuplicateOccurrences,
} from "@/lib/grid-buildout/analytics/methodology";
import type { AnalyticalUniverse, CanonicalOccurrence } from "@/lib/grid-buildout/analytics/types";
import { resolveProjects } from "@/lib/grid-buildout/analytics/universe";
import {
  BuildoutDomainError, BuildoutOutputError, assertOccurrenceDomain, assertOutputContract,
} from "@/lib/grid-buildout/analytics/validate";

const reported = (value: number) => ({ value, isReported: true });
const unreported = { value: null, isReported: false };

function occurrence(overrides: Partial<CanonicalOccurrence> = {}): CanonicalOccurrence {
  return {
    projectId: `p-${overrides.nativeId ?? "1"}-${overrides.occurrence ?? 1}`,
    snapshotId: "snap-1",
    rawRecordId: `r-${overrides.nativeId ?? "1"}-${overrides.occurrence ?? 1}`,
    nativeId: "1", nativeList: "completed", occurrence: 1,
    sponsor: "Owner", lifecycle: "in_service", lifecycleBasis: "source_list_membership",
    driverClass: "unknown", serviceLevelKv: 138,
    newMiles: reported(0), rebuiltMiles: reported(0),
    actualInService: "2025-06-01", actualInServiceSentinel: false,
    targetAtApproval: null, targetAtApprovalPrecision: null,
    targetCurrent: null, targetCurrentPrecision: null,
    cancellationReason: null,
    ...overrides,
  };
}

function universe(
  market: "ercot" | "caiso",
  occurrences: CanonicalOccurrence[],
): AnalyticalUniverse {
  const projects = resolveProjects(market, occurrences);
  return {
    market, snapshotId: "snap-1", snapshotKey: "key-1",
    observedAt: "2026-09-22T00:00:00.000Z",
    occurrencesRead: occurrences.length,
    projects, excluded: [], unknownDriverCount: 0,
    duplicateResolutions: projects.filter((p) => p.occurrences.length > 1).map((p) => ({
      nativeId: p.nativeId, occurrences: p.occurrences.length,
      owners: p.contributingOwners, projectIds: p.occurrences.map((o) => o.projectId),
    })),
  };
}

describe("ERCOT works character (methodology §5)", () => {
  it("treats a reported positive value as that class", () => {
    expect(classifyWorksCharacter(reported(2.5), reported(0))).toBe("new");
    expect(classifyWorksCharacter(reported(0), reported(12))).toBe("rebuilt_or_reconductored");
    expect(classifyWorksCharacter(reported(1), reported(1))).toBe("both");
  });

  it("treats a reported zero as an affirmative nil, not as missing", () => {
    // The correction GBV-2 measured: service providers write an explicit 0, and reading that as
    // unknown filed two thirds of ERCOT completions as unclassified.
    expect(classifyWorksCharacter(reported(0), reported(0))).toBe("none_reported_zero");
  });

  it("treats a genuinely absent value as unclassified", () => {
    expect(classifyWorksCharacter(unreported, reported(0))).toBe("unknown_unclassified");
    expect(classifyWorksCharacter(reported(0), unreported)).toBe("unknown_unclassified");
    expect(classifyWorksCharacter(unreported, unreported)).toBe("unknown_unclassified");
  });

  it("does not regress to the superseded value > 0 rule", () => {
    // Under the old rule both of these were `unknown_unclassified`. Only one is now.
    const reportedZeroes = classifyWorksCharacter(reported(0), reported(0));
    const genuinelyBlank = classifyWorksCharacter(unreported, unreported);
    expect(reportedZeroes).not.toBe(genuinelyBlank);
    expect(reportedZeroes).toBe("none_reported_zero");
  });
});

describe("CAISO duplicate resolution (methodology §6)", () => {
  const shared = [
    occurrence({ nativeId: "1718-R-11", occurrence: 1, nativeList: "PGaE", sponsor: "PG&E" }),
    occurrence({ nativeId: "1718-R-11", occurrence: 2, nativeList: "SCE", sponsor: "SCE" }),
    occurrence({ nativeId: "1718-R-11", occurrence: 3, nativeList: "VEA_GLW", sponsor: "VEA" }),
    occurrence({ nativeId: "2223-R-02", occurrence: 1, nativeList: "PGaE", sponsor: "PG&E" }),
  ];

  it("resolves occurrences sharing an identifier to one analytical project", () => {
    const projects = resolveProjects("caiso", shared);
    expect(projects).toHaveLength(2);
    const group = projects.find((p) => p.nativeId === "1718-R-11")!;
    expect(group.occurrences).toHaveLength(3);
  });

  it("keeps every contributing occurrence and its owner", () => {
    const group = resolveProjects("caiso", shared).find((p) => p.nativeId === "1718-R-11")!;
    expect(group.occurrences.map((o) => o.projectId)).toHaveLength(3);
    expect(group.contributingOwners.sort()).toEqual(["PG&E", "SCE", "VEA"]);
    // Deterministic primary: the publisher's own sheet order.
    expect(group.primary.nativeList).toBe("PGaE");
  });

  it("does not deduplicate records that merely look similar", () => {
    const lookalikes = [
      occurrence({ nativeId: "2223-R-02", occurrence: 1, nativeList: "PGaE" }),
      occurrence({ nativeId: "2223-R-2", occurrence: 1, nativeList: "SCE" }),
      occurrence({ nativeId: "2223-r-02", occurrence: 1, nativeList: "SDGaE" }),
    ];
    // Exact equality only: no case folding, no normalisation of the publisher's identifier.
    expect(resolveProjects("caiso", lookalikes)).toHaveLength(3);
  });

  it("never resolves ERCOT occurrences together", () => {
    expect(resolvesDuplicateOccurrences("ercot")).toBe(false);
    const repeats = [
      occurrence({ nativeId: "110733", occurrence: 1, nativeList: "future" }),
      occurrence({ nativeId: "110733", occurrence: 2, nativeList: "future" }),
    ];
    expect(resolveProjects("ercot", repeats)).toHaveLength(2);
  });

  it("does not double-count a resolved project, and reports contributor disagreement", () => {
    const disagreeing = [
      occurrence({
        nativeId: "X", occurrence: 1, nativeList: "PGaE", lifecycle: "planned",
        targetAtApproval: "2025-01-01", targetAtApprovalPrecision: "day",
        targetCurrent: "2026-01-01", targetCurrentPrecision: "day",
      }),
      occurrence({
        nativeId: "X", occurrence: 2, nativeList: "SCE", lifecycle: "planned",
        targetAtApproval: "2025-01-01", targetAtApprovalPrecision: "day",
        targetCurrent: "2027-06-01", targetCurrentPrecision: "day",
      }),
    ];
    const resolved = universe("caiso", disagreeing);
    expect(resolved.projects).toHaveLength(1);
    expect(resolved.projects[0]!.disagreements.map((d) => d.field)).toContain("targetCurrent");
    // Counted once, from the primary's value, never averaged into a date neither owner published.
    const m4 = calculateM4(resolved);
    expect(m4.distribution).toBeNull();
    expect(m4.excludedMissingEndpoint + m4.excludedYearPrecision).toBe(0);
  });
});

describe("registry-backed methodology guard", () => {
  const registry = (rows: Record<string, unknown>[]) => ({
    query: async () => ({ rows }),
  });

  it("succeeds when the version is approved with the expected digest", async () => {
    await expect(assertMethodologyApproved(registry([
      { id: "mv-1", version: METHODOLOGY_VERSION, status: "approved", content_hash: METHODOLOGY_DOCUMENT_SHA256 },
    ]))).resolves.toEqual({ methodologyVersionId: "mv-1" });
  });

  it("fails closed when the version is not registered at all", async () => {
    await expect(assertMethodologyApproved(registry([])))
      .rejects.toBeInstanceOf(MethodologyRegistrationError);
  });

  it("fails closed when the version is registered but not approved", async () => {
    await expect(assertMethodologyApproved(registry([
      { id: "mv-1", version: METHODOLOGY_VERSION, status: "draft", content_hash: METHODOLOGY_DOCUMENT_SHA256 },
    ]))).rejects.toThrow(/draft, not approved/);
  });

  it("fails closed when the registered digest is not the one this code expects", async () => {
    await expect(assertMethodologyApproved(registry([
      { id: "mv-1", version: METHODOLOGY_VERSION, status: "approved", content_hash: "f".repeat(64) },
    ]))).rejects.toThrow(/is not the/);
  });

  it("asks the registry and nothing else", async () => {
    // The guard must not reach the filesystem: docs/ is absent from a serverless bundle, which is
    // exactly how Transmission Headroom's first production cron failed.
    const asked: string[] = [];
    await assertMethodologyApproved({
      query: async (text: string, params: unknown[]) => {
        asked.push(text);
        expect(params).toEqual([METHODOLOGY_SLUG, METHODOLOGY_VERSION]);
        return { rows: [{ id: "mv-1", version: METHODOLOGY_VERSION, status: "approved", content_hash: METHODOLOGY_DOCUMENT_SHA256 }] };
      },
    });
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("reference.methodology_versions");
    const source = assertMethodologyApproved.toString();
    expect(source).not.toMatch(/readFile|readFileSync|existsSync/);
  });
});

describe("M1-M5", () => {
  const ercot = universe("ercot", [
    occurrence({ nativeId: "a", actualInService: "2025-03-01", newMiles: reported(5), rebuiltMiles: reported(0) }),
    occurrence({ nativeId: "b", actualInService: "2025-07-01", newMiles: reported(0), rebuiltMiles: reported(3) }),
    occurrence({ nativeId: "c", actualInService: "2026-02-01", newMiles: reported(0), rebuiltMiles: reported(0) }),
    occurrence({ nativeId: "d", actualInService: null, actualInServiceSentinel: true }),
    occurrence({ nativeId: "e", lifecycle: "planned", actualInService: null, nativeList: "future" }),
    occurrence({ nativeId: "f", lifecycle: "under_construction", actualInService: null, nativeList: "future" }),
  ]);

  it("M1 counts completions by year and excludes a sentinel date without losing it", () => {
    const m1 = calculateM1(ercot);
    expect(m1.periods).toEqual([{ period: 2025, count: 2 }, { period: 2026, count: 1 }]);
    expect(m1.total).toBe(3);
    // The sentinel project is still in service; it simply cannot be placed in a period.
    expect(m1.excludedSentinelDate).toBe(1);
  });

  it("M2 counts the active stock and is unaffected by a sentinel completion", () => {
    const m2 = calculateM2(ercot);
    expect(m2.byLifecycle).toContainEqual({ lifecycle: "planned", count: 1 });
    expect(m2.byLifecycle).toContainEqual({ lifecycle: "under_construction", count: 1 });
    expect(m2.total).toBe(2);
  });

  it("M3 decomposes M1's population and never sums mileage", () => {
    const m3 = calculateM3(ercot);
    expect(m3.population).toBe(3);
    const characters = Object.fromEntries(m3.byWorksCharacter.map((c) => [c.character, c.count]));
    expect(characters.new).toBe(1);
    expect(characters.rebuilt_or_reconductored).toBe(1);
    expect(characters.none_reported_zero).toBe(1);
    expect(m3.byWorksCharacter.reduce((t, c) => t + c.count, 0)).toBe(m3.population);
    // Every kV class here is below the floor of 5, so all are suppressed rather than published.
    expect(m3.byServiceLevelKv).toEqual([]);
    expect(m3.suppressedKvProjects).toBe(3);
  });

  it("M4 withholds a distribution below the floor and says why", () => {
    const thin = universe("caiso", [
      occurrence({
        nativeId: "x", lifecycle: "planned",
        targetAtApproval: "2025-01-01", targetAtApprovalPrecision: "day",
        targetCurrent: "2025-03-02", targetCurrentPrecision: "day",
      }),
    ]);
    const m4 = calculateM4(thin);
    expect(m4.published).toBe(false);
    expect(m4.distribution).toBeNull();
    expect(m4.withheldReason).toMatch(/floor is 12/);
  });

  it("M4 publishes an ordered distribution at or above the floor", () => {
    const many = universe("caiso", Array.from({ length: 12 }, (_, index) => occurrence({
      nativeId: `p${index}`, lifecycle: "planned",
      targetAtApproval: "2025-01-01", targetAtApprovalPrecision: "day",
      targetCurrent: `2025-01-${String(2 + index).padStart(2, "0")}`, targetCurrentPrecision: "day",
    })));
    const m4 = calculateM4(many);
    expect(m4.published).toBe(true);
    const d = m4.distribution!;
    expect(d.count).toBe(12);
    expect(d.min).toBeLessThanOrEqual(d.q1);
    expect(d.q1).toBeLessThanOrEqual(d.median);
    expect(d.median).toBeLessThanOrEqual(d.q3);
    expect(d.q3).toBeLessThanOrEqual(d.max);
  });

  it("M4 refuses a year-precision endpoint rather than inventing a day", () => {
    const yearly = universe("caiso", [
      occurrence({
        nativeId: "y", lifecycle: "planned",
        targetAtApproval: "2030-01-01", targetAtApprovalPrecision: "year",
        targetCurrent: "2032-06-15", targetCurrentPrecision: "day",
      }),
    ]);
    const m4 = calculateM4(yearly);
    expect(m4.excludedYearPrecision).toBe(1);
    expect(m4.excludedMissingEndpoint).toBe(0);
  });

  it("M5 reports cancellations verbatim and publishes no on-hold figure", () => {
    const caiso = universe("caiso", [
      occurrence({ nativeId: "c1", lifecycle: "cancelled", cancellationReason: "Cancelled in the 2025-2026 plan" }),
      occurrence({ nativeId: "c2", lifecycle: "unknown" }),
    ]);
    const m5 = calculateM5(caiso);
    expect(m5.cancelled).toBe(1);
    expect(m5.reasons).toEqual([{ nativeId: "c1", reason: "Cancelled in the 2025-2026 plan" }]);
    expect(m5.unmappedStatusCount).toBe(1);
    expect(m5.onHoldReported).toBe(false);
  });

  it("produces identical output for identical input", () => {
    const caiso = universe("caiso", [occurrence({ nativeId: "q", lifecycle: "planned" })]);
    const at = "2026-09-22T00:00:00.000Z";
    const first = calculateAnalytics(ercot, caiso, { calculatedAt: at });
    const second = calculateAnalytics(ercot, caiso, { calculatedAt: at });
    expect(second).toEqual(first);
    expect(second.inputDigest).toBe(first.inputDigest);
    expect(first.methodologyVersion).toBe(METHODOLOGY_VERSION);
  });

  it("interpolates quantiles and refuses an empty sample", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.25)).toBe(10);
    expect(() => quantile([], 0.5)).toThrow();
  });
});

describe("domain validation", () => {
  it("refuses a negative mileage", () => {
    expect(() => assertOccurrenceDomain(occurrence({ newMiles: reported(-1) }), "ercot"))
      .toThrow(BuildoutDomainError);
  });

  it("refuses a quantity that is unreported yet carries a value", () => {
    expect(() => assertOccurrenceDomain(
      occurrence({ rebuiltMiles: { value: 3, isReported: false } }), "ercot")).toThrow(BuildoutDomainError);
  });

  it("refuses an implausible year", () => {
    expect(() => assertOccurrenceDomain(occurrence({ actualInService: "1850-01-01" }), "ercot"))
      .toThrow(/outside 1900-2200/);
  });

  it("refuses a row that is both sentinel-dated and dated", () => {
    expect(() => assertOccurrenceDomain(
      occurrence({ actualInService: "2025-01-01", actualInServiceSentinel: true }), "ercot"))
      .toThrow(/sentinel and a usable/);
  });

  it("refuses a missing lineage identifier", () => {
    expect(() => assertOccurrenceDomain(occurrence({ rawRecordId: "" }), "ercot"))
      .toThrow(/lineage/);
  });
});

describe("output validation", () => {
  const base = () => calculateAnalytics(
    universe("ercot", [occurrence({ nativeId: "a" })]),
    universe("caiso", [occurrence({ nativeId: "b", lifecycle: "planned" })]),
    { calculatedAt: "2026-09-22T00:00:00.000Z" },
  );

  it("passes a well-formed result", () => {
    expect(() => assertOutputContract(base())).not.toThrow();
  });

  it("refuses a total that disagrees with its components", () => {
    const broken = base();
    broken.m1.total += 1;
    expect(() => assertOutputContract(broken)).toThrow(BuildoutOutputError);
  });

  it("refuses a non-finite figure", () => {
    const broken = base();
    broken.m3.byWorksCharacter[0]!.share = Number.NaN;
    expect(() => assertOutputContract(broken)).toThrow(/NaN/);
  });

  it("refuses a published distribution whose quantiles are out of order", () => {
    const broken = base();
    broken.m4 = {
      ...broken.m4, published: true, withheldReason: null,
      distribution: { count: 20, median: 10, q1: 50, q3: 20, min: 0, max: 100 },
    };
    expect(() => assertOutputContract(broken)).toThrow(/not ordered/);
  });

  it("refuses a distribution published below the floor", () => {
    const broken = base();
    broken.m4 = {
      ...broken.m4, published: true, withheldReason: null,
      distribution: { count: 3, median: 1, q1: 0, q3: 2, min: 0, max: 3 },
    };
    expect(() => assertOutputContract(broken)).toThrow(/floor is 12/);
  });

  it("refuses a wrong methodology version", () => {
    const broken = base();
    broken.methodologyVersion = "0.9.0";
    expect(() => assertOutputContract(broken)).toThrow(/is not 1\.0\.0/);
  });
});
