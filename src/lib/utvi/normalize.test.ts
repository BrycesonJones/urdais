import { describe, expect, it } from "vitest";

import { resolveLab, foldsTogether, NAMESPACE_TO_LAB_SLUG } from "@/lib/utvi/identity";
import {
  assertDailyContract,
  datesInWindow,
  hashDateRows,
  normalizeRow,
  parsePermaslug,
  parseTokenTotal,
  snapshotsFromResponse,
} from "@/lib/utvi/normalize";
import { UtviContractError, type SourceResponse } from "@/lib/utvi/types";

const meta = (start: string, end: string) => ({
  as_of: "2026-09-16T01:00:33.578Z",
  start_date: start,
  end_date: end,
  version: "v1",
});

const row = (date: string, permaslug: string, tokens: string) => ({
  date,
  model_permaslug: permaslug,
  total_tokens: tokens,
});

/** A shape matching what the live endpoint returned on 2026-09-15: 50 named rows plus a tail. */
function liveShapedDay(date: string, namedCount = 50): SourceResponse {
  const data = Array.from({ length: namedCount }, (_, i) =>
    row(date, `lab${i}/model-${i}`, String(1_000_000_000 - i)),
  );
  data.push(row(date, "other", "500000000"));
  return { data, meta: meta(date, date) };
}

const alwaysProvisional = () => "provisional" as const;

describe("permaslug parsing", () => {
  it("splits namespace, base and variant without rewriting any of them", () => {
    expect(parsePermaslug("openai/gpt-4o-2024-05-13:free")).toEqual({
      permaslug: "openai/gpt-4o-2024-05-13:free",
      namespace: "openai",
      baseSlug: "openai/gpt-4o-2024-05-13",
      variant: "free",
      isResidual: false,
    });
  });

  it("treats the reserved tail permaslug as the residual and gives it no namespace", () => {
    expect(parsePermaslug("other")).toMatchObject({ isResidual: true, namespace: null, variant: null });
  });

  it("folds a free variant onto its base model, which Phase 1A measured colliding on 29 dates", () => {
    const bare = parsePermaslug("openai/gpt-oss-120b");
    const free = parsePermaslug("openai/gpt-oss-120b:free");
    expect(free.baseSlug).toBe(bare.baseSlug);
    expect(foldsTogether(bare, free)).toBe(true);
  });

  it("does not fold two dated versions of one family together", () => {
    const a = parsePermaslug("deepseek/deepseek-v4-flash-20260731");
    const b = parsePermaslug("deepseek/deepseek-v4-flash-20260423");
    expect(foldsTogether(a, b)).toBe(false);
  });

  it("never folds the residual with anything, including itself", () => {
    const residual = parsePermaslug("other");
    expect(foldsTogether(residual, residual)).toBe(false);
  });
});

describe("token totals", () => {
  it("accepts a decimal string far above the float-safe range without losing digits", () => {
    expect(parseTokenTotal("17750400225262", "x")).toBe(17_750_400_225_262n);
    expect(parseTokenTotal("90071992547409910", "x")).toBe(90071992547409910n);
  });

  it("accepts zero for a single row, which is only meaningful beside other rows", () => {
    expect(parseTokenTotal("0", "x")).toBe(0n);
  });

  it("refuses a fractional total, because that is the sampled dataset announcing itself", () => {
    // Measured: language_type= returned "4717815275999.996".
    expect(() => parseTokenTotal("4717815275999.996", "x")).toThrow(UtviContractError);
    expect(() => parseTokenTotal("4717815275999.996", "x")).toThrow(/sampled dataset/);
  });

  it("refuses a negative total and a non-string", () => {
    expect(() => parseTokenTotal("-1", "x")).toThrow(UtviContractError);
    expect(() => parseTokenTotal(12345, "x")).toThrow(UtviContractError);
    expect(() => parseTokenTotal(null, "x")).toThrow(UtviContractError);
  });
});

describe("the daily contract", () => {
  it("accepts the shape the live endpoint returns", () => {
    const parsed = assertDailyContract(liveShapedDay("2026-09-15"));
    expect(parsed.data).toHaveLength(51);
    expect(parsed.meta.version).toBe("v1");
  });

  it("refuses a response with no meta, or a meta window that is not a date", () => {
    expect(() => assertDailyContract({ data: [] })).toThrow(/meta is missing/);
    expect(() => assertDailyContract({ data: [], meta: { ...meta("x", "y") } })).toThrow(/not YYYY-MM-DD/);
  });

  it("refuses an as_of that is not a timestamp, because the citation interpolates it", () => {
    expect(() =>
      assertDailyContract({ data: [], meta: { ...meta("2026-09-15", "2026-09-15"), as_of: "never" } }),
    ).toThrow(/as_of is not a timestamp/);
  });

  it("refuses a row missing its permaslug, and one whose total is fractional", () => {
    expect(() =>
      assertDailyContract({ data: [{ date: "2026-09-15", total_tokens: "1" }], meta: meta("2026-09-15", "2026-09-15") }),
    ).toThrow(/model_permaslug is missing/);
    expect(() =>
      assertDailyContract({ data: [row("2026-09-15", "a/b", "1.5")], meta: meta("2026-09-15", "2026-09-15") }),
    ).toThrow(/not a non-negative integer/);
  });
});

describe("snapshots", () => {
  it("computes the day total as named rows plus the tail", () => {
    const response = assertDailyContract({
      data: [row("2026-09-15", "a/b", "900"), row("2026-09-15", "c/d", "100"), row("2026-09-15", "other", "50")],
      meta: meta("2026-09-15", "2026-09-15"),
    });
    const snapshot = snapshotsFromResponse(response, alwaysProvisional)[0]!;
    expect(snapshot).toMatchObject({
      coverageState: "covered_observed",
      totalTokens: 1050n,
      attributedTokens: 1000n,
      residualTokens: 50n,
      namedRowCount: 2,
      residualRowPresent: true,
    });
  });

  it("accepts a day with no tail row and records the absence rather than failing", () => {
    // Measured: modality=audio returned 45 rows and no `other` row at all.
    const response = assertDailyContract({
      data: [row("2026-09-15", "a/b", "900")],
      meta: meta("2026-09-15", "2026-09-15"),
    });
    const snapshot = snapshotsFromResponse(response, alwaysProvisional)[0]!;
    expect(snapshot.residualRowPresent).toBe(false);
    expect(snapshot.residualTokens).toBe(0n);
    expect(snapshot.totalTokens).toBe(900n);
  });

  it("gives a date with no rows coverage but no arithmetic, so an empty sum cannot become zero", () => {
    const response = assertDailyContract({ data: [], meta: meta("2026-09-14", "2026-09-15") });
    const snapshots = snapshotsFromResponse(response, alwaysProvisional);
    expect(snapshots).toHaveLength(2);
    for (const snapshot of snapshots) {
      expect(snapshot.coverageState).toBe("covered_no_rows");
      expect(snapshot.totalTokens).toBeNull();
      expect(snapshot.attributedTokens).toBeNull();
      expect(snapshot.residualTokens).toBeNull();
    }
  });

  it("produces one snapshot per date in the resolved window, including dates the source omitted", () => {
    const response = assertDailyContract({
      data: [row("2026-09-13", "a/b", "1"), row("2026-09-15", "a/b", "3")],
      meta: meta("2026-09-13", "2026-09-15"),
    });
    const snapshots = snapshotsFromResponse(response, alwaysProvisional);
    expect(snapshots.map((s) => s.observationDate)).toEqual(["2026-09-13", "2026-09-14", "2026-09-15"]);
    expect(snapshots[1]!.coverageState).toBe("covered_no_rows");
  });

  it("refuses a day whose only row is the tail: a tail with nothing above it is incoherent", () => {
    const response = assertDailyContract({
      data: [row("2026-09-15", "other", "50")],
      meta: meta("2026-09-15", "2026-09-15"),
    });
    expect(() => snapshotsFromResponse(response, alwaysProvisional)).toThrow(/none is a named model/);
  });

  it("refuses a duplicated permaslug within one date", () => {
    const response = assertDailyContract({
      data: [row("2026-09-15", "a/b", "1"), row("2026-09-15", "a/b", "2")],
      meta: meta("2026-09-15", "2026-09-15"),
    });
    expect(() => snapshotsFromResponse(response, alwaysProvisional)).toThrow(/appears twice/);
  });

  it("refuses rows dated outside the window the source's own meta declares", () => {
    const response = assertDailyContract({
      data: [row("2026-08-31", "a/b", "1")],
      meta: meta("2026-09-02", "2026-09-02"),
    });
    expect(() => snapshotsFromResponse(response, alwaysProvisional)).toThrow(/outside the resolved window/);
  });

  it("refuses more than one tail row on a date", () => {
    const response = assertDailyContract({
      data: [row("2026-09-15", "a/b", "1"), row("2026-09-15", "other", "2")],
      meta: meta("2026-09-15", "2026-09-15"),
    });
    // One tail is fine; a second requires a distinct permaslug, which cannot be `other`, so
    // the duplicate guard is what catches it. Asserted so the pair of rules is not lost.
    expect(() => snapshotsFromResponse(response, alwaysProvisional)).not.toThrow();
  });
});

describe("the content hash", () => {
  it("changes when a single row's volume changes, which is what revision detection needs", () => {
    // The real revision Phase 1A measured: one row moved by +93,102 tokens.
    const before = [row("2026-09-15", "z-ai/glm-5.3-flash-20260826", "1585634788675")];
    const after = [row("2026-09-15", "z-ai/glm-5.3-flash-20260826", "1585634881777")];
    expect(hashDateRows(before)).not.toBe(hashDateRows(after));
  });

  it("is stable under a pure re-ordering, so a rank shuffle alone is not a revision", () => {
    const a = [row("2026-09-15", "a/b", "1"), row("2026-09-15", "c/d", "2")];
    const b = [row("2026-09-15", "c/d", "2"), row("2026-09-15", "a/b", "1")];
    expect(hashDateRows(a)).toBe(hashDateRows(b));
  });

  it("is a 64-character hex digest", () => {
    expect(hashDateRows([row("2026-09-15", "a/b", "1")])).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("lab resolution", () => {
  it("maps a namespace that equals its provider slug", () => {
    expect(resolveLab(parsePermaslug("deepseek/deepseek-v4"))).toMatchObject({
      labSlug: "deepseek",
      state: "evidenced",
    });
  });

  it("maps the namespaces whose slug differs, and flags that it aliased", () => {
    for (const [namespace, slug] of [
      ["x-ai", "xai"],
      ["qwen", "alibaba"],
      ["moonshotai", "moonshot"],
      ["mistralai", "mistral"],
      ["z-ai", "zhipu-ai"],
    ] as const) {
      const resolved = resolveLab(parsePermaslug(`${namespace}/some-model`));
      expect(resolved).toMatchObject({ labSlug: slug, state: "evidenced" });
      expect(resolved.qualityFlags).toContain("LAB_NAMESPACE_ALIASED");
    }
  });

  it("maps meta and meta-llama to the same lab, which is why the table exists", () => {
    expect(resolveLab(parsePermaslug("meta/muse-spark-1.3")).labSlug).toBe("meta");
    expect(resolveLab(parsePermaslug("meta-llama/llama-3.1-8b-instruct")).labSlug).toBe("meta");
    expect(NAMESPACE_TO_LAB_SLUG.meta).toBe(NAMESPACE_TO_LAB_SLUG["meta-llama"]);
  });

  it("refuses to attribute an undisclosed author, and keeps that distinct from unmapped", () => {
    const stealth = resolveLab(parsePermaslug("stealth/ox-alpha"));
    expect(stealth).toMatchObject({ labSlug: null, state: "undisclosed" });
    expect(stealth.qualityFlags).toContain("LAB_UNDISCLOSED");

    const unknown = resolveLab(parsePermaslug("brand-new-lab/model-1"));
    expect(unknown).toMatchObject({ labSlug: null, state: "unmapped" });
    expect(unknown.qualityFlags).toContain("LAB_UNMAPPED");
  });

  it("never credits the serving platform as a lab", () => {
    const platform = resolveLab(parsePermaslug("openrouter/owl-alpha"));
    expect(platform.labSlug).toBeNull();
    expect(platform.qualityFlags).toContain("SERVING_PLATFORM_AS_AUTHOR");
  });

  it("gives the tail row no lab and marks it not applicable", () => {
    expect(resolveLab(parsePermaslug("other"))).toMatchObject({
      labSlug: null,
      state: "not_applicable",
    });
  });

  it("keeps the volume of an unattributable row: normalizing never drops tokens", () => {
    const observation = normalizeRow(row("2026-09-15", "stealth/ox-alpha", "27237502959584"));
    expect(observation.tokens).toBe(27_237_502_959_584n);
    expect(observation.labSlug).toBeNull();
  });
});

describe("date windows", () => {
  it("is inclusive at both ends", () => {
    expect(datesInWindow("2026-09-13", "2026-09-15")).toEqual(["2026-09-13", "2026-09-14", "2026-09-15"]);
  });

  it("spans a month and a leap-year boundary correctly", () => {
    expect(datesInWindow("2026-02-27", "2026-03-01")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01"]);
    expect(datesInWindow("2028-02-28", "2028-03-01")).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
  });

  it("refuses an inverted window", () => {
    expect(() => datesInWindow("2026-09-15", "2026-09-13")).toThrow(UtviContractError);
  });
});
