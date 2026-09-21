/**
 * The public Interconnection Queue surface: what is waiting to connect across six markets, how
 * long it has waited, how much of it historically made it through, and how long that took.
 *
 * One coherent read model rather than several endpoints, because the metrics only make sense
 * together: a completion rate without its cohort years and sample size is a number nobody can
 * check, and an MW figure without the field it came from is not comparable to anything.
 *
 * SPP never appears. Its terms permit copying "except when such materials will be used in
 * commercial publication", so it is computed internally and filtered out in SQL — and named in
 * `excludedMarkets`, because a silent omission from a multi-market figure is its own kind of
 * wrong answer.
 *
 * The response fails its own contract rather than serving numbers nobody checked: a blocked
 * market that reached the model, a live metric with no value, or an MW figure that does not name
 * its source field all answer 500.
 */

import {
  loadQueueAnalytics, unavailableQueueAnalytics, validatePublicQueueAnalytics,
} from "@/lib/interconnection-queue/analytics/read";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unavailableQueueAnalytics());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadQueueAnalytics(sql);
    const reasons = validatePublicQueueAnalytics(model);
    if (reasons.length > 0) {
      console.error(`interconnection queue read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`interconnection queue read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
