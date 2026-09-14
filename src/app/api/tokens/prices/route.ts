import { listPublicTokenSeries } from "@/lib/tokens/read/series";
import { loadTokenReadCatalog } from "@/lib/tokens/read/load";
import { publicTokenPricesResponse, validatePublicTokenPricesResponse } from "@/lib/tokens/read/api-contract";

/**
 * Public token-price catalog. Allowlisted series only; empty while
 * production-publicable observations do not exist.
 */
export async function GET(): Promise<Response> {
  const body = publicTokenPricesResponse(listPublicTokenSeries(loadTokenReadCatalog()));
  const reasons = validatePublicTokenPricesResponse(JSON.parse(JSON.stringify(body)) as unknown);
  if (reasons.length > 0) return new Response(null, { status: 500 });
  return Response.json(body);
}
