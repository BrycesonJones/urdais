/**
 * The server-side entry point the map page renders from.
 *
 * The map is not an index and has no methodology draft gating it, so there is
 * only one question here: is a database configured, and does it hold published
 * facilities? A deployment without one serves an empty map that says so, never
 * a map quietly falling back to sample points — a dot is a claim that something
 * stands at a place, and nothing on this surface may fabricate one.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { describeDatabaseError } from "@/lib/db/connection";
import { loadFacilityReadModel } from "@/lib/facilities/read/load";
import { emptyFacilityReadModel, type FacilityMapReadModel } from "@/lib/facilities/read/read-model";

export async function facilityMapSurface(): Promise<FacilityMapReadModel> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return emptyFacilityReadModel("not_configured");

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    return await loadFacilityReadModel(sql);
  } catch (error) {
    // An unreachable database is an outage, not an empty world. The map renders
    // with no dots and the log says which failure it was.
    console.error(`map facilities: load failed (${describeDatabaseError(error)})`);
    return emptyFacilityReadModel("read_failed");
  } finally {
    await sql.end();
  }
}
