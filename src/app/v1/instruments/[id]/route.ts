import { handleListedInstrument } from "@/lib/ucpi/read/http";
import { listedReadOptions } from "@/lib/markets/load-market";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /v1/instruments/:id — one listed GPU market view. */
export async function GET(_request: Request, context: RouteContext) {
  return handleListedInstrument((await context.params).id, listedReadOptions());
}
