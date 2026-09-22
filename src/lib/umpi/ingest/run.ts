/**
 * Orchestration: resolve the identity, fetch, parse, persist — one source at a time.
 *
 * A dry run stops after parsing. It performs the network request and the full validation, and
 * writes **nothing at all**: no observation, no run row, and no retrieval row. That is a
 * deliberate choice rather than the only possible one — a retrieval record is an audit fact and
 * could defensibly be kept — but a dry run that writes to the database is one a person will
 * stop trusting, and the audit value of a rehearsal is low.
 */

import { credentialPresence, requireCredential, type UmpiCredentialName } from "../config";
import { productionIdentityFor } from "../identity";
import { isReferenceMonth } from "../reference-month";
import type { ReferenceMonth, UmpiSeriesCode } from "../types";
import { assertBokIdentity, createBokAdapter } from "./bok";
import { assertCustomsIdentity, createCustomsAdapter } from "./customs";
import { UmpiConfigurationError, UmpiIngestError } from "./errors";
import type { HttpOptions } from "./http";
import { persistUmpiFetch, resolveUmpiLineage, type UmpiSqlExecutor, type UmpiWriteResult } from "./store";
import type { UmpiSourceAdapter } from "./types";

export type UmpiSourceKey = "bok" | "customs";

export const UMPI_SOURCES: Readonly<Record<UmpiSourceKey, { seriesCode: UmpiSeriesCode; credentialEnv: UmpiCredentialName }>> = {
  bok: { seriesCode: "UMPI-KR-DRAM-PPI", credentialEnv: "UMPI_ECOS_API_KEY" },
  customs: { seriesCode: "UMPI-KR-DRAM-EXPORT-UV", credentialEnv: "UMPI_DATA_GO_KR_SERVICE_KEY" },
} as const;

export function adapterFor(source: UmpiSourceKey, options: HttpOptions = {}): UmpiSourceAdapter<string> {
  return source === "bok" ? createBokAdapter(options) : createCustomsAdapter(options);
}

export type UmpiRunOptions = {
  fromMonth: ReferenceMonth;
  toMonth: ReferenceMonth;
  dryRun?: boolean;
  runKind?: string;
  env?: NodeJS.ProcessEnv;
  http?: HttpOptions;
  /** Injected in tests so a fixture can stand in for the network. */
  adapter?: UmpiSourceAdapter<string>;
};

export type UmpiRunOutcome =
  | ({ status: "ingested"; source: UmpiSourceKey } & UmpiWriteResult)
  | {
      status: "parsed";
      source: UmpiSourceKey;
      rowsReceived: number;
      rowsAdmitted: number;
      rowsRejected: number;
      payloadDigest: string;
      wrote: "nothing";
    }
  | { status: "failed"; source: UmpiSourceKey; kind: string; error: string };

function validateRange(fromMonth: string, toMonth: string): void {
  if (!isReferenceMonth(fromMonth)) throw new UmpiConfigurationError(`--from ${JSON.stringify(fromMonth)} is not YYYY-MM`);
  if (!isReferenceMonth(toMonth)) throw new UmpiConfigurationError(`--to ${JSON.stringify(toMonth)} is not YYYY-MM`);
  // Explicit bounds only. There is no "fetch everything" default, because a first mistake
  // against a government API should be small.
  if (fromMonth > toMonth) throw new UmpiConfigurationError(`--from ${fromMonth} is after --to ${toMonth}`);
}

export async function runUmpiSource(
  sql: UmpiSqlExecutor | null,
  source: UmpiSourceKey,
  options: UmpiRunOptions,
): Promise<UmpiRunOutcome> {
  const env = options.env ?? process.env;
  const { fromMonth, toMonth } = options;
  try {
    validateRange(fromMonth, toMonth);

    const { seriesCode, credentialEnv } = UMPI_SOURCES[source];
    const identity = productionIdentityFor(seriesCode);
    // Belt and braces: the identity guards refuse a drifted series before a request is built.
    if (source === "bok") assertBokIdentity(identity);
    else assertCustomsIdentity(identity);

    // `requireCredential` is deliberately dependency-free so the CLI can import it, so its
    // error is a plain one. Typing it here is what lets an operator see "configuration" rather
    // than "unknown" when a key is simply absent.
    let apiKey: string;
    try {
      apiKey = requireCredential(credentialEnv, env);
    } catch (error) {
      throw new UmpiConfigurationError(error instanceof Error ? error.message : String(error));
    }
    const adapter = options.adapter ?? adapterFor(source, options.http);
    const fetched = await adapter.fetch({ identity, range: { fromMonth, toMonth }, apiKey });

    if (options.dryRun === true || sql === null) {
      return {
        status: "parsed",
        source,
        rowsReceived: fetched.rows.length,
        rowsAdmitted: fetched.rows.filter((row) => row.state === "admitted").length,
        rowsRejected: fetched.rows.filter((row) => row.state === "rejected").length,
        payloadDigest: fetched.payloadDigest,
        wrote: "nothing",
      };
    }

    const lineage = await resolveUmpiLineage(sql, seriesCode);
    const written = await persistUmpiFetch(sql, lineage, fetched, {
      fromMonth,
      toMonth,
      runKind: options.runKind,
      // Stable per source and range, so a retried run is the same run rather than a second one.
      idempotencyKey: `umpi:${source}:${fromMonth}:${toMonth}:${fetched.payloadDigest}`,
    });
    return { status: "ingested", source, ...written };
  } catch (error) {
    return {
      status: "failed",
      source,
      kind: error instanceof UmpiIngestError ? error.kind : "unknown",
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  }
}

/** What an operator sees before running anything: which keys are configured, without values. */
export function umpiCredentialReport(env: NodeJS.ProcessEnv = process.env): Record<string, boolean> {
  return credentialPresence(env);
}
