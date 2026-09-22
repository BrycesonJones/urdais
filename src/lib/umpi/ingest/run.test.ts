import { describe, expect, it } from "vitest";

import { productionIdentityFor } from "../identity";
import { parseEcosPayload } from "./bok";
import { BOK_THREE_MONTHS } from "./fixtures/bok";
import { runUmpiSource, umpiCredentialReport, type UmpiRunOptions } from "./run";
import type { SourceFetchResult, UmpiSourceAdapter } from "./types";

const identity = productionIdentityFor("UMPI-KR-DRAM-PPI");

function fixtureAdapter(payload: string): UmpiSourceAdapter<string> {
  return {
    name: "fixture",
    seriesCode: "UMPI-KR-DRAM-PPI",
    identityKind: "bok_ecos_series",
    credentialEnv: "UMPI_ECOS_API_KEY",
    parse: parseEcosPayload,
    async fetch(): Promise<SourceFetchResult> {
      const parsed = parseEcosPayload({ identity, payload });
      return {
        ...parsed,
        payloadDigest: "b".repeat(64),
        enumerationAssessment: "complete" as const,
        enumerationEvidence: "fixture",
        retrievedAt: "2026-09-22T00:00:00.000Z",
        requestUrl: "https://ecos.bok.or.kr/api/StatisticSearch/REDACTED/json/kr/1/1000/404Y016/M/202606/202608/30911201AA",
        requestParameters: { statCode: "404Y016" },
        httpStatus: 200,
        contentType: "application/json",
        responseByteLength: payload.length,
      };
    },
  };
}

const withKey = { UMPI_ECOS_API_KEY: "test-key" } as unknown as NodeJS.ProcessEnv;
const base: Omit<UmpiRunOptions, "env"> = { fromMonth: "2026-06", toMonth: "2026-08" };

describe("run orchestration", () => {
  it("fails with a configuration error when the key is absent, before any request", async () => {
    const outcome = await runUmpiSource(null, "bok", { ...base, env: {} as unknown as NodeJS.ProcessEnv });
    expect(outcome).toMatchObject({ status: "failed", kind: "configuration" });
    expect((outcome as { error: string }).error).toContain("UMPI_ECOS_API_KEY");
  });

  it("validates the month range and refuses a reversed one", async () => {
    const reversed = await runUmpiSource(null, "bok", { fromMonth: "2026-08", toMonth: "2026-06", env: withKey });
    expect(reversed).toMatchObject({ status: "failed", kind: "configuration" });
    const malformed = await runUmpiSource(null, "bok", { fromMonth: "2026-6", toMonth: "2026-08", env: withKey });
    expect(malformed).toMatchObject({ status: "failed", kind: "configuration" });
  });

  it("dry run parses and writes nothing at all", async () => {
    const outcome = await runUmpiSource(null, "bok", {
      ...base,
      env: withKey,
      dryRun: true,
      adapter: fixtureAdapter(BOK_THREE_MONTHS),
    });
    expect(outcome).toMatchObject({ status: "parsed", rowsAdmitted: 3, rowsRejected: 0, wrote: "nothing" });
  });

  it("dry run with a database available still writes nothing", async () => {
    let queried = 0;
    const sql = { query: async () => { queried += 1; return { rows: [] }; } };
    const outcome = await runUmpiSource(sql, "bok", {
      ...base,
      env: withKey,
      dryRun: true,
      adapter: fixtureAdapter(BOK_THREE_MONTHS),
    });
    expect(outcome.status).toBe("parsed");
    expect(queried).toBe(0);
  });

  it("reports credential presence without values", () => {
    const report = umpiCredentialReport({ UMPI_ECOS_API_KEY: "x" } as unknown as NodeJS.ProcessEnv);
    expect(report).toEqual({ UMPI_ECOS_API_KEY: true, UMPI_DATA_GO_KR_SERVICE_KEY: false });
    expect(JSON.stringify(report)).not.toContain("x");
  });
});
