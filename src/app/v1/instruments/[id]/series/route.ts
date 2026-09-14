import { handleListedSeries } from "@/lib/ucpi/read/http";
import { listedReadOptions } from "@/lib/markets/load-market";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /v1/instruments/:id/series — calculation series only; empty until a run exists. */
export async function GET(_request: Request, context: RouteContext) {
  return handleListedSeries((await context.params).id, listedReadOptions());
}
