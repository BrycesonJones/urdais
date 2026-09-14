import { handleListedInstruments } from "@/lib/ucpi/read/http";
import { listedReadOptions } from "@/lib/markets/load-market";

export const dynamic = "force-dynamic";

/** GET /v1/instruments — listed GPU market views. */
export async function GET() {
  return handleListedInstruments(listedReadOptions());
}
