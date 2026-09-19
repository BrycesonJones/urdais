/** Official EIA API v2 client for Form 930 D and DF rows only. */

import { createHash } from "node:crypto";

import { PD2_V1_AREAS, PD2_V1_AREA_BY_EIA_CODE, type EiaBalancingAuthorityCode } from "@/lib/power-delivery/universe";
import type { EiaPage, EiaPowerType, NormalizedPowerRecord, PowerMetricCode } from "@/lib/power-delivery/types";

export const EIA_API_KEY_ENV = "EIA_API_KEY" as const;
export const EIA_930_ENDPOINT = "https://api.eia.gov/v2/electricity/rto/region-data/data/" as const;
export const EIA_930_NATIVE_UNIT = "megawatthours" as const;
export const EIA_PAGE_LENGTH = 5_000;

const ALLOWED_TYPES = new Set<EiaPowerType>(["D", "DF"]);
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class Eia930ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Eia930ContractError";
  }
}

export type Eia930Request = {
  start: string;
  end: string;
  offset?: number;
  length?: number;
};

export type Eia930ClientOptions = {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxAttempts?: number;
  retryDelayMs?: number;
  now?: () => Date;
};

export function readEiaApiKey(env: Record<string, string | undefined> = process.env): string | null {
  return env[EIA_API_KEY_ENV]?.trim() || null;
}

function assertUtcHour(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(value)) {
    throw new Eia930ContractError(`${field} must be an EIA UTC hour (YYYY-MM-DDTHH)`);
  }
  const parsed = new Date(`${value}:00:00Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 13) !== value) {
    throw new Eia930ContractError(`${field} is not a valid UTC hour: ${value}`);
  }
  return value;
}

export function buildEia930Parameters(request: Eia930Request): URLSearchParams {
  const start = assertUtcHour(request.start, "start");
  const end = assertUtcHour(request.end, "end");
  if (end < start) throw new Eia930ContractError("end must not precede start");
  const offset = request.offset ?? 0;
  const length = request.length ?? EIA_PAGE_LENGTH;
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Eia930ContractError("offset must be a non-negative integer");
  if (!Number.isSafeInteger(length) || length < 1 || length > EIA_PAGE_LENGTH) {
    throw new Eia930ContractError(`length must be between 1 and ${EIA_PAGE_LENGTH}`);
  }

  const params = new URLSearchParams();
  params.set("frequency", "hourly");
  params.append("data[0]", "value");
  for (const area of PD2_V1_AREAS) params.append("facets[respondent][]", area.eiaBaCode);
  params.append("facets[type][]", "D");
  params.append("facets[type][]", "DF");
  params.set("start", start);
  params.set("end", end);
  params.set("sort[0][column]", "period");
  params.set("sort[0][direction]", "asc");
  params.set("sort[1][column]", "respondent");
  params.set("sort[1][direction]", "asc");
  params.set("sort[2][column]", "type");
  params.set("sort[2][direction]", "asc");
  params.set("offset", String(offset));
  params.set("length", String(length));
  return params;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Eia930ContractError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string" || value.trim() === "") throw new Eia930ContractError(`EIA row ${key} is missing`);
  return value.trim();
}

export function parseEia930Row(input: unknown): NormalizedPowerRecord {
  const row = object(input, "EIA row");
  const nativeRespondent = requiredString(row, "respondent");
  if (!PD2_V1_AREA_BY_EIA_CODE.has(nativeRespondent as EiaBalancingAuthorityCode)) {
    throw new Eia930ContractError(`unexpected EIA balancing-authority code '${nativeRespondent}'`);
  }
  const respondent = nativeRespondent as EiaBalancingAuthorityCode;
  const type = requiredString(row, "type") as EiaPowerType;
  if (!ALLOWED_TYPES.has(type)) throw new Eia930ContractError(`unsupported EIA-930 type '${type}'`);
  const nativePeriod = assertUtcHour(requiredString(row, "period"), "period");
  const nativeUnit = requiredString(row, "value-units").toLowerCase();
  if (nativeUnit !== EIA_930_NATIVE_UNIT) {
    throw new Eia930ContractError(`unsupported EIA-930 unit '${nativeUnit}'`);
  }

  const rawValue = row.value;
  let nativeValue: string | null;
  let valueMw: number | null;
  if (rawValue === null || rawValue === "") {
    nativeValue = null;
    valueMw = null;
  } else if (typeof rawValue === "string" && rawValue.trim() !== "") {
    nativeValue = rawValue.trim();
    valueMw = Number(nativeValue);
    if (!Number.isFinite(valueMw) || valueMw < 0) throw new Eia930ContractError(`invalid EIA-930 value '${nativeValue}'`);
  } else {
    throw new Eia930ContractError("EIA row value must be a numeric string or null");
  }

  const periodStart = new Date(`${nativePeriod}:00:00Z`);
  const periodEnd = new Date(periodStart.valueOf() + 3_600_000);
  const metric: PowerMetricCode = type === "D" ? "actual_load" : "operational_demand_forecast";
  const canonical = { respondent, type, period: nativePeriod, value: nativeValue, unit: nativeUnit };
  return {
    respondent,
    type,
    metric,
    nativePeriod,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    nativeValue,
    nativeUnit: EIA_930_NATIVE_UNIT,
    // EIA reports integrated MWh for a one-hour interval. Dividing by exactly one hour gives
    // average MW with the same numeric magnitude; the native value and unit remain evidence.
    valueMw,
    normalizationStatus: valueMw === null ? "source_unavailable" : "available",
    recordHash: sha256(JSON.stringify(canonical)),
    rawPayload: row,
  };
}

export function parseEia930Page(body: string, requestUrl: string, parameters: URLSearchParams, retrievedAt: string): EiaPage {
  let json: unknown;
  try { json = JSON.parse(body); } catch { throw new Eia930ContractError("EIA response is not valid JSON"); }
  const root = object(json, "EIA response");
  const response = object(root.response, "EIA response.response");
  if (response.frequency !== "hourly") throw new Eia930ContractError(`unexpected EIA frequency '${String(response.frequency)}'`);
  const total = Number(response.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new Eia930ContractError("EIA response total is invalid");
  if (!Array.isArray(response.data)) throw new Eia930ContractError("EIA response data is not an array");
  const records = response.data.map(parseEia930Row);
  const identities = new Set<string>();
  for (const record of records) {
    const identity = `${record.respondent}|${record.type}|${record.nativePeriod}`;
    if (identities.has(identity)) throw new Eia930ContractError(`duplicate EIA source row '${identity}'`);
    identities.add(identity);
  }
  const requestParameters = Object.fromEntries(
    [...new Set(parameters.keys())].map((key) => {
      const values = parameters.getAll(key);
      return [key, values.length === 1 ? values[0] : values];
    }),
  );
  return {
    requestUrl,
    requestParameters,
    offset: Number(parameters.get("offset")),
    length: Number(parameters.get("length")),
    total,
    retrievedAt,
    responseHash: sha256(body),
    responseByteLength: Buffer.byteLength(body),
    responseBody: root,
    records,
  };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(request: Eia930Request, options: Eia930ClientOptions): Promise<EiaPage> {
  const apiKey = options.apiKey?.trim() || readEiaApiKey();
  if (!apiKey) throw new Eia930ContractError(`${EIA_API_KEY_ENV} is not configured`);
  const params = buildEia930Parameters(request);
  const publicUrl = `${EIA_930_ENDPOINT}?${params.toString()}`;
  const requestUrl = `${publicUrl}&api_key=${encodeURIComponent(apiKey)}`;
  const attempts = Math.max(1, options.maxAttempts ?? 3);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
    try {
      const response = await (options.fetchImpl ?? fetch)(requestUrl, { headers: { Accept: "application/json" }, signal: controller.signal });
      const body = await response.text();
      if (!response.ok) {
        if (RETRYABLE_STATUSES.has(response.status) && attempt < attempts) {
          await sleep((options.retryDelayMs ?? 1_000) * attempt);
          continue;
        }
        throw new Eia930ContractError(`EIA request failed with HTTP ${response.status}: ${body.slice(0, 240)}`);
      }
      return parseEia930Page(body, publicUrl, params, (options.now ?? (() => new Date()))().toISOString());
    } catch (error) {
      if (error instanceof Eia930ContractError) throw error;
      if (attempt === attempts) throw error;
      await sleep((options.retryDelayMs ?? 1_000) * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Eia930ContractError("EIA request exhausted without an outcome");
}

export async function fetchEia930(request: Omit<Eia930Request, "offset" | "length">, options: Eia930ClientOptions = {}): Promise<EiaPage[]> {
  const pages: EiaPage[] = [];
  const identities = new Set<string>();
  let offset = 0;
  while (true) {
    const page = await fetchPage({ ...request, offset, length: EIA_PAGE_LENGTH }, options);
    for (const record of page.records) {
      const identity = `${record.respondent}|${record.type}|${record.nativePeriod}`;
      if (identities.has(identity)) throw new Eia930ContractError(`duplicate EIA source row across pages '${identity}'`);
      identities.add(identity);
    }
    pages.push(page);
    offset += page.records.length;
    if (offset >= page.total) break;
    if (page.records.length === 0) throw new Eia930ContractError("EIA pagination returned an empty page before total rows were read");
  }
  return pages;
}
