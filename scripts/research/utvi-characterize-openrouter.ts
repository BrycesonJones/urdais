/**
 * UTVI Phase 1A: read-only characterization of OpenRouter's rankings-daily
 * dataset against the live authenticated endpoint.
 *
 * This is a research script. It is not wired into the application, creates no
 * database connection, writes nothing to any Urdais schema, and imports no
 * production module. Its only outputs are a JSON report and the raw response
 * bodies, written to a directory the caller names.
 *
 * It never prints the API key, the Authorization header, or any request header.
 *
 * Usage:
 *   npx tsx scripts/research/utvi-characterize-openrouter.ts --out <dir> [--probe <name>]
 *
 * Probes run in a fixed order and are individually selectable so that a rerun
 * costs one request rather than twenty. The published limits are 30 requests
 * per minute per key and 500 per day per account; a full run makes well under
 * twenty requests and paces itself.
 */

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ENDPOINT = "https://openrouter.ai/api/v1/datasets/rankings-daily";
const RESERVED_RESIDUAL_SLUG = "other";

/* ---------- environment ---------- */

/**
 * Reads OPENROUTER_API_KEY from the process environment, falling back to a
 * minimal parse of .env.local. Nothing about the value is ever logged.
 */
function readApiKey(): { present: boolean; key: string } {
  const direct = process.env.OPENROUTER_API_KEY?.trim();
  if (direct) return { present: true, key: direct };
  const envFile = path.join(process.cwd(), ".env.local");
  if (!existsSync(envFile)) return { present: false, key: "" };
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = /^\s*OPENROUTER_API_KEY\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const value = match[1]!.trim().replace(/^["']|["']$/g, "");
    if (value) return { present: true, key: value };
  }
  return { present: false, key: "" };
}

/* ---------- request ---------- */

/** Response headers worth recording. Deliberately excludes everything request-side. */
const OBSERVED_HEADERS = [
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
  "ratelimit-limit",
  "ratelimit-remaining",
  "ratelimit-reset",
  "retry-after",
  "content-type",
  "date",
  "cache-control",
  "age",
  "x-vercel-cache",
] as const;

type Retrieval = {
  label: string;
  requestedAt: string;
  completedAt: string;
  url: string;
  parameters: Record<string, string>;
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  byteLength: number;
  bodyHash: string;
  body: unknown;
  parseError?: string;
};

const retrievals: Retrieval[] = [];

async function get(label: string, parameters: Record<string, string>, key: string): Promise<Retrieval> {
  const url = new URL(ENDPOINT);
  for (const [k, v] of Object.entries(parameters)) url.searchParams.set(k, v);
  const requestedAt = new Date().toISOString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const text = await response.text();
  const headers: Record<string, string> = {};
  for (const name of OBSERVED_HEADERS) {
    const value = response.headers.get(name);
    if (value !== null) headers[name] = value;
  }
  let body: unknown = null;
  let parseError: string | undefined;
  try {
    body = JSON.parse(text);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const retrieval: Retrieval = {
    label,
    requestedAt,
    completedAt: new Date().toISOString(),
    url: url.toString(),
    parameters,
    status: response.status,
    ok: response.ok,
    headers,
    byteLength: Buffer.byteLength(text, "utf8"),
    bodyHash: createHash("sha256").update(text).digest("hex"),
    body,
    parseError,
  };
  retrievals.push(retrieval);
  console.log(
    `  [${label}] ${response.status} ${retrieval.byteLength}B hash=${retrieval.bodyHash.slice(0, 12)} ${JSON.stringify(parameters)}`,
  );
  return retrieval;
}

/* ---------- analysis ---------- */

type Row = { date: string; model_permaslug: string; total_tokens: string } & Record<string, unknown>;

const isRowArray = (body: unknown): body is { data: Row[]; meta: Record<string, unknown> } =>
  typeof body === "object" && body !== null && Array.isArray((body as { data?: unknown }).data);

/** Exact integer sum. Token totals arrive as decimal strings and are summed as BigInt. */
function sumTokens(rows: readonly Row[]): bigint {
  return rows.reduce((total, row) => total + BigInt(row.total_tokens), 0n);
}

/** Every distinct key appearing on any row, with how many rows carry it. */
function fieldInventory(rows: readonly Row[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    for (const key of Object.keys(row)) counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/** Value-shape notes per field: types seen, and whether any value is null or empty. */
function valueShapes(rows: readonly Row[]): Record<string, string[]> {
  const shapes: Record<string, Set<string>> = {};
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      shapes[key] ??= new Set();
      shapes[key]!.add(value === null ? "null" : Array.isArray(value) ? "array" : typeof value);
    }
  }
  return Object.fromEntries(Object.entries(shapes).map(([k, v]) => [k, [...v].sort()]));
}

/** A day's rows split into named models and the reserved residual row. */
function splitDay(rows: readonly Row[], date: string) {
  const forDate = rows.filter((row) => row.date === date);
  const residual = forDate.filter((row) => row.model_permaslug === RESERVED_RESIDUAL_SLUG);
  const named = forDate.filter((row) => row.model_permaslug !== RESERVED_RESIDUAL_SLUG);
  return { forDate, named, residual };
}

/**
 * The namespace segment of a permaslug, which is OpenRouter's author prefix.
 * It is not asserted to be a legal lab identity; that mapping needs evidence.
 */
function namespaceOf(permaslug: string): string {
  const slash = permaslug.indexOf("/");
  return slash === -1 ? "(no-namespace)" : permaslug.slice(0, slash);
}

/** The `:variant` suffix, where present. Non-default variants rank as their own row. */
function variantOf(permaslug: string): string | null {
  const colon = permaslug.lastIndexOf(":");
  return colon === -1 ? null : permaslug.slice(colon + 1);
}

/** The permaslug with any variant suffix removed: the candidate canonical model key. */
function baseSlugOf(permaslug: string): string {
  const colon = permaslug.lastIndexOf(":");
  return colon === -1 ? permaslug : permaslug.slice(0, colon);
}

function integrityChecks(rows: readonly Row[]) {
  const problems: string[] = [];
  let nonIntegerTotals = 0;
  let negativeTotals = 0;
  let zeroTotals = 0;
  let nullTotals = 0;
  let aboveDouble = 0;
  for (const row of rows) {
    const raw = row.total_tokens as unknown;
    if (raw === null || raw === undefined) {
      nullTotals += 1;
      continue;
    }
    const text = String(raw);
    if (!/^-?\d+$/.test(text)) {
      nonIntegerTotals += 1;
      problems.push(`non-integer total_tokens on ${row.model_permaslug} ${row.date}: ${text}`);
      continue;
    }
    const value = BigInt(text);
    if (value < 0n) negativeTotals += 1;
    if (value === 0n) zeroTotals += 1;
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) aboveDouble += 1;
  }
  return { nonIntegerTotals, negativeTotals, zeroTotals, nullTotals, aboveNumberMaxSafeInteger: aboveDouble, problems };
}

/* ---------- probes ---------- */

function utcDate(offsetDays: number): string {
  const now = new Date();
  now.setUTCDate(now.getUTCDate() + offsetDays);
  return now.toISOString().slice(0, 10);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const outIndex = process.argv.indexOf("--out");
  const outDir = outIndex === -1 ? null : process.argv[outIndex + 1];
  if (!outDir) {
    console.error("--out <dir> is required");
    process.exit(2);
  }
  mkdirSync(outDir, { recursive: true });

  const probeIndex = process.argv.indexOf("--probe");
  const onlyProbe = probeIndex === -1 ? null : process.argv[probeIndex + 1]!;
  const runs = (name: string) => onlyProbe === null || onlyProbe === name;

  const { present, key } = readApiKey();
  console.log(`OPENROUTER_API_KEY present: ${present ? "yes" : "no"}`);
  if (!present) {
    console.error("no key found in process env or .env.local; nothing to characterize");
    process.exit(2);
  }

  const todayUtc = utcDate(0);
  const lastCompleted = utcDate(-1);
  console.log(`UTC today: ${todayUtc}; last completed UTC day: ${lastCompleted}\n`);

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    envVar: "OPENROUTER_API_KEY",
    envVarPresent: present,
    utcToday: todayUtc,
    lastCompletedUtcDay: lastCompleted,
  };

  /* Probe 1 — authentication, and the default window with no parameters. */
  if (runs("auth")) {
    console.log("probe: auth + default window");
    const r = await get("auth-default-window", {}, key);
    report.auth = {
      status: r.status,
      ok: r.ok,
      headers: r.headers,
      rateLimitHeadersExposed: Object.keys(r.headers).filter((h) => h.includes("ratelimit") || h === "retry-after"),
      topLevelKeys: isRowArray(r.body) ? Object.keys(r.body as object).sort() : null,
      meta: isRowArray(r.body) ? r.body.meta : null,
      rowCount: isRowArray(r.body) ? r.body.data.length : null,
      errorBody: r.ok ? undefined : r.body,
    };
    await sleep(2500);
  }

  /* Probe 2 — one completed UTC day, the core sample. */
  if (runs("single-day")) {
    console.log("probe: single completed UTC day");
    const r = await get("single-day", { start_date: lastCompleted, end_date: lastCompleted }, key);
    if (isRowArray(r.body)) {
      const rows = r.body.data;
      const { forDate, named, residual } = splitDay(rows, lastCompleted);
      const namedSum = sumTokens(named);
      const residualSum = sumTokens(residual);
      report.singleDay = {
        requestedDate: lastCompleted,
        meta: r.body.meta,
        metaKeys: Object.keys(r.body.meta ?? {}).sort(),
        rowCount: rows.length,
        rowsForRequestedDate: forDate.length,
        namedRowCount: named.length,
        residualRowPresent: residual.length > 0,
        residualRowCount: residual.length,
        fieldInventory: fieldInventory(rows),
        valueShapes: valueShapes(rows),
        promptTokensFieldPresent: rows.some((row) => "prompt_tokens" in row),
        completionTokensFieldPresent: rows.some((row) => "completion_tokens" in row),
        rankFieldPresent: rows.some((row) => "rank" in row),
        modelNameFieldPresent: rows.some((row) => "model_name" in row || "name" in row),
        integrity: integrityChecks(rows),
        namedTokens: namedSum.toString(),
        residualTokens: residualSum.toString(),
        dayTotalTokens: (namedSum + residualSum).toString(),
        residualSharePercent: namedSum + residualSum === 0n ? null : Number((residualSum * 1000000n) / (namedSum + residualSum)) / 10000,
        orderingIsDescendingByTokens: named.every(
          (row, index) => index === 0 || BigInt(named[index - 1]!.total_tokens) >= BigInt(row.total_tokens),
        ),
        residualIsLastRow: rows.length > 0 && rows[rows.length - 1]!.model_permaslug === RESERVED_RESIDUAL_SLUG,
        firstRows: rows.slice(0, 3),
        lastRows: rows.slice(-2),
      };
    }
    await sleep(2500);
  }

  /* Probe 3 — identity: namespaces, variants, base slugs over the day's rows. */
  if (runs("identity")) {
    const day = retrievals.find((r) => r.label === "single-day");
    if (day && isRowArray(day.body)) {
      const named = splitDay(day.body.data, lastCompleted).named;
      const byNamespace: Record<string, { rows: number; tokens: bigint }> = {};
      for (const row of named) {
        const ns = namespaceOf(row.model_permaslug);
        byNamespace[ns] ??= { rows: 0, tokens: 0n };
        byNamespace[ns]!.rows += 1;
        byNamespace[ns]!.tokens += BigInt(row.total_tokens);
      }
      const totalNamed = sumTokens(named);
      const variantRows = named.filter((row) => variantOf(row.model_permaslug) !== null);
      const baseCollisions: Record<string, string[]> = {};
      for (const row of named) {
        const base = baseSlugOf(row.model_permaslug);
        baseCollisions[base] ??= [];
        baseCollisions[base]!.push(row.model_permaslug);
      }
      report.identity = {
        namedModels: named.length,
        distinctNamespaces: Object.keys(byNamespace).length,
        namespaces: Object.entries(byNamespace)
          .sort((a, b) => (b[1].tokens > a[1].tokens ? 1 : -1))
          .map(([namespace, v]) => ({
            namespace,
            rows: v.rows,
            tokens: v.tokens.toString(),
            sharePercentOfNamed: totalNamed === 0n ? null : Number((v.tokens * 1000000n) / totalNamed) / 10000,
          })),
        variantSuffixes: [...new Set(variantRows.map((row) => variantOf(row.model_permaslug)))].sort(),
        variantRowCount: variantRows.length,
        variantRowExamples: variantRows.slice(0, 10).map((row) => row.model_permaslug),
        basesWithMultipleVariantRows: Object.entries(baseCollisions)
          .filter(([, slugs]) => slugs.length > 1)
          .map(([base, slugs]) => ({ base, slugs })),
        looksLikeLatestPointer: named
          .map((row) => row.model_permaslug)
          .filter((slug) => /(^|[._:/-])latest$/i.test(slug)),
        allPermaslugs: named.map((row) => ({
          permaslug: row.model_permaslug,
          namespace: namespaceOf(row.model_permaslug),
          base: baseSlugOf(row.model_permaslug),
          variant: variantOf(row.model_permaslug),
          tokens: row.total_tokens,
        })),
      };
    }
  }

  /* Probe 4 — aggregation feasibility for Market Share, in memory only. */
  if (runs("aggregate")) {
    const day = retrievals.find((r) => r.label === "single-day");
    if (day && isRowArray(day.body)) {
      const { named, residual } = splitDay(day.body.data, lastCompleted);
      const namedSum = sumTokens(named);
      const residualSum = sumTokens(residual);
      const byModel: Record<string, bigint> = {};
      for (const row of named) {
        const base = baseSlugOf(row.model_permaslug);
        byModel[base] = (byModel[base] ?? 0n) + BigInt(row.total_tokens);
      }
      const byLab: Record<string, bigint> = {};
      for (const row of named) {
        const ns = namespaceOf(row.model_permaslug);
        byLab[ns] = (byLab[ns] ?? 0n) + BigInt(row.total_tokens);
      }
      const rank = (entries: Record<string, bigint>, limit: number) =>
        Object.entries(entries)
          .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
          .slice(0, limit)
          .map(([label, tokens]) => ({
            label,
            tokens: tokens.toString(),
            sharePercentOfAttributed: namedSum === 0n ? null : Number((tokens * 1000000n) / namedSum) / 10000,
            sharePercentOfTotal:
              namedSum + residualSum === 0n ? null : Number((tokens * 1000000n) / (namedSum + residualSum)) / 10000,
          }));
      report.aggregation = {
        date: lastCompleted,
        attributedTokens: namedSum.toString(),
        residualTokens: residualSum.toString(),
        totalTokens: (namedSum + residualSum).toString(),
        distinctCanonicalModelsAfterVariantFold: Object.keys(byModel).length,
        topModels: rank(byModel, 10),
        topNamespaces: rank(byLab, 12),
      };
    }
  }

  /* Probe 5 — historical depth and contract stability. */
  if (runs("history")) {
    console.log("probe: historical depth");
    const probes: { label: string; params: Record<string, string> }[] = [
      { label: "history-floor", params: { start_date: "2025-01-01", end_date: "2025-01-01" } },
      { label: "history-below-floor", params: { start_date: "2024-06-01", end_date: "2024-06-01" } },
      { label: "history-clamp", params: { start_date: "2024-01-01", end_date: "2025-01-02" } },
      { label: "history-mid", params: { start_date: "2025-12-15", end_date: "2025-12-15" } },
      { label: "history-mid-2026", params: { start_date: "2026-05-11", end_date: "2026-05-11" } },
    ];
    const results: unknown[] = [];
    for (const probe of probes) {
      const r = await get(probe.label, probe.params, key);
      const rows = isRowArray(r.body) ? r.body.data : [];
      const dates = [...new Set(rows.map((row) => row.date))].sort();
      results.push({
        label: probe.label,
        parameters: probe.params,
        status: r.status,
        meta: isRowArray(r.body) ? r.body.meta : r.body,
        rowCount: rows.length,
        datesReturned: dates,
        namedRowCountFirstDate: dates.length ? splitDay(rows, dates[0]!).named.length : 0,
        residualPresentFirstDate: dates.length ? splitDay(rows, dates[0]!).residual.length > 0 : null,
        fieldInventory: fieldInventory(rows),
        integrity: integrityChecks(rows),
        sampleRow: rows[0] ?? null,
      });
      await sleep(2500);
    }
    report.history = results;
  }

  /* Probe 6 — window semantics: size, ordering, inclusivity, pagination. */
  if (runs("window")) {
    console.log("probe: window semantics");
    const probes: { label: string; params: Record<string, string> }[] = [
      { label: "window-3-days", params: { start_date: utcDate(-3), end_date: lastCompleted } },
      { label: "window-90-days", params: { start_date: utcDate(-90), end_date: lastCompleted } },
      { label: "window-full-history", params: { start_date: "2025-01-01", end_date: lastCompleted } },
      { label: "window-inverted", params: { start_date: lastCompleted, end_date: utcDate(-3) } },
      { label: "window-period-week", params: { start_date: utcDate(-30), end_date: lastCompleted, period: "week" } },
      { label: "window-period-month", params: { start_date: "2026-06-01", end_date: lastCompleted, period: "month" } },
    ];
    const results: unknown[] = [];
    for (const probe of probes) {
      const r = await get(probe.label, probe.params, key);
      const rows = isRowArray(r.body) ? r.body.data : [];
      const dates = [...new Set(rows.map((row) => row.date))].sort();
      results.push({
        label: probe.label,
        parameters: probe.params,
        status: r.status,
        byteLength: r.byteLength,
        meta: isRowArray(r.body) ? r.body.meta : r.body,
        rowCount: rows.length,
        distinctDates: dates.length,
        firstDate: dates[0] ?? null,
        lastDate: dates[dates.length - 1] ?? null,
        rowsPerDateMin: dates.length ? Math.min(...dates.map((d) => splitDay(rows, d).forDate.length)) : null,
        rowsPerDateMax: dates.length ? Math.max(...dates.map((d) => splitDay(rows, d).forDate.length)) : null,
        datesAscending: dates.every((d, i) => i === 0 || d > dates[i - 1]!),
        includesStart: dates.includes(probe.params.start_date ?? ""),
        includesEnd: dates.includes(probe.params.end_date ?? ""),
        paginationKeysInMeta: isRowArray(r.body)
          ? Object.keys(r.body.meta ?? {}).filter((k) => /cursor|page|next|has_more|limit|offset/i.test(k))
          : [],
      });
      await sleep(2500);
    }
    report.window = results;
  }

  /* Probe 7 — the current, incomplete UTC day. */
  if (runs("current-day")) {
    console.log("probe: current UTC day behaviour");
    const r = await get("current-day-explicit", { start_date: todayUtc, end_date: todayUtc }, key);
    const rows = isRowArray(r.body) ? r.body.data : [];
    const future = await get("future-day", { start_date: utcDate(2), end_date: utcDate(2) }, key);
    report.currentDay = {
      explicitRequest: {
        status: r.status,
        meta: isRowArray(r.body) ? r.body.meta : r.body,
        rowCount: rows.length,
        datesReturned: [...new Set(rows.map((row) => row.date))].sort(),
        totalTokens: rows.length ? sumTokens(rows).toString() : null,
      },
      futureRequest: {
        status: future.status,
        meta: isRowArray(future.body) ? future.body.meta : future.body,
        rowCount: isRowArray(future.body) ? future.body.data.length : null,
      },
      defaultWindowEndDate: (report.auth as { meta?: { end_date?: string } } | undefined)?.meta?.end_date ?? null,
    };
    await sleep(2500);
  }

  /* Probe 8 — the estimated-dataset filters, which UTVI must never use. */
  if (runs("estimated-filters")) {
    console.log("probe: estimated-dataset filters");
    const a = await get("filter-category-day", { start_date: lastCompleted, end_date: lastCompleted, category: "programming", period: "day" }, key);
    await sleep(2500);
    const b = await get("filter-language-week", { start_date: utcDate(-14), end_date: lastCompleted, language_type: "programming", period: "week" }, key);
    await sleep(2500);
    const c = await get("filter-modality-text", { start_date: lastCompleted, end_date: lastCompleted, modality: "text" }, key);
    report.estimatedFilters = {
      categoryWithPeriodDay: { status: a.status, body: a.ok ? { rowCount: isRowArray(a.body) ? a.body.data.length : null } : a.body },
      languageTypeWeek: {
        status: b.status,
        meta: isRowArray(b.body) ? b.body.meta : b.body,
        rowCount: isRowArray(b.body) ? b.body.data.length : null,
        sampleRow: isRowArray(b.body) ? (b.body.data[0] ?? null) : null,
      },
      modalityText: {
        status: c.status,
        meta: isRowArray(c.body) ? c.body.meta : c.body,
        rowCount: isRowArray(c.body) ? c.body.data.length : null,
        totalTokens: isRowArray(c.body) && c.body.data.length ? sumTokens(c.body.data).toString() : null,
      },
    };
    await sleep(2500);
  }

  /* Probe 9 — revision: the same completed day, read twice in this run. */
  if (runs("revision")) {
    console.log("probe: revision, same completed day read twice");
    const first = retrievals.find((r) => r.label === "single-day");
    const second = await get("revision-recheck", { start_date: lastCompleted, end_date: lastCompleted }, key);
    const summarize = (r: Retrieval | undefined) => {
      if (!r || !isRowArray(r.body)) return null;
      const { named, residual } = splitDay(r.body.data, lastCompleted);
      return {
        label: r.label,
        readAt: r.completedAt,
        bodyHash: r.bodyHash,
        asOf: (r.body.meta as { as_of?: string } | undefined)?.as_of ?? null,
        namedRowCount: named.length,
        namedTokens: sumTokens(named).toString(),
        residualTokens: sumTokens(residual).toString(),
        totalTokens: (sumTokens(named) + sumTokens(residual)).toString(),
        rankOrder: named.map((row) => row.model_permaslug),
      };
    };
    const a = summarize(first);
    const b = summarize(second);
    let delta: unknown = null;
    if (a && b) {
      const movedRows: { permaslug: string; before: string; after: string }[] = [];
      if (first && isRowArray(first.body) && isRowArray(second.body)) {
        const before = new Map(splitDay(first.body.data, lastCompleted).named.map((r) => [r.model_permaslug, r.total_tokens]));
        for (const row of splitDay(second.body.data, lastCompleted).named) {
          const prior = before.get(row.model_permaslug);
          if (prior !== undefined && prior !== row.total_tokens) {
            movedRows.push({ permaslug: row.model_permaslug, before: prior, after: row.total_tokens });
          }
        }
      }
      delta = {
        secondsBetweenReads: (Date.parse(b.readAt) - Date.parse(a.readAt)) / 1000,
        bodyHashChanged: a.bodyHash !== b.bodyHash,
        asOfChanged: a.asOf !== b.asOf,
        totalTokensChanged: a.totalTokens !== b.totalTokens,
        totalTokenDelta: (BigInt(b.totalTokens) - BigInt(a.totalTokens)).toString(),
        namedRowCountDelta: b.namedRowCount - a.namedRowCount,
        rankOrderChanged: JSON.stringify(a.rankOrder) !== JSON.stringify(b.rankOrder),
        movedRowCount: movedRows.length,
        movedRows: movedRows.slice(0, 10),
      };
    }
    report.revision = { first: a, second: b, delta };
  }

  /* ---------- write outputs ---------- */

  const stripped = retrievals.map((r) => ({ ...r, body: undefined }));
  writeFileSync(path.join(outDir, "retrievals.json"), JSON.stringify(stripped, null, 1));
  for (const r of retrievals) {
    writeFileSync(path.join(outDir, `body_${r.label}.json`), JSON.stringify(r.body, null, 1));
  }
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 1));
  console.log(`\nrequests made: ${retrievals.length}`);
  console.log(`report written: ${path.join(outDir, "report.json")}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
