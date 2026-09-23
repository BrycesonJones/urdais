/**
 * Server-only loading of the UMPI surface for `/markets/UMPI`.
 *
 * Fails closed to no data rather than open to something wrong. An unconfigured deployment, an
 * unreachable database, or a response that fails its own contract all produce a model carrying
 * no points and a stated reason — never a demo value, and never a stale one. The demo memory
 * market that this surface replaces is not reachable from here: there is no fallback path in
 * this file and nothing to fall back to.
 *
 * The contract check is the one the public API applies, run again here because the page is a
 * second consumer of the same data. A payload good enough to serve as JSON is not automatically
 * good enough to render under a headline, and `validatePublicUmpi` is what refuses a model that
 * leaked an internal identifier or a demo instrument name.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { loadUmpiReadModel } from "@/lib/umpi/read/load";
import {
  unconfiguredUmpiReadModel,
  validatePublicUmpi,
  type UmpiReadModel,
} from "@/lib/umpi/read/read-model";

/** Every failure renders as "no data", with the reason the surface is allowed to state. */
function unavailable(reason: string): UmpiReadModel {
  return { ...unconfiguredUmpiReadModel(), unavailableReason: reason };
}

export async function loadUmpiSurface(): Promise<UmpiReadModel> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    console.info("umpi surface: no DATABASE_URL is configured; the section reports no published value");
    return unconfiguredUmpiReadModel();
  }

  let sql: Awaited<ReturnType<typeof createTokenSqlExecutor>> | null = null;
  try {
    sql = await createTokenSqlExecutor(databaseUrl);
    const model = await loadUmpiReadModel(sql);
    const reasons = validatePublicUmpi(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`umpi surface: read model failed its own contract (${reasons.join("; ")})`);
      return unavailable("the published data did not pass its own contract check");
    }
    return model;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`umpi surface: load failed (${detail})`);
    return unavailable("the index could not be read");
  } finally {
    await sql?.end();
  }
}
