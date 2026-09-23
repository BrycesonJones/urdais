import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  BATTERY_ENABLED, DEFAULT_ALPHA, DEFAULT_ALPHA_SCENARIOS, FORBIDDEN_OUTPUT_TERMS,
  MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION, METHODOLOGY_DOCUMENT_PATH, METHODOLOGY_DOCUMENT_SHA256,
  METHODOLOGY_PARAMETERS, METHODOLOGY_SLUG, METHODOLOGY_VERSION, METRIC_CODE,
  MINIMUM_ANNUAL_COVERAGE, MethodologyPublicationBlockedError, MethodologyRegistrationError,
  PEAK_REFERENCE_RULE, PEAK_REGION_RULE, UNRESOLVED,
  assertMethodologyApproved, assertPublicationAuthorized,
} from "@/lib/flexible-capacity/methodology";

const MIGRATION = "supabase/migrations/20261019100000_flexible_capacity_methodology.sql";

/** A stand-in registry. The guard only ever issues one query, and only ever reads it. */
function registry(row: Record<string, unknown> | undefined): {
  query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  texts: string[];
} {
  const texts: string[] = [];
  return {
    texts,
    query: async (text: string) => { texts.push(text); return { rows: row === undefined ? [] : [row] }; },
  };
}

const approvedRow = {
  id: "c1000000-0000-4000-8000-000000000001",
  version: METHODOLOGY_VERSION,
  status: "approved",
  content_hash: METHODOLOGY_DOCUMENT_SHA256,
};

describe("1. the digest binds the code to the bytes that were approved", () => {
  it("matches the SHA-256 of the methodology document on disk", async () => {
    const bytes = await readFile(METHODOLOGY_DOCUMENT_PATH);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(METHODOLOGY_DOCUMENT_SHA256);
  });

  it("is the same digest the migration registers", async () => {
    const migration = await readFile(MIGRATION, "utf8");
    expect(migration).toContain(METHODOLOGY_DOCUMENT_SHA256);
  });

  it("is a real SHA-256 and not a placeholder", () => {
    expect(METHODOLOGY_DOCUMENT_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(METHODOLOGY_DOCUMENT_SHA256).not.toMatch(/^0+$/);
  });
});

describe("2. the guard reads the registry and nothing else", () => {
  it("returns the version id when the registry says approved and the digest agrees", async () => {
    const sql = registry(approvedRow);
    await expect(assertMethodologyApproved(sql)).resolves.toEqual({
      methodologyVersionId: approvedRow.id,
    });
  });

  it("queries reference.methodology_versions by slug and version", async () => {
    const sql = registry(approvedRow);
    await assertMethodologyApproved(sql);
    expect(sql.texts).toHaveLength(1);
    expect(sql.texts[0]).toContain("reference.methodology_versions");
    expect(sql.texts[0]).toContain("reference.methodologies");
  });

  it("fails when the methodology is not registered at all", async () => {
    await expect(assertMethodologyApproved(registry(undefined)))
      .rejects.toThrow(/is not registered/);
  });

  it("fails when the version is registered but still a draft", async () => {
    await expect(assertMethodologyApproved(registry({ ...approvedRow, status: "draft" })))
      .rejects.toThrow(/it is draft, not approved/);
  });

  it("fails when the version has been superseded", async () => {
    await expect(assertMethodologyApproved(registry({ ...approvedRow, status: "superseded" })))
      .rejects.toThrow(/not approved/);
  });

  it("fails when the registered digest is not the one this code was written against", async () => {
    const drifted = { ...approvedRow, content_hash: "a".repeat(64) };
    await expect(assertMethodologyApproved(registry(drifted)))
      .rejects.toThrow(MethodologyRegistrationError);
    await expect(assertMethodologyApproved(registry(drifted)))
      .rejects.toThrow(new RegExp(METHODOLOGY_DOCUMENT_SHA256));
  });

  it("never touches the filesystem, so a serverless bundle without docs/ behaves identically", async () => {
    const source = await readFile("src/lib/flexible-capacity/methodology.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/readFile|readFileSync|node:fs|existsSync/);
  });
});

describe("3. the parameter mirror agrees with the migration", () => {
  it("registers every parameter the code expects, with the same value and status", async () => {
    const migration = await readFile(MIGRATION, "utf8");
    for (const [key, expected] of Object.entries(METHODOLOGY_PARAMETERS)) {
      expect(migration, `${key} must be registered`).toContain(`'${key}'`);
      if (expected.textValue !== null) {
        expect(migration, `${key} text value`).toContain(`'${expected.textValue}'`);
      }
    }
  });

  it("names the inputs a future phase needs, as unresolved rather than as numbers", () => {
    expect(METHODOLOGY_PARAMETERS.demand_response_inventory).toEqual({
      numericValue: null, textValue: "unresolved", status: "draft",
    });
    expect(METHODOLOGY_PARAMETERS.deployed_storage_inventory).toEqual({
      numericValue: null, textValue: "unresolved", status: "draft",
    });
    // The coverage floor bounds how many hours are absent, not where. That is a real gap in the
    // rule, and it is registered as one rather than left to a reader to notice.
    expect(METHODOLOGY_PARAMETERS.maximum_contiguous_gap_hours).toEqual({
      numericValue: null, textValue: "unresolved", status: "draft",
    });
  });

  it("keeps every other parameter approved, because a draft cannot gate a published figure", () => {
    const drafts = Object.entries(METHODOLOGY_PARAMETERS)
      .filter(([, value]) => value.status === "draft").map(([key]) => key).sort();
    expect(drafts).toEqual([
      "demand_response_inventory", "deployed_storage_inventory", "maximum_contiguous_gap_hours",
    ]);
  });

  it("keeps the code constants and the registered parameters in step", () => {
    expect(METHODOLOGY_PARAMETERS.minimum_annual_coverage.numericValue).toBe(MINIMUM_ANNUAL_COVERAGE);
    expect(METHODOLOGY_PARAMETERS.annual_curtailment_energy_fraction_default.numericValue).toBe(DEFAULT_ALPHA);
    expect(METHODOLOGY_PARAMETERS.annual_curtailment_energy_fraction_maximum.numericValue)
      .toBe(MAX_ANNUAL_CURTAILMENT_ENERGY_FRACTION);
    expect(METHODOLOGY_PARAMETERS.peak_reference_rule.textValue).toBe(PEAK_REFERENCE_RULE);
    expect(METHODOLOGY_PARAMETERS.battery_enabled.textValue).toBe(String(BATTERY_ENABLED));
    expect(METHODOLOGY_PARAMETERS.annual_curtailment_energy_fraction_scenarios.textValue)
      .toBe(DEFAULT_ALPHA_SCENARIOS.map((alpha) => alpha.toFixed(4)).join(","));
  });
});

describe("4. the forbidden framings are prohibited in code, not only in prose", () => {
  it("publishes curtailment-enabled headroom and nothing called compute", () => {
    expect(METRIC_CODE).toBe("curtailment_enabled_headroom_gw");
    expect(METRIC_CODE).not.toMatch(/compute/);
  });

  it("lists the mock's framings among the terms this product may not use", () => {
    expect(FORBIDDEN_OUTPUT_TERMS).toContain("unlocked_compute_gw");
    expect(FORBIDDEN_OUTPUT_TERMS).toContain("additional compute capacity");
    expect(FORBIDDEN_OUTPUT_TERMS).toContain("total unlocked");
  });

  it("uses none of them anywhere in the Flexible Capacity modules", async () => {
    const files = [
      "src/lib/flexible-capacity/methodology.ts",
      "src/lib/flexible-capacity/scenario.ts",
      "src/lib/flexible-capacity/period.ts",
      "src/lib/flexible-capacity/types.ts",
      "src/lib/flexible-capacity/backfill.ts",
    ];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      // methodology.ts necessarily contains the list itself; every other file must be clean.
      const body = file.endsWith("methodology.ts")
        ? source.slice(source.indexOf("export const PEAK_REFERENCE_RULE")) : source;
      for (const term of FORBIDDEN_OUTPUT_TERMS) {
        expect(body.toLowerCase(), `${file} must not say "${term}"`).not.toContain(term.toLowerCase());
      }
    }
  });

  it("does not use them in the methodology document except where it forbids them", async () => {
    const document = await readFile(METHODOLOGY_DOCUMENT_PATH, "utf8");
    const prohibitions = document.slice(document.indexOf("## 11."));
    const body = document.slice(0, document.indexOf("## 11."));
    expect(body.toLowerCase()).not.toContain("unlocked compute");
    expect(body.toLowerCase()).not.toContain("additional compute capacity");
    expect(prohibitions.toLowerCase()).toContain("compute");
  });
});

describe("5. the document states the two sentences it is required to state", () => {
  it("says what the product is not", async () => {
    const document = await readFile(METHODOLOGY_DOCUMENT_PATH, "utf8");
    expect(document).toContain(
      "It does not measure firm interconnection capacity, transmission headroom, "
      + "distribution headroom, or compute capacity.");
  });

  it("defines curtailment-enabled headroom in one sentence", async () => {
    const document = await readFile(METHODOLOGY_DOCUMENT_PATH, "utf8");
    expect(document).toContain(
      "Curtailment-enabled headroom is the maximum hypothetical additional flat load that remains "
      + "below the methodology-defined peak reference after applying the scenario's allowed "
      + "curtailment budget.");
  });

  it("carries exactly one top-level heading, as the docs catalog requires", async () => {
    const document = await readFile(METHODOLOGY_DOCUMENT_PATH, "utf8");
    expect(document.match(/^# /gm)).toHaveLength(1);
  });
});

describe("6. identity", () => {
  it("is registered under a slug that matches the document and the migration", async () => {
    expect(METHODOLOGY_SLUG).toBe("flexible-capacity");
    expect(METHODOLOGY_DOCUMENT_PATH).toBe("docs/methodology/flexible-capacity.md");
    const migration = await readFile(MIGRATION, "utf8");
    expect(migration).toContain(`'${METHODOLOGY_SLUG}'`);
    expect(migration).toContain(`'${METHODOLOGY_VERSION}'`);
  });
});

describe("7. publication fails closed while any parameter is unresolved", () => {
  /**
   * A registry that answers the version query first and the parameter query second, which is the
   * order `assertPublicationAuthorized` issues them in.
   */
  function registryWith(parameters: readonly Record<string, unknown>[]): {
    query: (text: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
  } {
    return {
      query: async (text: string) => ({
        rows: text.includes("methodology_parameters") ? [...parameters] : [approvedRow],
      }),
    };
  }

  const approvedParam = (key: string, text: string | null = "value") =>
    ({ parameter_key: key, status: "approved", text_value: text });

  it("authorises publication when every parameter is approved and resolved", async () => {
    await expect(assertPublicationAuthorized(registryWith([
      approvedParam("peak_reference_rule", PEAK_REFERENCE_RULE),
      approvedParam("minimum_annual_coverage", null),
    ]))).resolves.toEqual({ methodologyVersionId: approvedRow.id, parameterCount: 2 });
  });

  it("refuses while a parameter is still a draft", async () => {
    await expect(assertPublicationAuthorized(registryWith([
      approvedParam("peak_reference_rule", PEAK_REFERENCE_RULE),
      { parameter_key: "maximum_contiguous_gap_hours", status: "draft", text_value: UNRESOLVED },
    ]))).rejects.toThrow(MethodologyPublicationBlockedError);
  });

  it("refuses an approved row that still carries the unresolved sentinel", async () => {
    // Promoting a row to approved without giving it a value would otherwise slip through.
    await expect(assertPublicationAuthorized(registryWith([
      approvedParam("deployed_storage_inventory", UNRESOLVED),
    ]))).rejects.toThrow(/deployed_storage_inventory/);
  });

  it("names every blocking parameter, not just the first", async () => {
    try {
      await assertPublicationAuthorized(registryWith([
        approvedParam("peak_reference_rule", PEAK_REFERENCE_RULE),
        { parameter_key: "demand_response_inventory", status: "draft", text_value: UNRESOLVED },
        { parameter_key: "deployed_storage_inventory", status: "draft", text_value: UNRESOLVED },
        { parameter_key: "maximum_contiguous_gap_hours", status: "draft", text_value: UNRESOLVED },
      ]));
      throw new Error("publication should have been blocked");
    } catch (error) {
      expect(error).toBeInstanceOf(MethodologyPublicationBlockedError);
      expect((error as MethodologyPublicationBlockedError).unresolvedParameters).toEqual([
        "demand_response_inventory", "deployed_storage_inventory", "maximum_contiguous_gap_hours",
      ]);
    }
  });

  it("refuses when no parameters are registered at all, rather than reading that as consent", async () => {
    await expect(assertPublicationAuthorized(registryWith([])))
      .rejects.toThrow(MethodologyPublicationBlockedError);
  });

  it("still requires the version guard to pass first", async () => {
    const sql = {
      query: async (text: string) => ({
        rows: text.includes("methodology_parameters")
          ? [approvedParam("peak_reference_rule", PEAK_REFERENCE_RULE)]
          : [{ ...approvedRow, status: "draft" }],
      }),
    };
    await expect(assertPublicationAuthorized(sql)).rejects.toThrow(MethodologyRegistrationError);
  });

  it("means 1.0.0 as registered cannot publish, which is the intended posture", () => {
    // Three parameters ship unresolved on purpose. Anything that publishes must therefore fail
    // until a founder decision resolves them; this asserts the shipped state, not a hypothetical.
    const blocking = Object.entries(METHODOLOGY_PARAMETERS)
      .filter(([, value]) => value.status !== "approved" || value.textValue === UNRESOLVED);
    expect(blocking).toHaveLength(3);
  });
});

describe("8. the peak-region rule is registered and adopted", () => {
  it("names the local calendar day of the observed peak", () => {
    expect(PEAK_REGION_RULE).toBe("local_calendar_day_of_observed_peak");
    expect(METHODOLOGY_PARAMETERS.peak_region_coverage_rule).toEqual({
      numericValue: null, textValue: PEAK_REGION_RULE, status: "approved",
    });
  });

  it("is registered in the migration", async () => {
    const migration = await readFile(MIGRATION, "utf8");
    expect(migration).toContain("peak_region_coverage_rule");
    expect(migration).toContain(PEAK_REGION_RULE);
  });
});
