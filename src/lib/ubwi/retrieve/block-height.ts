/**
 * Read the Bitcoin chain tip live, from two independent sources that must agree exactly.
 *
 * Under methodology 1.2.0 the height is the **sole input to the supply quantity**: nobody
 * supplies Urdais with a BTC supply figure any more, the schedule is recomputed from this
 * integer, and a height that is wrong by one block is a supply that is wrong by 3.125 BTC
 * with no downstream check able to notice. That is why two sources are read and why the
 * rule is exact agreement rather than a tolerance.
 *
 * No averaging, no "take the higher", no bounded window. Two honest observers of the same
 * chain either report the same integer or one of them is lagging, and a lagging observer is
 * a reason to refuse the run rather than to interpolate. A refused day simply has no point.
 *
 * ## The rights position, which is deliberately narrow
 *
 * Blockchain.com's retained terms grant *retrieval*. What they do not grant is the
 * commercial derived-index publication of a **supply dataset**, which is exactly the
 * dependency methodology 1.2.0 removed. Reading the chain tip for cross-verification is a
 * different act from taking a supply quantity on a provider's authority: the tip is a
 * consensus fact, identical for every honest observer, and Urdais derives nothing from
 * either endpoint except one integer. No supply figure is reintroduced from any provider
 * here or anywhere else.
 *
 * The provenance sentences below are frozen onto every published observation and say
 * precisely that. They are not decoration; they are the record of why each read is
 * permitted.
 */

import type { BlockHeightObservation } from "../types";
import { NumeratorRetrievalError } from "./problems";

/** One request for one integer. Injected, so the disagreement and failure paths are testable. */
export type TextFetcher = (url: string) => Promise<string>;

export const BLOCK_HEIGHT_TIMEOUT_MS = 12_000;

/**
 * The two independent chain-tip sources, with the provenance frozen onto every observation.
 *
 * These are the same two endpoints the first production observation was captured from, kept
 * rather than re-chosen: changing which sources establish the height is a provenance change,
 * not a configuration edit.
 */
export const BLOCK_HEIGHT_SOURCES = [
  {
    source: "mempool.space/api/blocks/tip/height",
    url: "https://mempool.space/api/blocks/tip/height",
    provenance:
      "mempool.space's public REST API, read for one integer. The height is a consensus fact, not a dataset: it is identical for every honest observer of the chain and Urdais derives nothing from this endpoint except that integer.",
  },
  {
    source: "blockchain.info/q/getblockcount",
    url: "https://blockchain.info/q/getblockcount",
    provenance:
      "Blockchain.com's Explorer query interface, read for one integer. Blockchain.com's retained terms grant retrieval outright; what they do not grant is the derived-index publication of a *supply dataset*, which is why methodology 1.2.0 no longer reads a supply figure from here. Reading the chain tip for cross-verification is a different act from taking a supply quantity on the provider's authority.",
  },
] as const;

/** The default fetcher: one request, an abort-based timeout, no retry, body as text. */
export function fetchTextSource(timeoutMs: number = BLOCK_HEIGHT_TIMEOUT_MS): TextFetcher {
  return async (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "text/plain" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      const detail =
        error instanceof Error && error.name === "AbortError"
          ? `no response within ${timeoutMs} ms`
          : error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
      throw new Error(`${url}: ${detail}`);
    } finally {
      clearTimeout(timer);
    }
  };
}

export type BlockHeightRetrieval = {
  blockHeight: number;
  /** Per-source evidence, in source order, frozen onto the published observation. */
  observations: BlockHeightObservation[];
  /** The source names, in the shape `BtcMarketObservation.heightSources` expects. */
  heightSources: string[];
};

/**
 * Read the tip from every configured source and require exact agreement.
 *
 * The raw body is retained alongside the parsed integer because the numerator's own
 * `checkBlockHeight` re-parses it and compares. That is what catches a stored evidence row
 * whose value was edited without the integer being re-derived -- a check that is only
 * possible if the bytes the endpoint actually returned are kept.
 */
export async function readBlockHeight(options: {
  fetchText: TextFetcher;
  now?: () => Date;
  sources?: readonly { source: string; url: string; provenance: string }[];
}): Promise<BlockHeightRetrieval> {
  const clock = options.now ?? (() => new Date());
  const sources = options.sources ?? BLOCK_HEIGHT_SOURCES;

  if (sources.length < 2) {
    throw new NumeratorRetrievalError(
      "HEIGHT_SOURCE_UNAVAILABLE",
      `the height must be confirmed independently, but ${sources.length} source(s) are configured`,
    );
  }

  const observations: BlockHeightObservation[] = [];
  for (const source of sources) {
    let body: string;
    try {
      body = await options.fetchText(source.url);
    } catch (error) {
      throw new NumeratorRetrievalError(
        "HEIGHT_SOURCE_UNAVAILABLE",
        `${source.source} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const raw = body.trim();
    if (!/^\d+$/.test(raw)) {
      // Deliberately not `RPC_MALFORMED_RESPONSE`: these are not RPC endpoints, and an HTML
      // error page rendered where an integer was expected is a source outage, not a decode
      // bug. The body is not echoed into the message -- an error page is not a log line.
      throw new NumeratorRetrievalError(
        "HEIGHT_SOURCE_UNAVAILABLE",
        `${source.source} answered ${raw.length} characters that are not a block height`,
      );
    }
    const blockHeight = Number(raw);
    if (!Number.isSafeInteger(blockHeight) || blockHeight <= 0) {
      throw new NumeratorRetrievalError(
        "HEIGHT_SOURCE_UNAVAILABLE",
        `${source.source} answered ${raw}, which is not a usable block height`,
      );
    }
    observations.push({
      source: source.source,
      rawValue: raw,
      blockHeight,
      retrievedAt: clock().toISOString(),
      provenance: source.provenance,
    });
  }

  const distinct = [...new Set(observations.map((o) => o.blockHeight))];
  if (distinct.length !== 1) {
    throw new NumeratorRetrievalError(
      "HEIGHT_SOURCES_DISAGREE",
      "the chain-tip sources do not agree: " +
        observations.map((o) => `${o.source} ${o.blockHeight}`).join(", ") +
        ". no height is assumed and no point is published",
    );
  }

  return {
    blockHeight: distinct[0]!,
    observations,
    heightSources: observations.map((o) => o.source),
  };
}
