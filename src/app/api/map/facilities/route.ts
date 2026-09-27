/**
 * The public facility surface: the physical infrastructure Urdais has placed.
 *
 * It serves verified or explicitly labelled research facilities only when
 * they are positioned, current, sourced and map-safe. A
 * record with no coordinates, a record positioned only to a city, a record
 * still under review, a power station with no evidenced link to compute — each
 * is a legitimate row in the database and none of them is here.
 *
 * The response fails its own contract rather than serving a dot nobody can
 * check: a facility with no cited source, a placement at city precision, an
 * internal field that leaked, or a verification past the horizon all answer
 * 500. A failed read is an outage, not an empty world, and says so.
 */

import { filterFacilityModel } from "@/lib/access/map-access";
import { resolveMapAccess } from "@/lib/access/server";
import { loadFacilityReadModel } from "@/lib/facilities/read/load";
import { emptyFacilityReadModel, validatePublicFacilities } from "@/lib/facilities/read/read-model";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(emptyFacilityReadModel("not_configured"));
  }

  // Premium layers are withheld here rather than in the browser. This endpoint
  // matters more than the map page: it is directly fetchable, so hiding markers in
  // React would leave every premium coordinate one `curl` away.
  const access = await resolveMapAccess();

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = filterFacilityModel(await loadFacilityReadModel(sql), access);
    // The filtered model still has to satisfy the facility contract: narrowing the
    // set must not produce a response that fails its own validation.
    const reasons = validatePublicFacilities(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`map facilities: response failed its own contract (${reasons.join("; ")})`);
      return new Response(null, { status: 500 });
    }
    return Response.json(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`map facilities: load failed (${detail})`);
    return new Response(null, { status: 500 });
  } finally {
    await sql.end();
  }
}
