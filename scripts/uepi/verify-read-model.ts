/**
 * Read-only verification of the UEPI-3 read path against production.
 *
 * It reads. It never writes, and it opens no transaction. What it checks is that what the
 * application would serve equals what the database holds -- exactly, not to display precision --
 * and that the four markets Urdais does not publish are absent from every layer above the query.
 */

import { createTokenSqlExecutor, resolveTokenDatabaseUrl } from "@/lib/tokens/read/database";
import { loadPublishableSeries, loadReleasedDays, loadUepiReadModel, loadUepiSeries } from "@/lib/uepi/read/load";
import { validatePublicUepi } from "@/lib/uepi/read/read-model";
import { rangeChanges } from "@/lib/uepi/read/ranges";
import { uepiInstrumentsFrom } from "@/lib/uepi/read/instrument";
import { loadUepiInstrumentInputs } from "@/lib/uepi/read/surface";
import { SPECIFICATION_DIGEST } from "@/lib/uepi/methodology";
import { UEPI_SERIES_IDS, type UepiSeriesId } from "@/lib/uepi/types";

const problems: string[] = [];
const check = (ok: boolean, label: string) => {
  process.stdout.write(`${ok ? "  ok  " : "FAIL  "}${label}\n`);
  if (!ok) problems.push(label);
};

async function main() {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: false });
  if (!url) throw new Error("no database configured");
  const target = new URL(url);
  process.stdout.write(`reading host '${target.hostname}', database '${target.pathname.slice(1)}'\n\n`);
  const sql = await createTokenSqlExecutor(url);

  try {
    /* ---------- what the database actually holds ---------- */
    const { rows: stored } = await sql.query(
      `select b.slug, b.publication_posture, count(*)::int as days,
              max(d.value_usd_per_mwh::text) filter (where d.operating_date = max_date.d) as ignored
         from pipeline.uepi_daily_values d
         join reference.power_price_benchmarks b on b.id = d.benchmark_id
         cross join lateral (select max(d2.operating_date) as d
                               from pipeline.uepi_daily_values d2
                              where d2.benchmark_id = d.benchmark_id and d2.superseded_by_id is null) max_date
        where d.superseded_by_id is null
        group by b.slug, b.publication_posture
        order by b.slug`,
      [],
    );
    process.stdout.write("production, by series:\n");
    for (const row of stored) {
      process.stdout.write(`  ${String(row.slug).padEnd(12)} ${String(row.days).padStart(4)} days  ${row.publication_posture}\n`);
    }
    process.stdout.write("\n");

    /* ---------- 1. the publication gate ---------- */
    process.stdout.write("1. publication gate\n");
    const publishable = (await loadPublishableSeries(sql)).map((row) => row.seriesId);
    check(
      JSON.stringify(publishable) === JSON.stringify(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]),
      `exposed: ${publishable.join(", ")}`,
    );
    for (const hidden of ["uepi-miso", "uepi-spp", "uepi-iso-ne", "uepi-pjm"] as UepiSeriesId[]) {
      const rows = stored.find((row) => row.slug === hidden);
      check(!publishable.includes(hidden), `${hidden} not exposed (holds ${rows?.days ?? 0} released days)`);
    }

    /* ---------- 2. the payload contract ---------- */
    process.stdout.write("\n2. the payload the API would serve\n");
    const model = await loadUepiReadModel(sql, { includePoints: true });
    const reasons = validatePublicUepi(JSON.parse(JSON.stringify(model)));
    check(reasons.length === 0, `contract: ${reasons.length === 0 ? "clean" : reasons.join("; ")}`);
    const serialized = JSON.stringify(model);
    for (const hidden of ["uepi-miso", "uepi-spp", "uepi-iso-ne", "uepi-pjm", "MISO", "SPP", "ISO-NE", "PJM"]) {
      check(!serialized.includes(hidden), `payload contains no "${hidden}"`);
    }
    check(model.family.hasCompositeLevel === false, "payload declares no composite level");
    check(
      model.series.every((series) => series.methodologyDigest === SPECIFICATION_DIGEST && series.methodologyVersion === "1.0.0"),
      "every series carries uepi 1.0.0 and the frozen digest",
    );

    /* ---------- 3. exact values, against the database ---------- */
    process.stdout.write("\n3. served values against stored values, exactly\n");
    for (const seriesId of publishable as UepiSeriesId[]) {
      const days = (await loadReleasedDays(sql, [seriesId])).get(seriesId) ?? [];
      const { rows: raw } = await sql.query(
        `select to_char(d.operating_date,'YYYY-MM-DD') as day, d.value_usd_per_mwh::text as value,
                d.observation_count
           from pipeline.uepi_daily_values d
           join reference.power_price_benchmarks b on b.id = d.benchmark_id
          where b.slug = $1 and d.superseded_by_id is null
          order by d.operating_date`,
        [seriesId],
      );
      const mismatches = raw.filter((row, index) => {
        const served = days[index];
        return (
          served === undefined ||
          served.operatingDate !== row.day ||
          served.valueUsdPerMwh !== String(row.value) ||
          served.observationCount !== Number(row.observation_count)
        );
      });
      check(raw.length === days.length && mismatches.length === 0, `${seriesId}: ${days.length} days, 0 mismatches`);

      // And the number the surface finally renders round-trips to the stored decimal.
      const view = await loadUepiSeries(sql, seriesId);
      const latest = raw[raw.length - 1]!;
      check(
        String(view!.latest!.valueUsdPerMwh) === String(Number(latest.value)) &&
          Number(latest.value) === view!.latest!.valueUsdPerMwh,
        `${seriesId}: latest ${latest.day} = ${latest.value} served as ${view!.latest!.valueUsdPerMwh}`,
      );
    }

    /* ---------- 4. the DST days ---------- */
    process.stdout.write("\n4. daylight saving, as served\n");
    for (const seriesId of publishable as UepiSeriesId[]) {
      const days = (await loadReleasedDays(sql, [seriesId])).get(seriesId) ?? [];
      for (const [date, hours] of [["2026-03-08", 23], ["2025-11-02", 25]] as const) {
        const day = days.find((candidate) => candidate.operatingDate === date);
        check(
          day !== undefined && day.observationCount === hours && day.expectedObservationCount === hours,
          `${seriesId} ${date}: ${day?.observationCount ?? "absent"} hours served (expected ${hours})`,
        );
      }
    }

    /* ---------- 5. the two intended absences ---------- */
    process.stdout.write("\n5. the two intended absences, still absent and unfabricated\n");
    const ercot = (await loadReleasedDays(sql, ["uepi-ercot"])).get("uepi-ercot") ?? [];
    const gap = ercot.find((day) => day.operatingDate === "2026-03-07");
    check(gap === undefined, "ERCOT 2026-03-07 absent: no point, no null row, no interpolated value");
    check(
      ercot.some((day) => day.operatingDate === "2026-03-06") && ercot.some((day) => day.operatingDate === "2026-03-08"),
      "ERCOT 2026-03-06 and 2026-03-08 both present, so the gap is a gap and not a truncation",
    );
    const after = (await loadUepiSeries(sql, "uepi-ercot"))!;
    const march8 = after.points.findIndex((point) => point.operatingDate === "2026-03-08");
    check(
      after.points[march8 - 1]?.operatingDate === "2026-03-06",
      "the served ERCOT series steps 03-06 -> 03-08 with nothing between",
    );
    // MISO is not served at all, so its withheld day cannot reach a surface by any route.
    const { rows: miso } = await sql.query(
      `select count(*)::int as n from pipeline.uepi_daily_values d
         join reference.power_price_benchmarks b on b.id = d.benchmark_id
        where b.slug = 'uepi-miso' and d.operating_date = date '2026-05-19' and d.superseded_by_id is null`,
      [],
    );
    check(Number(miso[0]!.n) === 0, "MISO 2026-05-19 still has no released value in production");

    /* ---------- 6. ranges and the D rule over real history ---------- */
    process.stdout.write("\n6. horizons over the real history\n");
    for (const seriesId of publishable as UepiSeriesId[]) {
      const days = (await loadReleasedDays(sql, [seriesId])).get(seriesId) ?? [];
      const horizons = rangeChanges(days);
      const offered = horizons.filter((entry) => entry.change.basis !== "unavailable").map((entry) => entry.range);
      check(offered.length === 6, `${seriesId}: ${offered.length}/6 horizons measurable (${offered.join(", ")})`);
      for (const { range, change } of horizons) {
        if (change.basis === "unavailable") continue;
        const ok =
          change.absoluteChangeUsdPerMwh !== null &&
          change.baseOperatingDate !== null &&
          (change.basis === "percent") === (change.percentChange !== null);
        check(ok, `${seriesId} ${range}: ${change.basis}, since ${change.baseOperatingDate}`);
      }
    }

    /* ---------- 7. the market surface ---------- */
    process.stdout.write("\n7. the instruments the page would render\n");
    const instruments = uepiInstrumentsFrom(await loadUepiInstrumentInputs(sql));
    check(
      JSON.stringify(instruments.map((row) => row.id)) === JSON.stringify(["uepi-ercot", "uepi-caiso", "uepi-nyiso"]),
      `instruments: ${instruments.map((row) => row.id).join(", ")}`,
    );
    check(instruments.every((row) => row.provenance === "production"), "every instrument declares production provenance");
    check(instruments.every((row) => row.series.intraday.length === 0), "no instrument has a fabricated intraday tail");
    for (const retired of UEPI_SERIES_IDS.map((id) => id.replace("uepi-", "power-"))) {
      check(!JSON.stringify(instruments).includes(retired), `no instrument mentions the retired id ${retired}`);
    }
    for (const instrument of instruments) {
      check(
        instrument.availableRanges.length === 6,
        `${instrument.id}: ${instrument.availableRanges.length}/6 ranges offered, latest ${new Date(instrument.snapshot.asOf * 1000).toISOString().slice(0, 10)} = ${instrument.snapshot.value}`,
      );
    }
  } finally {
    await sql.end();
  }

  process.stdout.write(`\n${problems.length === 0 ? "ALL CHECKS PASSED" : `${problems.length} FAILED`}\n`);
  if (problems.length > 0) process.exitCode = 1;
}

void main();
