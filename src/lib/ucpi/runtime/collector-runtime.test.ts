import { describe, expect, it } from "vitest";

import { REGISTRY_TODAY } from "@/lib/ucpi/fixtures";
import { collectSource, PreflightError } from "@/lib/ucpi/runtime/collector-runtime";
import { MissingCredentialError, readCredential, readRunMode, readBaseUrl, redactSecrets, Credential } from "@/lib/ucpi/runtime/config";
import { HttpAuthError, MalformedResponseError, SchemaDriftError } from "@/lib/ucpi/runtime/http";
import { DuplicateRetrievalError, InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { GRANT_LAMBDA, GRANT_RUNPOD, jsonResponse, runpodInput, scriptedClient, TestClock } from "@/lib/ucpi/runtime/test-support";

const runpodBlocked = REGISTRY_TODAY.find((s) => s.slug === "runpod-gpu-types")!;

async function expectPreflight(input: ReturnType<typeof runpodInput>, code: PreflightError["code"]) {
  try {
    await collectSource(input);
    throw new Error("expected preflight to fail");
  } catch (e) {
    expect(e).toBeInstanceOf(PreflightError);
    expect((e as PreflightError).code).toBe(code);
  }
  expect((input.http as ReturnType<typeof scriptedClient>).calls).toHaveLength(0);
}

describe("credential contract", () => {
  it("fails clearly when a credential is missing, naming the variable and never a value", () => {
    expect(() => readCredential({}, "runpod")).toThrow(MissingCredentialError);
    expect(() => readCredential({ RUNPOD_API_KEY: "   " }, "runpod")).toThrow(/RUNPOD_API_KEY/);
    const c = readCredential({ LAMBDA_API_KEY: "secret-value" }, "lambda");
    expect(String(c)).toBe("[credential lambda: redacted]");
    expect(JSON.stringify({ c })).not.toContain("secret-value");
    expect(c.authorizationHeader()).toBe("Bearer secret-value");
  });

  it("defaults to simulation and rejects unknown modes", () => {
    expect(readRunMode({})).toBe("simulation");
    expect(readRunMode({ UCPI_RUN_MODE: "production" })).toBe("production");
    expect(() => readRunMode({ UCPI_RUN_MODE: "live" })).toThrow(/UCPI_RUN_MODE/);
  });

  it("requires an https base URL", () => {
    expect(readBaseUrl({ UCPI_RUNPOD_BASE_URL: "https://api.example.invalid/" }, "runpod")).toBe("https://api.example.invalid");
    expect(() => readBaseUrl({ UCPI_RUNPOD_BASE_URL: "http://plain" }, "runpod")).toThrow(/UCPI_RUNPOD_BASE_URL/);
  });

  it("redacts bearer tokens and key assignments from log text", () => {
    expect(redactSecrets("Authorization: Bearer abcdefghijklmnop")).toBe("Authorization: Bearer [redacted]");
    expect(redactSecrets('{"api_key":"abcd1234"}')).toContain("[redacted]");
    expect(new Credential("runpod", "x").toJSON()).not.toContain("x\"");
  });
});

describe("collector runtime preflight", () => {
  it("refuses a production retrieval from a blocked source before any request", async () => {
    const input = runpodInput({ registry: runpodBlocked });
    await expectPreflight(input, "COLLECTION_NOT_PERMITTED");
    expect(input.events.ofType("permission_preflight_failed")).toHaveLength(1);
  });

  it("refuses without a permission grant", async () => {
    await expectPreflight(runpodInput({ grant: null }), "PERMISSION_GRANT_MISSING");
  });

  it("refuses an expired grant", async () => {
    await expectPreflight(runpodInput({ grant: { ...GRANT_RUNPOD, effectiveTo: "2026-09-10T00:00:00Z" } }), "PERMISSION_GRANT_NOT_IN_FORCE");
  });

  it("refuses a grant that belongs to another interface", async () => {
    await expectPreflight(runpodInput({ grant: GRANT_LAMBDA }), "PERMISSION_GRANT_WRONG_INTERFACE");
  });

  it("refuses a grant that covers only one axis", async () => {
    await expectPreflight(runpodInput({ grant: { ...GRANT_RUNPOD, coversIndexUse: false } }), "PERMISSION_GRANT_INSUFFICIENT");
  });

  it("refuses when the credential is missing, and says which variable", async () => {
    const input = runpodInput({ env: {} });
    await expectPreflight(input, "CREDENTIALS_MISSING");
    expect(input.events.ofType("credentials_missing")[0]).toMatchObject({ variable: "RUNPOD_API_KEY" });
  });

  it("refuses to collect outside the calculation window", async () => {
    const clock = new TestClock("2026-09-14T00:00:00Z");
    await expectPreflight(runpodInput({ clock: clock.now, sleep: clock.sleep }), "OUTSIDE_WINDOW");
  });

  it("simulation mode needs no permission, grant or credential and persists a research retrieval", async () => {
    const input = runpodInput({ mode: "simulation", registry: runpodBlocked, grant: null, env: {} });
    const r = await collectSource(input);
    expect((input.http as ReturnType<typeof scriptedClient>).calls).toHaveLength(0);
    expect(r.retrieval.retrievalPurpose).toBe("research");
    expect(r.retrieval.permissionGrantId).toBeNull();
    expect(r.assessments.every((a) => a.exclusions.includes("COLLECTION_NOT_PERMITTED"))).toBe(true);
  });
});

describe("collector runtime retrieval", () => {
  it("performs a production retrieval under the grant, preserves the raw response and persists everything", async () => {
    const input = runpodInput();
    const r = await collectSource(input);
    expect(r.retrieval).toMatchObject({ retrievalPurpose: "production", permissionGrantId: "grant-runpod", responseStatus: 200, recordCount: 3 });
    expect(r.retrieval.responseHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.retrieval.responseBody).toEqual(input.fixtureResponse);
    const p = input.persistence as InMemoryPersistence;
    expect(p.retrievals).toHaveLength(1);
    expect(p.rawOffers).toHaveLength(3);
    expect(p.observations).toHaveLength(3);
    expect(p.assessments.filter((a) => a.p2)).toHaveLength(2);
    expect(input.events.ofType("retrieval_persisted")[0]).toMatchObject({ purpose: "production", recordCount: 3, duplicateOfRetrievalId: null });
    expect(JSON.stringify(input.events.events)).not.toContain("test-runpod-key-not-real");
  });

  it("validation mode persists a validation retrieval that carries the grant", async () => {
    const r = await collectSource(runpodInput({ mode: "validation" }));
    expect(r.retrieval.retrievalPurpose).toBe("validation");
    expect(r.retrieval.permissionGrantId).toBe("grant-runpod");
  });

  it("flags a duplicate response within the window without dropping it", async () => {
    const persistence = new InMemoryPersistence();
    const clock = new TestClock("2026-09-13T10:00:00Z");
    const base = runpodInput({ persistence, clock: clock.now, sleep: clock.sleep });
    const first = await collectSource(base);
    clock.advance(60_000);
    const second = await collectSource(runpodInput({ persistence, clock: clock.now, sleep: clock.sleep, idFactory: () => "rp-later" }));
    expect(second.duplicateOfRetrievalId).toBe(first.retrieval.id);
    expect(persistence.retrievals).toHaveLength(2);
  });

  it("refuses to persist the same retrieval twice", async () => {
    const persistence = new InMemoryPersistence();
    const input = runpodInput({ persistence });
    await collectSource(input);
    await expect(collectSource(runpodInput({ persistence, idFactory: input.idFactory }))).rejects.toBeInstanceOf(DuplicateRetrievalError);
  });

  it("surfaces an authentication failure without persisting anything", async () => {
    const input = runpodInput({ http: scriptedClient([jsonResponse({}, 401)]) });
    await expect(collectSource(input)).rejects.toBeInstanceOf(HttpAuthError);
    expect((input.persistence as InMemoryPersistence).retrievals).toHaveLength(0);
  });

  it("surfaces malformed JSON and schema drift as named errors", async () => {
    await expect(collectSource(runpodInput({ http: scriptedClient([{ status: 200, headers: {}, bodyText: "<html>", contentType: "text/html" }]) }))).rejects.toBeInstanceOf(MalformedResponseError);
    await expect(collectSource(runpodInput({ http: scriptedClient([jsonResponse({ gpus: [{ id: "x" }] })]) }))).rejects.toBeInstanceOf(SchemaDriftError);
  });

  it("recovers from a transient 500 within the window", async () => {
    const input = runpodInput({ http: scriptedClient([jsonResponse({}, 500), jsonResponse(runpodInput().fixtureResponse)]) });
    const r = await collectSource(input);
    expect(r.attempts).toBe(2);
  });
});
