/**
 * The production runtime around a provider adapter:
 *
 *   preflight (mode, permission gate, grant in force, credential present, inside the window)
 *   -> request under the HTTP policy, retries bounded by the cutoff
 *   -> raw response preserved and hashed, retrieval persisted with its permission reference
 *   -> parse -> normalize -> eligibility -> persisted
 *
 * It refuses to perform a production or validation retrieval unless the source
 * is production-approved on both terms axes, a grant is in force, and the
 * credential is present. Simulation mode never touches the network and takes a
 * fixture response instead. The adapter itself is unchanged: it builds
 * requests, parses and normalizes, nothing else.
 */

import type { NormalizationContext, ProviderAdapter } from "@/lib/ucpi/collector";
import { calculationWindow } from "@/lib/ucpi/calculation-window";
import type { EligibilityAssessment, NormalizedObservation, RawOffer, Retrieval } from "@/lib/ucpi/domain";
import { assessEligibility } from "@/lib/ucpi/eligibility";
import { productionCollectionPermitted, type SourceRegistryState } from "@/lib/ucpi/permission-gate";
import { hasCredential, readCredential, type EnvRecord, type ProviderSlug, type RunMode } from "@/lib/ucpi/runtime/config";
import type { EventSink } from "@/lib/ucpi/runtime/events";
import { executeWithPolicy, parseJsonBody, type Clock, type HttpClient, type HttpPolicy, type Random, type Sleep } from "@/lib/ucpi/runtime/http";
import { sha256Hex, type Persistence, type RetrievalRow } from "@/lib/ucpi/runtime/persistence";

/** A permission basis as recorded in reference.permission_grants. */
export type PermissionGrant = {
  id: string;
  sourceInterfaceSlug: string;
  grantKind: "provider_terms" | "written_permission" | "agreement" | "order";
  reference: string;
  coversCollection: boolean;
  coversIndexUse: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export class PreflightError extends Error {
  readonly code: "COLLECTION_NOT_PERMITTED" | "PERMISSION_GRANT_MISSING" | "PERMISSION_GRANT_NOT_IN_FORCE" | "PERMISSION_GRANT_WRONG_INTERFACE" | "PERMISSION_GRANT_INSUFFICIENT" | "CREDENTIALS_MISSING" | "OUTSIDE_WINDOW" | "MODE_MISMATCH";
  constructor(code: PreflightError["code"], message: string) {
    super(message);
    this.name = "PreflightError";
    this.code = code;
  }
}

export type SourceRuntimeInput<TParams, TResponse, TCompanion> = {
  adapter: ProviderAdapter<TParams, TResponse, TCompanion>;
  providerSlug: ProviderSlug;
  params: TParams;
  companion: TCompanion;
  mode: RunMode;
  calculationDate: string;
  registry: SourceRegistryState;
  grant: PermissionGrant | null;
  env: EnvRecord;
  http: HttpClient;
  policy?: Partial<HttpPolicy>;
  clock: Clock;
  sleep: Sleep;
  random?: Random;
  persistence: Persistence;
  events: EventSink;
  context: NormalizationContext;
  /** Validates the parsed JSON against the documented schema; throws SchemaDriftError. */
  validateResponse: (json: unknown) => TResponse;
  /** Simulation only: the response to use instead of the network. */
  fixtureResponse?: TResponse;
  collectorIdentity: string;
  idFactory: () => string;
};

export type SourceCollectionResult = {
  retrieval: RetrievalRow;
  rawOffers: RawOffer[];
  observations: NormalizedObservation[];
  assessments: EligibilityAssessment[];
  duplicateOfRetrievalId: string | null;
  attempts: number;
};

/** Everything that must be true before a live request is even constructed. */
export function preflight(input: {
  mode: RunMode;
  sourceInterfaceSlug: string;
  registry: SourceRegistryState;
  grant: PermissionGrant | null;
  env: EnvRecord;
  providerSlug: ProviderSlug;
  now: Date;
  calculationDate: string;
  events: EventSink;
}): void {
  const source = input.sourceInterfaceSlug;
  if (input.mode === "simulation") return;

  const gate = productionCollectionPermitted(input.registry);
  if (!gate.permitted) {
    input.events.emit({ type: "permission_preflight_failed", source, reason: gate.detail });
    throw new PreflightError("COLLECTION_NOT_PERMITTED", gate.detail);
  }
  if (input.grant === null) {
    input.events.emit({ type: "permission_preflight_failed", source, reason: "no permission grant" });
    throw new PreflightError("PERMISSION_GRANT_MISSING", `${source}: a ${input.mode} retrieval requires a recorded permission grant`);
  }
  if (input.grant.sourceInterfaceSlug !== source) {
    input.events.emit({ type: "permission_preflight_failed", source, reason: "grant belongs to another interface" });
    throw new PreflightError("PERMISSION_GRANT_WRONG_INTERFACE", `grant ${input.grant.id} belongs to ${input.grant.sourceInterfaceSlug}, not ${source}`);
  }
  if (!input.grant.coversCollection || !input.grant.coversIndexUse) {
    input.events.emit({ type: "permission_preflight_failed", source, reason: "grant does not cover both axes" });
    throw new PreflightError("PERMISSION_GRANT_INSUFFICIENT", `grant ${input.grant.id} must cover collection and index use`);
  }
  const t = input.now.getTime();
  if (t < Date.parse(input.grant.effectiveFrom) || (input.grant.effectiveTo !== null && t >= Date.parse(input.grant.effectiveTo))) {
    input.events.emit({ type: "permission_preflight_failed", source, reason: "grant not in force" });
    throw new PreflightError("PERMISSION_GRANT_NOT_IN_FORCE", `grant ${input.grant.id} is not in force at ${input.now.toISOString()}`);
  }
  if (!hasCredential(input.env, input.providerSlug)) {
    const variable = readCredentialVariable(input.providerSlug);
    input.events.emit({ type: "credentials_missing", source, variable });
    throw new PreflightError("CREDENTIALS_MISSING", `${source}: ${variable} is not set`);
  }
  const window = calculationWindow(input.calculationDate);
  if (t < Date.parse(window.windowStart) || t >= Date.parse(window.cutoff)) {
    throw new PreflightError("OUTSIDE_WINDOW", `${source}: ${input.now.toISOString()} is outside the collection window for ${input.calculationDate}`);
  }
}

function readCredentialVariable(provider: ProviderSlug): string {
  return provider === "runpod" ? "RUNPOD_API_KEY" : "LAMBDA_API_KEY";
}

export async function collectSource<TParams, TResponse, TCompanion>(input: SourceRuntimeInput<TParams, TResponse, TCompanion>): Promise<SourceCollectionResult> {
  const source = input.adapter.sourceInterfaceSlug;
  const now = input.clock();
  preflight({ ...input, sourceInterfaceSlug: source, now });

  const request = input.adapter.buildRequest(input.params);
  const window = calculationWindow(input.calculationDate);
  let response: TResponse;
  let requestedAt: Date;
  let completedAt: Date;
  let attempts = 0;
  let bodyText: string;
  let status: number;

  if (input.mode === "simulation") {
    if (input.fixtureResponse === undefined) throw new PreflightError("MODE_MISMATCH", "simulation mode requires a fixture response");
    response = input.fixtureResponse;
    requestedAt = now;
    completedAt = now;
    bodyText = JSON.stringify(response);
    status = 200;
  } else {
    const credential = readCredential(input.env, input.providerSlug);
    const out = await executeWithPolicy({
      request,
      credential,
      client: input.http,
      policy: input.policy,
      deadline: new Date(window.cutoff),
      clock: input.clock,
      sleep: input.sleep,
      random: input.random,
      events: input.events,
      source,
    });
    response = input.validateResponse(parseJsonBody(out.response));
    requestedAt = out.requestedAt;
    completedAt = out.completedAt;
    attempts = out.attempts;
    bodyText = out.response.bodyText;
    status = out.response.status;
  }

  const responseHash = sha256Hex(bodyText);
  const duplicateOfRetrievalId = await input.persistence.findRetrievalByHash(source, responseHash, input.calculationDate);
  const retrieval: RetrievalRow = {
    id: input.idFactory(),
    sourceInterfaceSlug: source,
    requestedAt: requestedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    responseStatus: status,
    request,
    enumerationAssessment: "complete",
    retrievalPurpose: input.mode === "production" ? "production" : input.mode === "validation" ? "validation" : "research",
    permissionGrantId: input.grant?.id ?? null,
    responseHash,
    responseBody: response,
    responseByteLength: bodyText.length,
    recordCount: null,
    collectorIdentity: input.collectorIdentity,
    calculationDate: input.calculationDate,
  };

  const rawOffers = input.adapter.parse(retrieval as Retrieval, response, input.companion);
  retrieval.recordCount = rawOffers.length;
  const observations = rawOffers.map((raw) => input.adapter.normalize(raw, retrieval as Retrieval, input.context));
  const registry = new Map([[source, input.registry]]);
  const assessments = observations.map((o) => assessEligibility(o, { calculationDate: input.calculationDate, registry }));

  await input.persistence.transaction(async () => {
    await input.persistence.insertRetrieval(retrieval);
    await input.persistence.insertRawOffers(rawOffers);
    await input.persistence.insertNormalizedObservations(observations);
    await input.persistence.insertAssessments(assessments);
  });

  input.events.emit({ type: "retrieval_persisted", source, retrievalId: retrieval.id, purpose: retrieval.retrievalPurpose, recordCount: rawOffers.length, duplicateOfRetrievalId });
  for (const a of assessments) {
    if (a.p2) input.events.emit({ type: "observation_eligible", source, observationId: a.observationId, diagnostics: a.diagnostics });
    else input.events.emit({ type: "source_excluded", source, observationId: a.observationId, exclusions: a.exclusions });
  }

  return { retrieval, rawOffers, observations, assessments, duplicateOfRetrievalId, attempts };
}
