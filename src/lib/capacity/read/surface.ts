/**
 * Server-side loading for the Available Compute Capacity surface.
 *
 * A failed or unconfigured read renders the same insufficient-coverage state a
 * successful read of an empty dataset renders, with the reason distinguishing
 * them. There is no cached total to fall back to and no demo path to reach
 * for, which is the property that makes this surface safe to ship before it
 * has data: the worst case is an honest absence.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadCapacityReadModel } from "@/lib/capacity/read/load";
import {
  emptyCapacityReadModel,
  emptyCoverage,
  type CapacityReadModel,
} from "@/lib/capacity/read/read-model";

export async function capacitySurface(): Promise<CapacityReadModel> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) return emptyCapacityReadModel("not_configured", emptyCoverage());

  const sql = await createTokenSqlExecutor(databaseUrl);
  try {
    return await loadCapacityReadModel(sql);
  } catch (error) {
    console.error(
      `capacity surface: load failed (${error instanceof Error ? error.message : String(error)})`,
    );
    // A failed read is not an observation that capacity is zero.
    return emptyCapacityReadModel("not_configured", emptyCoverage());
  } finally {
    await sql.end();
  }
}
