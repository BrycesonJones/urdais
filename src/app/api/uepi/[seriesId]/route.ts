/**
 * One UEPI series, addressed by its public series id.
 *
 * `/api/uepi/uepi-ercot`, optionally `?range=1Y`. The response carries the series' released
 * history over that window, the §I.2 metadata, and a change object per horizon under §D and §E.
 *
 * A series Urdais does not publish answers **404, exactly as an unknown id does**, and that is
 * the point rather than an oversight. `uepi-miso` exists in production and carries 396 released
 * daily values; distinguishing it from a typo in the response would tell a client that Urdais
 * holds MISO data it will not show, which is the fact the publication gate exists to withhold.
 * The `available` list names only what may be served.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { describeDatabaseError } from "@/lib/db/connection";
import { loadPublishableSeries, loadReleasedDays, seriesViewFrom, toPoint } from "@/lib/uepi/read/load";
import { rangeChanges, windowDays } from "@/lib/uepi/read/ranges";
import { changeReasons, validatePublicUepi, buildUepiReadModel } from "@/lib/uepi/read/read-model";
import { isUepiSeriesId } from "@/lib/uepi/types";
import type { SqlExecutor } from "@/lib/uepi/store";
import { DETAIL_RANGES, type DetailRange } from "@/types/market";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ seriesId: string }> };

function requestedRange(url: URL): DetailRange | null | "invalid" {
  const raw = url.searchParams.get("range");
  if (raw === null) return null;
  return (DETAIL_RANGES as readonly string[]).includes(raw) ? (raw as DetailRange) : "invalid";
}

export async function GET(request: Request, { params }: Params): Promise<Response> {
  const seriesId = (await params).seriesId;
  const range = requestedRange(new URL(request.url));
  if (range === "invalid") {
    return Response.json({ error: "unknown_range", available: DETAIL_RANGES }, { status: 400 });
  }

  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json({ error: "unavailable", reason: "no database is configured" }, { status: 503 });
  }

  let sql: SqlExecutor & { end: () => Promise<void> };
  try {
    sql = await createTokenSqlExecutor(databaseUrl);
  } catch (error) {
    // Handled here rather than thrown at the framework: the failure arrives before there is an
    // executor to close, and an escaping error produces a 500 with nothing in the log.
    console.error(`uepi series read: could not connect (${describeDatabaseError(error)})`);
    return new Response(null, { status: 500 });
  }

  try {
    const publishable = await loadPublishableSeries(sql);
    const row = isUepiSeriesId(seriesId)
      ? publishable.find((candidate) => candidate.seriesId === seriesId)
      : undefined;
    if (row === undefined) {
      // One answer for "never existed" and "exists and is not published". See the note above.
      return Response.json(
        { error: "unknown_series", available: publishable.map((candidate) => candidate.seriesId) },
        { status: 404 },
      );
    }

    const all = (await loadReleasedDays(sql, [row.seriesId])).get(row.seriesId) ?? [];
    // Every horizon's change is measured over the **whole** history, never over the requested
    // window: a 1-year change computed from a 1-month slice would silently become a 1-month
    // change wearing a 1Y label. The window only decides which points are drawn.
    const changes = rangeChanges(all);
    const drawn = range === null ? all : windowDays(all, range);
    // Metadata, latest value and the day-over-day change all describe the whole series and are
    // independent of the window; only `points` narrows.
    const series = { ...seriesViewFrom(row, all, { includePoints: false }), points: drawn.map(toPoint) };
    const payload = { ...series, range: range ?? "ALL", rangeChanges: changes };

    // The same contract the family route enforces, applied to a one-series model so a per-series
    // response cannot leak what the family response may not.
    const reasons = [
      ...validatePublicUepi(JSON.parse(JSON.stringify(buildUepiReadModel([series]))) as unknown),
      ...changes.flatMap(({ range: horizon, change }) => changeReasons(`${row.seriesId} ${horizon}`, change)),
    ];
    if (reasons.length > 0) {
      console.error(`uepi series read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(payload);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`uepi series read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
