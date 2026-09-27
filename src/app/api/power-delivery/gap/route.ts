/**
 * The public Power Delivery Gap surface: ERCOT forecast peak demand minus approved planning
 * capacity, by season and forecast year.
 *
 * One market, because one market's demand and capacity describe the same thing closely enough to
 * be differenced. The other six are served as named absences with their reasons rather than as
 * empty series, so a reader can tell a market Urdais cannot measure from a product that is broken.
 *
 * The response fails its own contract rather than serving a number nobody checked: a missing
 * disclosure, a missing source, or a gap that is not the difference of its own demand and capacity
 * all answer 500.
 */

import {
  loadDeliveryGapReadModel, unconfiguredDeliveryGapReadModel, validatePublicDeliveryGap,
} from "@/lib/power-delivery/gap/read";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { denyUnlessEntitled } from "@/lib/access/server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  // Premium authorization, before any read. Gating the page and leaving its JSON
  // callable would be the bypass; this is the same decision the page makes, from
  // the same module, so the two cannot disagree. Returns null -- and costs one
  // environment check -- while enforcement is inactive.
  const denied = await denyUnlessEntitled("power_analytics");
  if (denied) return denied;

  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(unconfiguredDeliveryGapReadModel());
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadDeliveryGapReadModel(sql);
    const reasons = validatePublicDeliveryGap(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`power delivery gap read: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`power delivery gap read: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
