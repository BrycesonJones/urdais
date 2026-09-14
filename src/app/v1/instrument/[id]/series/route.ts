import { handleListedSeries } from "@/lib/ucpi/read/http";
import { listedReadOptions } from "@/lib/markets/load-market";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /v1/instrument/:id/series — alias of the instruments series member. */
export async function GET(_request: Request, context: RouteContext) {
  return handleListedSeries((await context.params).id, listedReadOptions());
}
