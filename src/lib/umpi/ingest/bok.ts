/**
 * Bank of Korea ECOS adapter for the DRAM producer price index.
 *
 * The request names the series exactly: `404Y016 / 30911201AA / M`. It does not search for a
 * DRAM item by name, and it does not accept whatever a lookup returns, because the same item
 * code exists in the export price table `402Y016` with different values. The identity is
 * asserted against the response as well as the request — ECOS echoes `STAT_CODE` and
 * `ITEM_CODE1` on every row, so the check costs nothing and catches a redirected series.
 */

import { identityKey } from "../identity";
import { observationProvenanceHash, payloadDigest } from "../provenance";
import { admit } from "../validate";
import type { ReferenceMonth, UmpiRawObservation, UmpiSourceIdentity } from "../types";
import {
  UmpiIdentityMismatchError,
  UmpiParseError,
  UmpiProviderError,
} from "./errors";
import { fetchText, redactEcosUrl, type HttpOptions } from "./http";
import type { FetchRange, ParseResult, ParsedRow, SourceFetchResult, UmpiSourceAdapter } from "./types";

export const ECOS_BASE_URL = "https://ecos.bok.or.kr/api";
export const ECOS_SEARCH_SERVICE = "StatisticSearch";

/**
 * The Bank of Korea's published demo key.
 *
 * UMPI runs on this rather than a registered key because registration requires Korean identity
 * verification the founder cannot complete. It returns the exact approved series, and it caps
 * every response at ten rows — which is why this adapter pages.
 *
 * **The rights state is not laundered by using it.** The registry records this source as
 * `ambiguous_requires_legal_review` with an explicit founder-accepted-risk marker: a key
 * published for trying an API is not a documented production entitlement, and the record says
 * so. A registered key would retire both the ambiguity and the ten-row cap.
 */
export const ECOS_DEMO_KEY = "sample";
/** What the demo key returns per call, enforced by the service with `ERROR-301`. */
export const ECOS_DEMO_PAGE_SIZE = 10;
/** What a registered key could take in one call, if one is ever issued. */
export const ECOS_REGISTERED_PAGE_SIZE = 1000;
/** Refuses to page forever if the service ever reports a nonsensical total. */
export const ECOS_MAX_PAGES = 600;

/** The demo key unless a registered one is configured; the page size follows the key. */
export function ecosCredential(env: NodeJS.ProcessEnv = process.env): { apiKey: string; pageSize: number; isDemo: boolean } {
  const registered = env.UMPI_ECOS_API_KEY?.trim();
  return registered
    ? { apiKey: registered, pageSize: ECOS_REGISTERED_PAGE_SIZE, isDemo: false }
    : { apiKey: ECOS_DEMO_KEY, pageSize: ECOS_DEMO_PAGE_SIZE, isDemo: true };
}

const MONTH_TOKEN = /^(\d{4})(0[1-9]|1[0-2])$/;

/** `YYYY-MM` to the `YYYYMM` ECOS expects, and back. */
export function toEcosMonth(month: ReferenceMonth): string {
  return month.replace("-", "");
}
export function fromEcosMonth(token: string): ReferenceMonth | null {
  const match = MONTH_TOKEN.exec(token.trim());
  return match ? `${match[1]}-${match[2]}` : null;
}

export function buildEcosUrl(input: {
  apiKey: string;
  identity: Extract<UmpiSourceIdentity, { kind: "bok_ecos_series" }>;
  range: FetchRange;
  start: number;
  end: number;
}): string {
  const { apiKey, identity, range, start, end } = input;
  // Path-positional API: service / key / format / language / start row / end row /
  // stat code / cycle / start period / end period / item code.
  return [
    ECOS_BASE_URL,
    ECOS_SEARCH_SERVICE,
    encodeURIComponent(apiKey),
    "json",
    "kr",
    String(start),
    String(end),
    identity.statCode,
    identity.cycle,
    toEcosMonth(range.fromMonth),
    toEcosMonth(range.toMonth),
    identity.itemCode,
  ].join("/");
}

type EcosRow = Record<string, unknown>;

/** ECOS reports its own failures in a `RESULT` envelope with a 200 status. */
function providerErrorFrom(payload: unknown): UmpiProviderError | null {
  if (payload === null || typeof payload !== "object") return null;
  const result = (payload as Record<string, unknown>).RESULT;
  if (result === undefined || result === null || typeof result !== "object") return null;
  const code = String((result as Record<string, unknown>).CODE ?? "");
  const message = String((result as Record<string, unknown>).MESSAGE ?? "");
  return new UmpiProviderError(`ECOS returned ${code || "an error"}: ${message}`, code || null, message || null);
}

export function parseEcosPayload(input: { identity: UmpiSourceIdentity; payload: string }): ParseResult {
  const { identity, payload } = input;
  if (identity.kind !== "bok_ecos_series") {
    throw new UmpiParseError("the ECOS parser was given a non-ECOS identity");
  }

  let document: unknown;
  try {
    document = JSON.parse(payload);
  } catch (error) {
    throw new UmpiParseError("the ECOS response is not JSON", { cause: error });
  }

  const providerError = providerErrorFrom(document);
  if (providerError) throw providerError;

  const container = (document as Record<string, unknown>)[ECOS_SEARCH_SERVICE];
  if (container === undefined) {
    // No `RESULT` and no search container is a payload shape nobody documented. It is not
    // "no data": an empty month is expressed by ECOS as an explicit no-result RESULT code.
    throw new UmpiParseError(`the ECOS response carries neither ${ECOS_SEARCH_SERVICE} nor RESULT`);
  }
  if (container === null || typeof container !== "object") {
    throw new UmpiParseError(`${ECOS_SEARCH_SERVICE} is not an object`);
  }

  const rawRows = (container as Record<string, unknown>).row;
  const totalCount = Number((container as Record<string, unknown>).list_total_count ?? 0);
  const rows: ParsedRow[] = [];

  if (rawRows !== undefined && !Array.isArray(rawRows)) {
    throw new UmpiParseError(`${ECOS_SEARCH_SERVICE}.row is present but is not an array`);
  }

  for (const entry of (rawRows ?? []) as EcosRow[]) {
    const statCode = String(entry.STAT_CODE ?? "");
    const itemCode = String(entry.ITEM_CODE1 ?? "");
    // The identity assertion. A response from another table is a hard failure, not a
    // rejected row: it means the request or the service is not what this adapter believes.
    if (statCode !== identity.statCode || itemCode !== identity.itemCode) {
      throw new UmpiIdentityMismatchError(
        `ECOS returned ${statCode}/${itemCode} for a request for ${identity.statCode}/${identity.itemCode}`,
        `${identity.statCode}/${identity.itemCode}`,
        `${statCode}/${itemCode}`,
      );
    }

    const rawPayload = { ...entry } as Record<string, unknown>;
    const referenceMonth = fromEcosMonth(String(entry.TIME ?? ""));
    if (referenceMonth === null) {
      rows.push({
        state: "rejected",
        code: "malformed_reference_month",
        detail: `TIME ${JSON.stringify(entry.TIME)} is not a YYYYMM month`,
        rawPayload,
      });
      continue;
    }

    const rawValue = entry.DATA_VALUE;
    const level = typeof rawValue === "number" ? rawValue : Number(String(rawValue ?? "").trim());
    if (!Number.isFinite(level)) {
      rows.push({
        state: "rejected",
        code: "non_numeric_value",
        detail: `DATA_VALUE ${JSON.stringify(rawValue)} is not numeric`,
        rawPayload,
      });
      continue;
    }

    const observation: UmpiRawObservation = {
      kind: "bok_index_level",
      referenceMonth,
      indexLevel: level,
      baseLabel: String(entry.UNIT_NAME ?? "").trim() || "unspecified",
    };

    const admission = admit({ expectedIdentity: identity, actualIdentity: identity, observation });
    if (admission.state === "rejected") {
      rows.push({ state: "rejected", code: admission.code, detail: admission.detail, rawPayload });
      continue;
    }

    rows.push({
      state: "admitted",
      identity,
      observation,
      rawPayload,
      provenanceHash: observationProvenanceHash({ identity, observation }),
    });
  }

  const firstRow = ((rawRows ?? []) as EcosRow[])[0];
  return {
    rows,
    sourceMetadata: {
      statCode: identity.statCode,
      itemCode: identity.itemCode,
      cycle: identity.cycle,
      listTotalCount: Number.isFinite(totalCount) ? totalCount : null,
      statName: firstRow ? String(firstRow.STAT_NAME ?? "") : null,
      unitName: firstRow ? String(firstRow.UNIT_NAME ?? "") : null,
    },
  };
}

export function createBokAdapter(options: HttpOptions = {}): UmpiSourceAdapter<string> {
  return {
    name: "bok-ecos-producer-price-commodity",
    seriesCode: "UMPI-KR-DRAM-PPI",
    identityKind: "bok_ecos_series",
    credentialEnv: "UMPI_ECOS_API_KEY",
    parse: parseEcosPayload,
    async fetch({ identity, range, apiKey }): Promise<SourceFetchResult> {
      if (identity.kind !== "bok_ecos_series") {
        throw new UmpiParseError("the BOK adapter was given a non-ECOS identity");
      }
      const pageSize = apiKey === ECOS_DEMO_KEY ? ECOS_DEMO_PAGE_SIZE : ECOS_REGISTERED_PAGE_SIZE;
      const redact = (target: string) => redactEcosUrl(target, apiKey);

      // Page until the service's own count is exhausted. The window is inclusive and 1-based,
      // and a request wider than the key allows is rejected outright with ERROR-301, so the
      // page size is taken from the key rather than guessed.
      const rows: ParsedRow[] = [];
      const rawForDigest: Record<string, unknown>[] = [];
      let sourceMetadata: ParseResult["sourceMetadata"] = {};
      let declaredTotal: number | null = null;
      let status = 0;
      let contentType: string | null = null;
      let byteLength = 0;
      let firstUrl = "";
      let pages = 0;

      for (let start = 1; ; start += pageSize) {
        if (pages >= ECOS_MAX_PAGES) {
          throw new UmpiParseError(
            `ECOS paging exceeded ${ECOS_MAX_PAGES} pages for ${range.fromMonth}..${range.toMonth}; refusing to continue`,
          );
        }
        const url = buildEcosUrl({ apiKey, identity, range, start, end: start + pageSize - 1 });
        if (firstUrl === "") firstUrl = url;
        const response = await fetchText(url, { ...options, redact });
        const page = parseEcosPayload({ identity, payload: response.body });
        pages += 1;
        status = response.status;
        contentType = response.contentType;
        byteLength += response.byteLength;
        if (start === 1) sourceMetadata = page.sourceMetadata;

        const total = Number(page.sourceMetadata.listTotalCount ?? Number.NaN);
        if (Number.isFinite(total)) declaredTotal = total;

        rows.push(...page.rows);
        for (const row of page.rows) rawForDigest.push(row.rawPayload);

        // Stop on the service's own count, or on a short page, whichever comes first. A short
        // page is the authoritative end even if the count disagrees.
        if (page.rows.length < pageSize) break;
        if (declaredTotal !== null && start + pageSize - 1 >= declaredTotal) break;
      }

      const complete = declaredTotal === null || rows.length === declaredTotal;
      return {
        rows,
        sourceMetadata: { ...sourceMetadata, pagesFetched: pages, pageSize, usedDemoKey: apiKey === ECOS_DEMO_KEY },
        enumerationAssessment: complete ? "complete" : "unknown",
        enumerationEvidence:
          declaredTotal === null
            ? `ECOS declared no row count; ${rows.length} row(s) collected over ${pages} page(s) of ${pageSize}`
            : `ECOS declared ${declaredTotal} row(s) and ${rows.length} were collected over ${pages} page(s) of ${pageSize}`,
        payloadDigest: payloadDigest(rawForDigest),
        retrievedAt: new Date().toISOString(),
        requestUrl: redact(firstUrl),
        requestParameters: {
          service: ECOS_SEARCH_SERVICE,
          statCode: identity.statCode,
          itemCode: identity.itemCode,
          cycle: identity.cycle,
          startPeriod: toEcosMonth(range.fromMonth),
          endPeriod: toEcosMonth(range.toMonth),
          pageSize,
          pagesFetched: pages,
        },
        httpStatus: status,
        contentType,
        responseByteLength: byteLength,
      };
    },
  };
}

/** The identity this adapter is allowed to read, stated once. */
export const BOK_EXPECTED_IDENTITY_KEY = "bok:404Y016/30911201AA/M";

/** A guard the run path calls before any request. */
export function assertBokIdentity(identity: UmpiSourceIdentity): void {
  const key = identityKey(identity);
  if (key !== BOK_EXPECTED_IDENTITY_KEY) {
    throw new UmpiIdentityMismatchError(
      `UMPI V1 reads ${BOK_EXPECTED_IDENTITY_KEY}; refusing ${key}`,
      BOK_EXPECTED_IDENTITY_KEY,
      key,
    );
  }
}
