/**
 * The ingestion runner.
 *
 * Each source retrieves, parses and persists inside its own transaction, so a publisher who has
 * reorganised a feed fails alone and leaves the other market untouched. Artifacts within a source
 * are processed one at a time and streamed rather than accumulated, because a NYISO monthly archive
 * expands to roughly 160,000 observations and holding a year of them in memory to write at the end
 * would be a needless way to fail.
 */

import { ercotAdapter } from "@/lib/transmission-headroom/ingest/adapters/ercot";
import { nyisoAdapter } from "@/lib/transmission-headroom/ingest/adapters/nyiso";
import {
  persistTransmissionExtraction, type TransmissionWriteResult,
} from "@/lib/transmission-headroom/ingest/store";
import type { TransmissionAdapter } from "@/lib/transmission-headroom/ingest/types";
import type { CapacitySqlExecutor } from "@/lib/power-delivery/capacity/read";
import { httpArtifactFetcher, sha256 } from "@/lib/power-delivery/planning/ingest/artifact";
import type { RetrievedArtifact } from "@/lib/power-delivery/planning/ingest/types";

export const TRANSMISSION_ADAPTERS: Record<string, TransmissionAdapter> = {
  nyiso: nyisoAdapter,
  ercot: ercotAdapter,
};

export const INGESTIBLE_TRANSMISSION_SOURCES = Object.keys(TRANSMISSION_ADAPTERS);

export const TRANSMISSION_COLLECTOR = "urdais-transmission-headroom-v1";

export type SourceOutcome = {
  source: string;
  status: "ingested" | "failed";
  artifactsDiscovered: number;
  artifactsRetrieved: number;
  artifactsAlreadyHeld: number;
  observationsParsed: number;
  writes: TransmissionWriteResult[];
  totals: {
    rawRecords: number; entities: number; flows: number; limits: number;
    margins: number; deferrals: number; statements: number;
  };
  marginsByState: Record<string, number>;
  retrievalMs: number;
  parseMs: number;
  persistMs: number;
  error?: string;
};

export type RunReport = {
  ok: boolean;
  startedAt: string;
  completedAt: string;
  outcomes: SourceOutcome[];
  runtimeMs: number;
  note: string;
};

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function retrieve(url: string, label: string): Promise<RetrievedArtifact> {
  const startedAt = new Date().toISOString();
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  const body = Buffer.from(await response.arrayBuffer());
  return {
    label, url, retrievedAt: startedAt, status: response.status,
    contentType: response.headers.get("content-type"), byteLength: body.byteLength,
    sha256: sha256(body), body,
  };
}

export async function runTransmissionIngestion(
  sql: CapacitySqlExecutor | null,
  sources: readonly string[],
  options: {
    dryRun?: boolean;
    window?: { start: Date; end: Date };
    limit?: number;
    implausibleAboveMw?: number;
  } = {},
): Promise<RunReport> {
  const startedAt = new Date();
  const outcomes: SourceOutcome[] = [];

  for (const key of sources) {
    const adapter = TRANSMISSION_ADAPTERS[key];
    if (adapter === undefined) {
      outcomes.push({
        source: key, status: "failed", artifactsDiscovered: 0, artifactsRetrieved: 0,
        artifactsAlreadyHeld: 0, observationsParsed: 0, writes: [],
        totals: { rawRecords: 0, entities: 0, flows: 0, limits: 0, margins: 0, deferrals: 0, statements: 0 },
        marginsByState: {}, retrievalMs: 0, parseMs: 0, persistMs: 0,
        error: `no adapter named ${key}`,
      });
      continue;
    }

    const outcome: SourceOutcome = {
      source: key, status: "ingested", artifactsDiscovered: 0, artifactsRetrieved: 0,
      artifactsAlreadyHeld: 0, observationsParsed: 0, writes: [],
      totals: { rawRecords: 0, entities: 0, flows: 0, limits: 0, margins: 0, deferrals: 0, statements: 0 },
      marginsByState: {}, retrievalMs: 0, parseMs: 0, persistMs: 0,
    };

    try {
      const refs = await adapter.discover({
        ...(options.window === undefined ? {} : { window: options.window }),
        ...(options.limit === undefined ? {} : { limit: options.limit }),
        fetchText,
      });
      outcome.artifactsDiscovered = refs.length;

      for (const ref of refs) {
        const retrievalStart = Date.now();
        const artifact = await retrieve(ref.url, ref.nativeKey);
        outcome.retrievalMs += Date.now() - retrievalStart;
        outcome.artifactsRetrieved += 1;

        const parseStart = Date.now();
        const extraction = adapter.parse(artifact, ref);
        outcome.parseMs += Date.now() - parseStart;
        outcome.observationsParsed += extraction.observations.length;

        if (options.dryRun === true || sql === null) continue;

        const write = await persistTransmissionExtraction(
          sql, adapter, artifact, ref, extraction, TRANSMISSION_COLLECTOR,
          options.implausibleAboveMw === undefined
            ? {} : { implausibleAboveMw: options.implausibleAboveMw },
        );
        outcome.writes.push(write);
        outcome.persistMs += write.persistMs;
        if (write.snapshot === "existing") outcome.artifactsAlreadyHeld += 1;
        outcome.totals.rawRecords += write.rawRecordsInserted;
        outcome.totals.entities += write.entitiesInserted;
        outcome.totals.flows += write.flowObservations;
        outcome.totals.limits += write.limitObservations;
        outcome.totals.margins += write.marginsInserted;
        outcome.totals.deferrals += write.deferralsRecorded;
        outcome.totals.statements += write.statements;
        for (const [state, n] of Object.entries(write.marginsByState)) {
          outcome.marginsByState[state] = (outcome.marginsByState[state] ?? 0) + n;
        }
      }
    } catch (error) {
      outcome.status = "failed";
      outcome.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
    outcomes.push(outcome);
  }

  const completedAt = new Date();
  return {
    ok: outcomes.every((outcome) => outcome.status === "ingested"),
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    outcomes,
    runtimeMs: completedAt.getTime() - startedAt.getTime(),
    note: "A margin is a distance to an operating limit on one monitored element or interface. "
      + "It is never a network total, and NYISO interface margins and ERCOT constraint margins "
      + "describe different populations and are never combined.",
  };
}

export { httpArtifactFetcher };
