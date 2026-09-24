/**
 * Market Share production verification. Read-only.
 *
 * There is no backfill to run, and the absence is the point: Market Share persists nothing, so
 * there is no history to build and nothing that could drift from the observations behind it.
 * What this script does instead is derive every published date from production UTVI and prove
 * the derivation holds across the whole series — which is the same work a backfill would have
 * had to prove, minus the rows.
 *
 * It re-hits no source. Every figure below comes from observations UTVI already ingested.
 *
 * It also asserts **freshness**, which is the check that has no owner anywhere else. Market
 * Share has no ingestion of its own: it advances only when the UTVI cron writes a new date, so
 * a cron that fails silently does not break anything visible — the page keeps rendering
 * yesterday, correctly and forever. Comparing the latest published date against the last
 * completed UTC day is the one assertion that turns that into a failure someone sees.
 *
 * Usage:
 *   npm run market-share:production:check                against the resolved database
 *   npm run market-share:production:check -- --local     allow the local development database
 *   npm run market-share:production:check -- --json      machine-readable summary
 */

import { checkAll } from "@/lib/market-share/checks";
import { loadAllShares, usableForMarketShare, type DatedShare } from "@/lib/market-share/load";
import { MARKET_SHARE_METHODOLOGY_VERSION } from "@/lib/market-share/view";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import { daysBetween, lastCompletedUtcDate } from "@/lib/utvi/settlement";

function sum(values: Iterable<bigint>): bigint {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/** A token count as a readable magnitude. The exact figure stays in the JSON output. */
function compact(value: bigint): string {
  const units = [
    [1_000_000_000_000_000n, "P"],
    [1_000_000_000_000n, "T"],
    [1_000_000_000n, "B"],
    [1_000_000n, "M"],
  ] as const;
  for (const [scale, suffix] of units) {
    if (value >= scale) return `${(Number((value * 100n) / scale) / 100).toFixed(2)} ${suffix}`;
  }
  return value.toString();
}

async function main(): Promise<void> {
  const allowLocalDefault = process.argv.includes("--local");
  const asJson = process.argv.includes("--json");

  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
  if (!url) {
    console.error("no database url is configured.");
    console.error("  remedy: set DATABASE_URL (or URDAIS_DATABASE_URL), or pass --local.");
    process.exitCode = 1;
    return;
  }

  const sql = await tokenSqlExecutor(url);
  const shares = await loadAllShares(sql);

  if (shares.length === 0) {
    console.error("no UTVI value is published; Market Share has nothing to derive.");
    process.exitCode = 1;
    return;
  }

  const failures = checkAll(shares.map((share) => share.derivation));
  const latest = shares[shares.length - 1]!;
  const first = shares[0]!;

  // Coverage: which UTC dates inside the span carry no point at all. Reported rather than
  // filled, because a date the source never served is not a zero.
  const present = new Set(shares.map((share) => share.derivation.date));
  const gaps: string[] = [];
  for (
    let t = Date.parse(`${first.derivation.date}T00:00:00Z`);
    t <= Date.parse(`${latest.derivation.date}T00:00:00Z`);
    t += 86_400_000
  ) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (!present.has(date)) gaps.push(date);
  }

  const modelRows = shares.reduce((total, share) => total + share.derivation.models.length, 0);
  const labRows = shares.reduce((total, share) => total + share.derivation.labs.length, 0);
  const distinctModels = new Set(shares.flatMap((s) => s.derivation.models.map((row) => row.id)));
  const distinctLabs = new Set(shares.flatMap((s) => s.derivation.labs.map((row) => row.id)));

  const totalObserved = sum(shares.map((s) => BigInt(s.derivation.totalObservedTokens)));
  const unattributed = sum(shares.map((s) => BigInt(s.derivation.unattributed.tokens)));
  const sourceResidual = sum(shares.map((s) => BigInt(s.derivation.sourceResidual?.tokens ?? "0")));
  const undisclosed = sum(shares.map((s) => BigInt(s.derivation.unattributedBreakdown.undisclosed)));
  const platform = sum(shares.map((s) => BigInt(s.derivation.unattributedBreakdown.platform)));
  const unmapped = sum(shares.map((s) => BigInt(s.derivation.unattributedBreakdown.unmapped)));
  const datesWithoutResidual = shares.filter((s) => s.derivation.sourceResidual === null).length;

  const pct = (part: bigint) => `${(Number((part * 1_000_000n) / totalObserved) / 10_000).toFixed(3)} %`;

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          dates: { count: shares.length, first: first.derivation.date, last: latest.derivation.date, gaps },
          rows: { modelRows, labRows, distinctModels: distinctModels.size, distinctLabs: distinctLabs.size },
          volume: {
            totalObserved: totalObserved.toString(),
            sourceResidual: sourceResidual.toString(),
            unattributed: unattributed.toString(),
            undisclosed: undisclosed.toString(),
            platform: platform.toString(),
            unmapped: unmapped.toString(),
          },
          datesWithoutResidual,
          failures,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`methodology     Market Share, under UTVI ${MARKET_SHARE_METHODOLOGY_VERSION}`);
    console.log(`dates           ${shares.length}  (${first.derivation.date} .. ${latest.derivation.date})`);
    console.log(`coverage gaps   ${gaps.length === 0 ? "none" : gaps.join(", ")}  (absent, never filled)`);
    console.log(`model rows      ${modelRows.toLocaleString()}  across ${distinctModels.size} distinct permaslugs`);
    console.log(`lab rows        ${labRows.toLocaleString()}  across ${distinctLabs.size} canonical labs`);
    console.log("");
    console.log(`observed        ${compact(totalObserved)} tokens`);
    console.log(`source residual ${compact(sourceResidual)}  ${pct(sourceResidual)}   OpenRouter 'other', never a lab`);
    console.log(`unattributed    ${compact(unattributed)}  ${pct(unattributed)}   named models with no evidenced lab`);
    console.log(`  undisclosed   ${compact(undisclosed)}  ${pct(undisclosed)}`);
    console.log(`  platform      ${compact(platform)}  ${pct(platform)}`);
    console.log(`  unmapped      ${compact(unmapped)}  ${pct(unmapped)}`);
    console.log(`dates w/o tail  ${datesWithoutResidual}  (legitimately absent, not zero)`);
    console.log("");
    console.log(`latest ${latest.derivation.date}  (${latest.derivation.settlementState}, revision ${latest.lineage.revisionNumber})`);
    console.log(`  denominator   ${latest.derivation.totalObservedTokens}`);
    for (const row of latest.derivation.labs.slice(0, 5)) {
      console.log(`  ${row.sharePercent.toFixed(3).padStart(7)} %  ${row.label}`);
    }
    console.log(`  ${latest.derivation.unattributed.sharePercent.toFixed(3).padStart(7)} %  unattributed`);
    if (latest.derivation.sourceResidual !== null) {
      console.log(`  ${latest.derivation.sourceResidual.sharePercent.toFixed(3).padStart(7)} %  source residual`);
    }
    console.log("");

    console.log(freshnessReport(shares, new Date()).map((line) => line).join("\n"));
    console.log("");

    if (failures.length === 0) {
      console.log(`reconciliation  ok on all ${shares.length} dates`);
    } else {
      console.log(`reconciliation  ${failures.length} failure(s):`);
      for (const failure of failures.slice(0, 40)) {
        console.log(`  ${failure.date}  [${failure.check}] ${failure.detail}`);
      }
      if (failures.length > 40) console.log(`  ... and ${failures.length - 40} more`);
    }
  }

  if (failures.length > 0 || stale(shares, new Date())) process.exitCode = 1;
}

/**
 * How far behind the source the published series is.
 *
 * The cron collects the day that just closed, at 02:00 UTC. So for the last completed UTC day
 * `L`, a lag of 0 means today's run has happened and a lag of 1 means it has not yet — both
 * ordinary. A lag of 2 or more means a scheduled run did not produce a date, which is the
 * failure this whole check exists for, because nothing else on the surface reports it: Market
 * Share keeps rendering the last good date, correctly, indefinitely.
 */
const STALE_AFTER_DAYS = 2;

function latestHealthy(shares: readonly DatedShare[]): DatedShare | null {
  for (let i = shares.length - 1; i >= 0; i -= 1) {
    const share = shares[i]!;
    if (usableForMarketShare(share)) return share;
  }
  return null;
}

function stale(shares: readonly DatedShare[], now: Date): boolean {
  const healthy = latestHealthy(shares);
  if (healthy === null) return true;
  return daysBetween(healthy.derivation.date, lastCompletedUtcDate(now)) >= STALE_AFTER_DAYS;
}

/** The four freshness assertions, each printed with its verdict rather than only on failure. */
function freshnessReport(shares: readonly DatedShare[], now: Date): string[] {
  const lines: string[] = ["freshness"];
  const healthy = latestHealthy(shares);
  const lastClosed = lastCompletedUtcDate(now);

  if (healthy === null) {
    lines.push(`  FAIL  no date reconciles; Market Share can serve nothing`);
    return lines;
  }

  const lag = daysBetween(healthy.derivation.date, lastClosed);
  const verdict = lag >= STALE_AFTER_DAYS ? "FAIL" : "ok  ";
  lines.push(`  ${verdict}  latest healthy ${healthy.derivation.date}, last completed UTC day ${lastClosed}, lag ${lag} day(s)`);
  if (lag >= STALE_AFTER_DAYS) {
    lines.push(`        a scheduled UTVI run has not produced a date; Market Share cannot advance on its own`);
  }

  // The denominator a reader sees must be the value UTVI published for that date. These come
  // from different columns of different tables and are only equal because the derivation used
  // the publication as its denominator -- worth asserting rather than assuming.
  const denominatorMatches = healthy.derivation.totalObservedTokens === healthy.lineage.totalObservedTokens.toString();
  lines.push(`  ${denominatorMatches ? "ok  " : "FAIL"}  denominator ${healthy.derivation.totalObservedTokens} matches the UTVI published value`);

  // The latest date is also the latest *published* date: a healthy older date being served
  // while a newer one exists would mean the newer one is broken.
  const newest = shares[shares.length - 1]!;
  const isNewest = newest.derivation.date === healthy.derivation.date;
  lines.push(`  ${isNewest ? "ok  " : "FAIL"}  latest published date ${newest.derivation.date} is the latest healthy date`);

  const residual = healthy.derivation.sourceResidual?.sharePercent ?? 0;
  const labSum =
    healthy.derivation.labs.reduce((t, r) => t + r.sharePercent, 0) +
    healthy.derivation.unattributed.sharePercent +
    residual;
  lines.push(`  ${Math.abs(labSum - 100) <= 0.001 ? "ok  " : "FAIL"}  latest decomposition reconciles to ${labSum.toFixed(6)} %`);

  return lines;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
