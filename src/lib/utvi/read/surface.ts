/**
 * Server-only loading of the UTVI surface for the Model Economics page.
 *
 * Fails soft and says nothing rather than something wrong. An unconfigured deployment, an
 * unreachable database or a response that fails its own contract all produce `null`, and the
 * section then states that no value is published. The alternative — rendering a stale or
 * partial value — is the failure mode this product exists to avoid.
 *
 * The contract check is the same one the public API applies, run here too because the page is
 * a second consumer of the same data and a value good enough to serve is not automatically
 * good enough to render under a headline.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { utviInstrumentFrom, type UtviInstrumentView } from "@/lib/utvi/read/instrument";
import { loadUtviReadModel } from "@/lib/utvi/read/load";
import { validatePublicUtvi } from "@/lib/utvi/read/read-model";

export async function loadUtviInstrumentView(): Promise<UtviInstrumentView | null> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    console.info("utvi surface: no DATABASE_URL is configured; the section reports no published value");
    return null;
  }

  let sql: Awaited<ReturnType<typeof createTokenSqlExecutor>> | null = null;
  try {
    sql = await createTokenSqlExecutor(databaseUrl);
    const model = await loadUtviReadModel(sql);
    const reasons = validatePublicUtvi(JSON.parse(JSON.stringify(model)) as unknown);
    if (reasons.length > 0) {
      console.error(`utvi surface: read model failed its own contract (${reasons.join("; ")})`);
      return null;
    }
    return utviInstrumentFrom(model);
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`utvi surface: load failed (${detail})`);
    return null;
  } finally {
    await sql?.end();
  }
}
