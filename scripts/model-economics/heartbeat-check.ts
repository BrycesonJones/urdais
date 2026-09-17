import { latestScheduledTokenVerificationHeartbeat, latestScheduledUtviHeartbeat } from "@/lib/operations/model-economics-heartbeats";
import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";

const SCHEDULER_MAX_AGE_DAYS = 2;
const DAY_MS = 86_400_000;

function ageDays(instant: string, now: Date): number {
  return (now.getTime() - new Date(instant).getTime()) / DAY_MS;
}

async function main(): Promise<void> {
  const allowLocalDefault = process.argv.includes("--local");
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault });
  if (!url) {
    console.error("no database url is configured; set DATABASE_URL or pass --local.");
    process.exitCode = 1;
    return;
  }

  const sql = await tokenSqlExecutor(url);
  const now = new Date();
  const failures: string[] = [];
  const fail = (detail: string) => failures.push(detail);

  try {
    const utvi = await latestScheduledUtviHeartbeat(sql);
    if (utvi === null) {
      console.log("UTVI scheduler        never recorded");
      fail("no scheduled UTVI heartbeat has been recorded");
    } else {
      const age = ageDays(utvi.ranAt, now);
      console.log(`UTVI scheduler        ${utvi.outcome} at ${utvi.ranAt} (${age.toFixed(2)}d ago)`);
      if (utvi.outcome !== "succeeded") fail(`latest scheduled UTVI run failed: ${utvi.detail ?? "no detail"}`);
      if (age > SCHEDULER_MAX_AGE_DAYS) fail(`UTVI scheduler heartbeat is ${age.toFixed(2)} days old`);
    }

    const tokens = await latestScheduledTokenVerificationHeartbeat(sql);
    if (tokens === null) {
      console.log("Token watchdog        never recorded");
      fail("no scheduled Token Price verification heartbeat has been recorded");
    } else {
      const age = ageDays(tokens.ranAt, now);
      console.log(`Token watchdog        ${tokens.outcome} at ${tokens.ranAt} (${age.toFixed(2)}d ago)`);
      console.log(`  latest verification ${tokens.latestVerifiedAt ?? "never"}`);
      console.log(`  review interval     ${tokens.reviewIntervalDays ?? "?"} days`);
      if (tokens.outcome === "failed") fail(`latest scheduled Token Price watchdog failed: ${tokens.detail ?? "no detail"}`);
      if (tokens.outcome === "review_due") fail("Token Price watchdog is alive, but human price verification is due");
      if (age > SCHEDULER_MAX_AGE_DAYS) fail(`Token Price watchdog heartbeat is ${age.toFixed(2)} days old`);
    }

    if (failures.length === 0) {
      console.log("model economics heartbeats: healthy");
    } else {
      console.log(`model economics heartbeats: ${failures.length} failure(s):`);
      for (const detail of failures) console.log(`  ${detail}`);
      process.exitCode = 1;
    }
  } finally {
    await sql.end();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
    process.exitCode = 1;
  })
  .finally(() => process.exit(process.exitCode ?? 0));
