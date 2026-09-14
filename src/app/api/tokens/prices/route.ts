import { loadTokenReadCatalog, visibleTokenPricesResponse } from "@/lib/tokens/read/load";
import { validatePublicTokenPricesResponse } from "@/lib/tokens/read/api-contract";

/**
 * Token-price catalog. Production remains `{ series: [] }` until observations
 * satisfy public publication policy. Development may return Wave-1 research
 * preview series from the local database.
 */
export async function GET(): Promise<Response> {
  const body = visibleTokenPricesResponse(await loadTokenReadCatalog());
  const reasons = validatePublicTokenPricesResponse(JSON.parse(JSON.stringify(body)) as unknown);
  if (reasons.length > 0) return new Response(null, { status: 500 });
  return Response.json(body);
}
