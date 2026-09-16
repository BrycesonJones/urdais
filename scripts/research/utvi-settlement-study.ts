/**
 * The fourteen-day settlement study.
 *
 * Methodology 1.0.0 fixes the settlement lag at one calculation day on the strength of one
 * afternoon's measurements: the just-closed day accrued at roughly sixteen parts per million
 * per day, and days closed twenty-five hours or more did not move at all over the interval
 * observed. That is enough to choose a lag and not enough to be confident in it, because the
 * evidence for older days being frozen spans minutes rather than weeks and a batch correction
 * days later would not have appeared in it.
 *
 * So this runs alongside production rather than ahead of it. It reads the same public dataset,
 * writes to a local JSONL file, touches no Urdais database and changes no production
 * behaviour. If it finds that a settled day still moves, the answer is a methodology revision
 * with an effective date — not a silent change, and not an emergency, because the supersession
 * machinery already handles a late revision correctly.
 *
 * Each invocation appends one observation of D−1, D−2 and D−3. Run it daily.
 *
 * Usage:
 *   npx tsx scripts/research/utvi-settlement-study.ts [--out <file>] [--dates D-1,D-2,D-3]
 *
 * The API key comes from OPENROUTER_API_KEY and is never printed.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { hashDateRows } from "@/lib/utvi/normalize";
import { lastCompletedUtcDate } from "@/lib/utvi/settlement";
import { fetchDailyRankings, readApiKey, UTVI_API_KEY_ENV } from "@/lib/utvi/source/client";

const DEFAULT_OUT = "docs/research/utvi/settlement-study.jsonl";

function flag(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1] ?? null;
}

function loadLocalEnv(): void {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (process.env[key!] === undefined) process.env[key!] = value!.trim().replace(/^["']|["']$/g, "");
  }
}

/** One date's state at one instant. The hash is what detects a revision; `as_of` cannot. */
type Observation = {
  observedAt: string;
  observationDate: string;
  ageDays: number;
  sourceAsOf: string | null;
  contentHash: string | null;
  totalTokens: string | null;
  namedRowCount: number | null;
  residualTokens: string | null;
  outcome: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function observe(date: string, ageDays: number, observedAt: string): Promise<Observation> {
  const result = await fetchDailyRankings({ startDate: date, endDate: date });
  if (result.outcome !== "succeeded" || result.response === null) {
    return {
      observedAt,
      observationDate: date,
      ageDays,
      sourceAsOf: result.sourceAsOf,
      contentHash: null,
      totalTokens: null,
      namedRowCount: null,
      residualTokens: null,
      outcome: result.outcome,
    };
  }
  const rows = result.response.data.filter((row) => row.date === date);
  const named = rows.filter((row) => row.model_permaslug !== "other");
  const residual = rows.filter((row) => row.model_permaslug === "other");
  return {
    observedAt,
    observationDate: date,
    ageDays,
    sourceAsOf: result.sourceAsOf,
    contentHash: rows.length > 0 ? hashDateRows(rows) : null,
    totalTokens: rows.reduce((sum, row) => sum + BigInt(row.total_tokens), 0n).toString(),
    namedRowCount: named.length,
    residualTokens: residual.reduce((sum, row) => sum + BigInt(row.total_tokens), 0n).toString(),
    outcome: "succeeded",
  };
}

/** Drift against the newest prior observation of the same date, in parts per million. */
function driftReport(history: Observation[], current: Observation): string {
  const prior = history
    .filter((o) => o.observationDate === current.observationDate && o.contentHash !== null)
    .pop();
  if (!prior || current.totalTokens === null || prior.totalTokens === null) return "first observation";
  const before = BigInt(prior.totalTokens);
  const after = BigInt(current.totalTokens);
  if (before === after && prior.contentHash === current.contentHash) return "unchanged";
  const delta = after - before;
  const ppm = before === 0n ? 0 : Number((delta * 1_000_000_000n) / before) / 1000;
  const hashMoved = prior.contentHash !== current.contentHash;
  return `${delta >= 0n ? "+" : ""}${delta} tokens (${ppm.toFixed(3)} ppm)${hashMoved ? ", hash changed" : ", SAME HASH but different total"}`;
}

async function main(): Promise<void> {
  loadLocalEnv();
  if (readApiKey() === null) {
    console.error(`${UTVI_API_KEY_ENV} is not configured; nothing was observed`);
    process.exit(2);
  }

  const outPath = flag("out") ?? DEFAULT_OUT;
  mkdirSync(path.dirname(outPath), { recursive: true });

  const history: Observation[] = existsSync(outPath)
    ? readFileSync(outPath, "utf8")
        .split("\n")
        .filter((line) => line.trim())
        .map((line) => JSON.parse(line) as Observation)
    : [];

  const now = new Date();
  const observedAt = now.toISOString();
  const newest = lastCompletedUtcDate(now);
  const offsets = (flag("dates") ?? "1,2,3").split(",").map((n) => Number(n.trim()));

  console.log(`observing at ${observedAt}; newest completed UTC day is ${newest}`);
  console.log(`prior observations on file: ${history.length}\n`);

  for (const offset of offsets) {
    const date = new Date(Date.parse(`${newest}T00:00:00Z`) - (offset - 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const observation = await observe(date, offset - 1, observedAt);
    appendFileSync(outPath, `${JSON.stringify(observation)}\n`);
    console.log(
      `  D-${offset}  ${date}  age ${observation.ageDays}d  ` +
        `total=${observation.totalTokens ?? "-"}  hash=${observation.contentHash?.slice(0, 12) ?? "-"}  ` +
        `${driftReport(history, observation)}`,
    );
    // Beyond the source's sixty-second cache, and well inside its rate limit.
    await sleep(2_000);
  }

  console.log(`\nappended to ${outPath}`);
  console.log("Run daily for fourteen days, then read the file to decide whether the lag should change.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
