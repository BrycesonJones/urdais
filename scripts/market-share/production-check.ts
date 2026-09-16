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
 * Usage:
 *   npm run market-share:production:check                against the resolved database
 *   npm run market-share:production:check -- --local     allow the local development database
 *   npm run market-share:production:check -- --json      machine-readable summary
 */

import { checkAll } from "@/lib/market-share/checks";
import { loadAllShares } from "@/lib/market-share/load";
import { MARKET_SHARE_METHODOLOGY_VERSION } from "@/lib/market-share/view";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

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

  if (failures.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
