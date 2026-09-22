/**
 * One UMPI series, addressed by code.
 *
 * `?series=UMPI-KR-DRAM-PPI` or `?series=UMPI-KR-DRAM-EXPORT-UV`. An unknown code is a 404; a
 * known series that has published nothing is a 200 carrying an explicit reason, because those
 * are different facts and a client should be able to distinguish them.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUmpiSeries } from "@/lib/umpi/read/load";
import { UMPI_SERIES_CODES } from "@/lib/umpi/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const requested = new URL(request.url).searchParams.get("series");
  if (requested === null || !UMPI_SERIES_CODES.includes(requested as (typeof UMPI_SERIES_CODES)[number])) {
    return Response.json(
      { error: "unknown_series", available: UMPI_SERIES_CODES },
      { status: 404 },
    );
  }

  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json({ error: "unavailable", reason: "no database is configured" }, { status: 503 });
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const series = await loadUmpiSeries(sql, requested);
    if (series === null) {
      return Response.json({ error: "unknown_series", available: UMPI_SERIES_CODES }, { status: 404 });
    }
    return Response.json(series);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`umpi series read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
