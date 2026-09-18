/**
 * The public facility surface: the physical infrastructure Urdais has placed.
 *
 * It serves published, positioned, sourced facilities and nothing else. A
 * record with no coordinates, a record positioned only to a city, a record
 * still under review, a power station with no evidenced link to compute — each
 * is a legitimate row in the database and none of them is here.
 *
 * The response fails its own contract rather than serving a dot nobody can
 * check: a facility with no cited source, a placement at city precision, an
 * internal field that leaked, or a verification past the horizon all answer
 * 500. A failed read is an outage, not an empty world, and says so.
 */

import { loadFacilityReadModel } from "@/lib/facilities/read/load";
import { emptyFacilityReadModel, validatePublicFacilities } from "@/lib/facilities/read/read-model";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    return Response.json(emptyFacilityReadModel("not_configured"));
  }

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    const model = await loadFacilityReadModel(sql);
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
