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
/** ECOS caps a single response; the adapter pages rather than silently truncating. */
export const ECOS_PAGE_SIZE = 1000;

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
      const url = buildEcosUrl({ apiKey, identity, range, start: 1, end: ECOS_PAGE_SIZE });
      const redact = (target: string) => redactEcosUrl(target, apiKey);
      const response = await fetchText(url, { ...options, redact });
      const parsed = parseEcosPayload({ identity, payload: response.body });

      // Paging is explicit rather than assumed: if the service says there are more rows than
      // one page holds, the caller narrows the range rather than receiving a silent truncation.
      const total = Number(parsed.sourceMetadata.listTotalCount ?? 0);
      if (Number.isFinite(total) && total > ECOS_PAGE_SIZE) {
        throw new UmpiParseError(
          `ECOS reports ${total} rows for ${range.fromMonth}..${range.toMonth}, more than one page of ${ECOS_PAGE_SIZE}; narrow the range`,
        );
      }

      return {
        ...parsed,
        // A range that would exceed one page throws above, so reaching here means every row the
        // service holds for the range is in hand.
        enumerationAssessment: "complete",
        enumerationEvidence: `ECOS reported ${total} row(s) for ${range.fromMonth}..${range.toMonth}, all within one page of ${ECOS_PAGE_SIZE}`,
        payloadDigest: payloadDigest(parsed.rows.map((row) => row.rawPayload)),
        retrievedAt: new Date().toISOString(),
        requestUrl: redact(url),
        requestParameters: {
          service: ECOS_SEARCH_SERVICE,
          statCode: identity.statCode,
          itemCode: identity.itemCode,
          cycle: identity.cycle,
          startPeriod: toEcosMonth(range.fromMonth),
          endPeriod: toEcosMonth(range.toMonth),
          rows: `1..${ECOS_PAGE_SIZE}`,
        },
        httpStatus: response.status,
        contentType: response.contentType,
        responseByteLength: response.byteLength,
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
