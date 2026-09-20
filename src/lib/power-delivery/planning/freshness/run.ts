/** Running source checks: fetch what a checker asks for, parse it, write down what was found. */

import { createHash } from "node:crypto";

import { planningSourceChecker, CHECKABLE_PLANNING_SOURCES } from "@/lib/power-delivery/planning/freshness/discovery";
import { PlanningDiscoveryError, type DiscoveryDocument } from "@/lib/power-delivery/planning/freshness/discovery/types";
import { recordPlanningSourceCheck } from "@/lib/power-delivery/planning/freshness/store";
import { planningBlocker } from "@/lib/power-delivery/planning/ingest/registry";
import type { PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";

const USER_AGENT = "UrdaisPlanningCollector/1.0 (+https://urdais.com; power-delivery planning forecasts)";

export type DocumentFetcher = (url: string) => Promise<DiscoveryDocument>;

/**
 * A listing page is read in full; a candidate artifact is probed with HEAD, because its
 * existence is the whole answer and downloading twenty megabytes to learn it would be rude.
 */
export function httpDocumentFetcher(options?: { timeoutMs?: number }): DocumentFetcher {
  const timeoutMs = options?.timeoutMs ?? 60_000;
  return async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const probe = url.endsWith(".xlsx") || url.endsWith(".xlsb") || url.endsWith(".zip");
      const response = await fetch(url, {
        method: probe ? "HEAD" : "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "*/*" },
      });
      return { url, status: response.status, body: probe ? "" : await response.text() };
    } finally {
      clearTimeout(timer);
    }
  };
}

export type PlanningCheckOutcome =
  | { status: "checked"; source: string; discoveredVintageKey: string; checkId: string; artifactUrl: string | null }
  | { status: "check_failed"; source: string; error: string; checkId: string | null }
  | { status: "blocked"; source: string; reason: string }
  | { status: "unknown_source"; source: string };

/**
 * One source. A failure is written down rather than thrown away: a check that could not read the
 * source is itself evidence, and it is what makes the currentness resolver refuse to keep
 * calling a vintage current on the strength of older knowledge.
 */
export async function runPlanningSourceCheck(
  sql: PlanningSqlExecutor | null,
  source: string,
  options?: { fetcher?: DocumentFetcher; now?: Date },
): Promise<PlanningCheckOutcome> {
  const checker = planningSourceChecker(source);
  if (checker === null) {
    const blocker = planningBlocker(source);
    if (blocker !== null) return { status: "blocked", source, reason: blocker.reason };
    return { status: "unknown_source", source };
  }
  const now = options?.now ?? new Date();
  const fetcher = options?.fetcher ?? httpDocumentFetcher();
  const urls = checker.documents(now);
  const documents: DiscoveryDocument[] = [];
  let failure: string | null = null;

  for (const url of urls) {
    try {
      documents.push(await fetcher(url));
    } catch (error) {
      // A probe that cannot be reached is not the same as a probe that returned 404, so a
      // transport failure is recorded rather than read as "this release does not exist".
      failure = `${url}: ${error instanceof Error ? error.message : String(error)}`;
      break;
    }
  }

  const primaryUrl = urls[0] ?? checker.sourceInterfaceSlug;
  const primary = documents.find((document) => document.url === primaryUrl) ?? documents[0] ?? null;
  const evidence = {
    documents: documents.map((document) => ({
      url: document.url,
      status: document.status,
      body_sha256: document.body === "" ? null : createHash("sha256").update(document.body).digest("hex"),
    })),
  };

  if (failure !== null) {
    const checkId = sql === null ? null : await recordPlanningSourceCheck(sql, {
      sourceInterfaceSlug: checker.sourceInterfaceSlug, checkedAt: now.toISOString(),
      checkedUrl: primaryUrl, responseStatus: primary?.status ?? null, outcome: "failed",
      discovered: null, artifactHash: null, error: failure, evidence,
    });
    return { status: "check_failed", source, error: failure, checkId };
  }

  try {
    const discovered = checker.parse(documents);
    const checkId = sql === null ? "" : await recordPlanningSourceCheck(sql, {
      sourceInterfaceSlug: checker.sourceInterfaceSlug, checkedAt: now.toISOString(),
      checkedUrl: primaryUrl, responseStatus: primary?.status ?? null, outcome: "succeeded",
      discovered, artifactHash: null, error: null,
      evidence: { ...evidence, ...discovered.evidence },
    });
    return {
      status: "checked", source, discoveredVintageKey: discovered.nativeVintageKey,
      checkId, artifactUrl: discovered.artifactUrl,
    };
  } catch (error) {
    const message = error instanceof PlanningDiscoveryError || error instanceof Error
      ? error.message : String(error);
    const checkId = sql === null ? null : await recordPlanningSourceCheck(sql, {
      sourceInterfaceSlug: checker.sourceInterfaceSlug, checkedAt: now.toISOString(),
      checkedUrl: primaryUrl, responseStatus: primary?.status ?? null, outcome: "failed",
      discovered: null, artifactHash: null, error: message, evidence,
    });
    return { status: "check_failed", source, error: message, checkId };
  }
}

export async function runPlanningSourceChecks(
  sql: PlanningSqlExecutor | null,
  sources: readonly string[],
  options?: { fetcher?: DocumentFetcher; now?: Date },
): Promise<PlanningCheckOutcome[]> {
  const outcomes: PlanningCheckOutcome[] = [];
  // Sequential and independent: one publisher's reorganisation must not stop the others.
  for (const source of sources) outcomes.push(await runPlanningSourceCheck(sql, source, options));
  return outcomes;
}

export { CHECKABLE_PLANNING_SOURCES };
