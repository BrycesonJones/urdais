/**
 * Structured operational events for the collector runtime and the production
 * job. Events carry identifiers and counts, never credentials, request headers
 * or raw provider payloads. A sink decides where they go; the default console
 * sink prints one JSON line per event after redaction.
 */

import { redactSecrets } from "@/lib/ucpi/runtime/config";

export type UcpiEvent =
  | { type: "run_started"; runId: string; calculationDate: string; mode: string; sources: readonly string[] }
  | { type: "permission_preflight_failed"; source: string; reason: string }
  | { type: "credentials_missing"; source: string; variable: string }
  | { type: "provider_request_started"; source: string; attempt: number; url: string }
  | { type: "provider_request_succeeded"; source: string; attempt: number; status: number; bytes: number; durationMs: number }
  | { type: "provider_request_failed"; source: string; attempt: number; status: number | null; reason: string; willRetry: boolean }
  | { type: "rate_limited"; source: string; attempt: number; retryAfterMs: number | null }
  | { type: "retrieval_persisted"; source: string; retrievalId: string; purpose: string; recordCount: number; duplicateOfRetrievalId: string | null }
  | { type: "source_excluded"; source: string; observationId: string; exclusions: readonly string[] }
  | { type: "observation_eligible"; source: string; observationId: string; diagnostics: readonly string[] }
  | { type: "region_unavailable"; region: string; calculationDate: string; condition: string; participantCount: number }
  | { type: "minimum_breadth"; region: string; calculationDate: string; participantCount: number }
  | { type: "normal_breadth"; region: string; calculationDate: string; participantCount: number }
  | { type: "publication_succeeded"; region: string; calculationDate: string; publishedAt: string }
  | { type: "publication_delayed"; region: string; calculationDate: string; deadline: string; publishedAt: string | null }
  | { type: "publication_blocked"; region: string; calculationDate: string; reasons: readonly string[] }
  | { type: "correction_run"; runId: string; calculationDate: string; supersedes: string; reason: string }
  | { type: "validation_check"; source: string; check: string; outcome: "pass" | "fail" | "pending"; detail: string }
  | { type: "run_finished"; runId: string; calculationDate: string; outcome: string };

export interface EventSink {
  emit(event: UcpiEvent): void;
}

/** Collects events in memory; used by tests and returned with job results. */
export class CollectingSink implements EventSink {
  readonly events: UcpiEvent[] = [];
  emit(event: UcpiEvent): void {
    this.events.push(event);
  }
  ofType<T extends UcpiEvent["type"]>(type: T): Extract<UcpiEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<UcpiEvent, { type: T }> => e.type === type);
  }
}

/** Prints one redacted JSON line per event. */
export class ConsoleSink implements EventSink {
  constructor(private readonly write: (line: string) => void = (line) => console.log(line)) {}
  emit(event: UcpiEvent): void {
    this.write(redactSecrets(JSON.stringify({ at: new Date().toISOString(), ...event })));
  }
}

export class NullSink implements EventSink {
  emit(): void {}
}
