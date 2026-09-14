/**
 * Test doubles for the runtime: a scripted HTTP client, a controllable clock,
 * a recording sleep, and shared fixtures wired into runtime inputs. Test-only;
 * nothing here reaches a network.
 */

import { lambdaAdapter, type LambdaInstanceTypesResponse } from "@/lib/ucpi/adapters/lambda";
import { runpodAdapter, type RunpodCatalogResponse, type RunpodGpuTypeDetails } from "@/lib/ucpi/adapters/runpod";
import { LAMBDA_INSTANCE_TYPES_FIXTURE, LAMBDA_REGIONS, normalizationContext, permitted, RUNPOD_CATALOG_FIXTURE, RUNPOD_DETAILS_FIXTURE } from "@/lib/ucpi/fixtures";
import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import type { PermissionGrant, SourceRuntimeInput } from "@/lib/ucpi/runtime/collector-runtime";
import type { EnvRecord } from "@/lib/ucpi/runtime/config";
import { CollectingSink } from "@/lib/ucpi/runtime/events";
import type { HttpClient, HttpResponse } from "@/lib/ucpi/runtime/http";
import { HttpTimeoutError } from "@/lib/ucpi/runtime/http";
import { InMemoryPersistence } from "@/lib/ucpi/runtime/persistence";
import { validateLambdaInstanceTypes, validateRunpodCatalog } from "@/lib/ucpi/runtime/schema-validation";

export type Scripted = HttpResponse | Error | "timeout";

export function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): HttpResponse {
  return { status, headers, bodyText: JSON.stringify(body), contentType: "application/json" };
}

/** Returns the scripted responses in order; records every request it saw. */
export function scriptedClient(script: readonly Scripted[]): HttpClient & { calls: { url: string; headers: Record<string, string> }[] } {
  let i = 0;
  const calls: { url: string; headers: Record<string, string> }[] = [];
  return {
    calls,
    async send(input) {
      calls.push({ url: input.url, headers: { ...input.headers } });
      const next = script[i++];
      if (next === undefined) throw new Error("scripted client ran out of responses");
      if (next === "timeout") throw new HttpTimeoutError(input.url, input.timeoutMs);
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

export class TestClock {
  private t: number;
  constructor(iso: string) {
    this.t = Date.parse(iso);
  }
  now = (): Date => new Date(this.t);
  advance(ms: number): void {
    this.t += ms;
  }
  set(iso: string): void {
    this.t = Date.parse(iso);
  }
  /** A sleep that advances the clock instead of waiting. */
  sleep = async (ms: number): Promise<void> => {
    this.t += ms;
  };
}

let idCounter = 0;
/** Globally unique across a test file so ids never collide between runs that share persistence. */
export function sequentialIds(prefix = "id"): () => string {
  return () => `${prefix}-${++idCounter}`;
}

export const GRANT_RUNPOD: PermissionGrant = { id: "grant-runpod", sourceInterfaceSlug: "runpod-gpu-types", grantKind: "written_permission", reference: "test", coversCollection: true, coversIndexUse: true, effectiveFrom: "2026-09-01T00:00:00Z", effectiveTo: null };
export const GRANT_LAMBDA: PermissionGrant = { id: "grant-lambda", sourceInterfaceSlug: "lambda-instance-types", grantKind: "written_permission", reference: "test", coversCollection: true, coversIndexUse: true, effectiveFrom: "2026-09-01T00:00:00Z", effectiveTo: null };

export const ENV_WITH_KEYS: EnvRecord = { RUNPOD_API_KEY: "test-runpod-key-not-real", LAMBDA_API_KEY: "test-lambda-key-not-real" };

type RunpodRuntimeInput = SourceRuntimeInput<unknown, RunpodCatalogResponse, ReadonlyMap<string, RunpodGpuTypeDetails>>;
type LambdaRuntimeInput = SourceRuntimeInput<unknown, LambdaInstanceTypesResponse, typeof LAMBDA_REGIONS>;

export function runpodInput(over: Partial<RunpodRuntimeInput> & { registry?: SourceRegistryState } = {}): RunpodRuntimeInput & { events: CollectingSink } {
  const clock = new TestClock("2026-09-13T10:00:00Z");
  const events = (over.events as CollectingSink | undefined) ?? new CollectingSink();
  return {
    adapter: runpodAdapter,
    providerSlug: "runpod" as const,
    params: { baseUrl: "https://example.invalid", countryCode: "US", cloud: "COMMUNITY" as const },
    companion: RUNPOD_DETAILS_FIXTURE,
    mode: "production" as const,
    calculationDate: "2026-09-13",
    registry: permitted("runpod-gpu-types"),
    grant: GRANT_RUNPOD,
    env: ENV_WITH_KEYS,
    http: scriptedClient([jsonResponse(RUNPOD_CATALOG_FIXTURE)]),
    clock: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    persistence: new InMemoryPersistence(),
    context: normalizationContext(),
    validateResponse: validateRunpodCatalog,
    fixtureResponse: RUNPOD_CATALOG_FIXTURE,
    collectorIdentity: "test",
    idFactory: sequentialIds("rp"),
    ...over,
    events,
  };
}

export function lambdaInput(over: Partial<LambdaRuntimeInput> = {}): LambdaRuntimeInput & { events: CollectingSink } {
  const clock = new TestClock("2026-09-13T10:00:00Z");
  const events = (over.events as CollectingSink | undefined) ?? new CollectingSink();
  return {
    adapter: lambdaAdapter,
    providerSlug: "lambda" as const,
    params: { baseUrl: "https://example.invalid" },
    companion: LAMBDA_REGIONS,
    mode: "production" as const,
    calculationDate: "2026-09-13",
    registry: permitted("lambda-instance-types"),
    grant: GRANT_LAMBDA,
    env: ENV_WITH_KEYS,
    http: scriptedClient([jsonResponse(LAMBDA_INSTANCE_TYPES_FIXTURE)]),
    clock: clock.now,
    sleep: clock.sleep,
    random: () => 0,
    persistence: new InMemoryPersistence(),
    context: normalizationContext(),
    validateResponse: validateLambdaInstanceTypes,
    fixtureResponse: LAMBDA_INSTANCE_TYPES_FIXTURE,
    collectorIdentity: "test",
    idFactory: sequentialIds("lb"),
    ...over,
    events,
  };
}
