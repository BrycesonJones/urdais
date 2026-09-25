/**
 * Read-only verification of stored UEPI history.
 *
 * Recomputes every released daily value from the hourly observations that are stored beside it,
 * rather than trusting that the number in the table is the number those hours imply. That is a
 * different question from "does the calculator work", which unit tests answer: this asks whether
 * what is *in the database* is internally consistent, which is the question that matters after a
 * backfill, a supersession, or a partially applied migration.
 *
 * Writes nothing, ever.
 *
 *   npx tsx scripts/uepi/verify.ts [--market caiso]
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { meanDecimal } from "@/lib/uepi/decimal";
import { SPECIFICATION_DIGEST, SPECIFICATION_VERSION } from "@/lib/uepi/methodology";

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

async function main(): Promise<void> {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: true });
  if (!url) throw new Error("no database URL is configured");
  const target = new URL(url);
  process.stderr.write(`reading host '${target.hostname}', database '${target.pathname.slice(1)}'\n`);

  const market = flag("market");
  const slug = market === null ? null : market.startsWith("uepi-") ? market : `uepi-${market}`;
  const sql = await createTokenSqlExecutor(url);
  let failures = 0;

  try {
    const days = await sql.query(
      `select b.slug, v.operating_date::text as operating_date, v.value_usd_per_mwh::text as value,
              v.observation_count, v.expected_observation_count, v.input_digest,
              v.specification_digest, mv.version as specification_version, v.price_construct
         from pipeline.uepi_daily_values v
         join reference.power_price_benchmarks b on b.id = v.benchmark_id
         join reference.methodology_versions mv on mv.id = v.methodology_version_id
        where v.superseded_by_id is null and ($1::text is null or b.slug = $1)
        order by b.slug, v.operating_date`,
      [slug]);

    for (const day of days.rows) {
      const hours = await sql.query(
        `select o.price_usd_per_mwh::text as price
           from pipeline.uepi_price_observations o
           join reference.power_price_benchmarks b on b.id = o.benchmark_id
          where b.slug = $1 and o.operating_date = $2 and o.superseded_by_id is null
          order by o.interval_start`,
        [day.slug, day.operating_date]);

      const recomputed = hours.rows.length === 0
        ? null
        : meanDecimal(hours.rows.map((row) => String(row.price)), 6);
      const problems: string[] = [];
      if (recomputed === null) problems.push("no stored hours");
      else if (recomputed !== String(day.value)) problems.push(`stored ${day.value}, hours imply ${recomputed}`);
      if (hours.rows.length !== Number(day.observation_count)) {
        problems.push(`${hours.rows.length} stored hours against a recorded count of ${day.observation_count}`);
      }
      if (Number(day.observation_count) !== Number(day.expected_observation_count)) {
        problems.push(`incomplete: ${day.observation_count} of ${day.expected_observation_count}`);
      }
      if (String(day.specification_version) !== SPECIFICATION_VERSION) {
        problems.push(`specification ${day.specification_version}`);
      }
      if (String(day.specification_digest) !== SPECIFICATION_DIGEST) problems.push("specification digest differs");

      if (problems.length > 0) {
        failures += 1;
        process.stdout.write(`FAIL ${day.slug} ${day.operating_date}: ${problems.join("; ")}\n`);
      } else {
        process.stdout.write(
          `ok   ${day.slug} ${day.operating_date} ${day.value} $/MWh `
          + `(${day.observation_count}h, ${day.price_construct}, spec ${day.specification_version})\n`);
      }
    }

    const coverage = await sql.query(
      `select b.slug, count(*) as days, min(v.operating_date)::text as first, max(v.operating_date)::text as last
         from pipeline.uepi_daily_values v
         join reference.power_price_benchmarks b on b.id = v.benchmark_id
        where v.superseded_by_id is null group by b.slug order by b.slug`, []);
    process.stdout.write("\ncoverage:\n");
    for (const row of coverage.rows) {
      process.stdout.write(`  ${row.slug}: ${row.days} day(s), ${row.first} .. ${row.last}\n`);
    }
    process.stdout.write(`\n${days.rows.length} released day(s) checked, ${failures} failing\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
  process.exit(1);
});
