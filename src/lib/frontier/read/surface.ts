/**
 * Server-only loading of the Model Frontier section.
 *
 * Fails soft and says nothing rather than something wrong, as the UTVI and Market Share
 * surfaces do. An unconfigured deployment, an unreachable database, a methodology still in
 * draft, or an attribution that cannot be rendered all produce `null`, and the section then
 * states that no frontier is published.
 *
 * The attribution check is not ceremony. CC BY's single condition is credit, so a view whose
 * citation is missing does not serve — the same rule UTVI applies to OpenRouter's citation,
 * for the same reason.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { deriveAll, type BenchmarkView } from "@/lib/frontier/read/derive";
import { loadAttribution, loadJoinableRows, methodologyApproved, type FrontierAttribution } from "@/lib/frontier/read/load";
import { MODEL_FRONTIER_CLAIM, MODEL_FRONTIER_COST_BOUNDARY } from "@/lib/frontier/types";

export type ModelFrontierView = {
  claim: string;
  costBoundary: string;
  methodologyVersion: string;
  benchmarks: BenchmarkView[];
  attribution: FrontierAttribution;
};

export async function loadModelFrontierView(): Promise<ModelFrontierView | null> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    console.info("model frontier: no DATABASE_URL is configured; the section reports no published frontier");
    return null;
  }

  let sql: Awaited<ReturnType<typeof createTokenSqlExecutor>> | null = null;
  try {
    sql = await createTokenSqlExecutor(databaseUrl);

    const methodology = await methodologyApproved(sql);
    if (methodology === null || !methodology.approved) {
      console.info(
        `model frontier: methodology ${methodology?.version ?? "(none)"} is not approved; nothing is published under it`,
      );
      return null;
    }

    const attribution = await loadAttribution(sql);
    if (attribution === null) {
      console.info("model frontier: no successful source retrieval, so no citation can be rendered");
      return null;
    }

    const benchmarks = deriveAll(await loadJoinableRows(sql));
    // A selector with nothing behind it is worse than an absent section: it implies the data
    // exists and the reader has failed to find it.
    if (benchmarks.every((benchmark) => benchmark.points.length === 0)) {
      console.info("model frontier: no benchmark has a plottable point");
      return null;
    }

    return {
      claim: MODEL_FRONTIER_CLAIM,
      costBoundary: MODEL_FRONTIER_COST_BOUNDARY,
      methodologyVersion: methodology.version,
      benchmarks,
      attribution,
    };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`model frontier: load failed (${detail})`);
    return null;
  } finally {
    await sql?.end();
  }
}
