/**
 * Server-only loading of the Open-weight vs Proprietary section.
 *
 * Fails soft and says nothing rather than something wrong, as UTVI, Market Share and Model
 * Frontier do. An unconfigured deployment, an unreachable database, a methodology still in
 * draft, or a window with no observations all produce `null`, and the section then states that
 * no comparison is published.
 *
 * The volume panel and the comparison panels fail independently on purpose. Volume needs only
 * UTVI and the classifications; capability and price additionally need Epoch and Token Price.
 * A benchmark with no classified model on one side is a real and reportable state -- it means
 * the comparison cannot be made, not that the section is broken -- so the view carries the
 * benchmarks it could build and the chart says so for the ones it could not.
 *
 * The same applies to a benchmark whose frontier is too thin to support a ratio. Too few
 * efficient configurations in a class is a fact about coverage, reported as such; it is never
 * a reason to widen the population until a number appears.
 */

import { createTokenSqlExecutor } from "@/lib/tokens/read/database";
import { deriveAll } from "@/lib/frontier/read/derive";
import { loadJoinableRows } from "@/lib/frontier/read/load";
import { deriveComparisons, deriveVolumeShare } from "@/lib/open-weight/derive";
import { loadAccessClasses, loadVolumeRows, methodologyApproved } from "@/lib/open-weight/load";
import {
  OPEN_WEIGHT_BOUNDARY,
  OPEN_WEIGHT_CLAIM,
  VOLUME_WINDOW_DAYS,
  type BenchmarkComparison,
  type VolumeShare,
} from "@/lib/open-weight/types";

export type OpenWeightView = {
  claim: string;
  boundary: string;
  methodologyVersion: string;
  volume: VolumeShare;
  benchmarks: BenchmarkComparison[];
};

export async function loadOpenWeightView(): Promise<OpenWeightView | null> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    console.info("open-weight: no DATABASE_URL is configured; the section reports no published comparison");
    return null;
  }

  let sql: Awaited<ReturnType<typeof createTokenSqlExecutor>> | null = null;
  try {
    sql = await createTokenSqlExecutor(databaseUrl);

    const methodology = await methodologyApproved(sql);
    if (methodology === null || !methodology.approved) {
      console.info(
        `open-weight: methodology ${methodology?.version ?? "(none)"} is not approved; nothing is published under it`,
      );
      return null;
    }

    const volumeRows = await loadVolumeRows(sql, VOLUME_WINDOW_DAYS);
    if (volumeRows.length === 0) {
      console.info("open-weight: the trailing window contains no observations");
      return null;
    }

    return {
      claim: OPEN_WEIGHT_CLAIM,
      boundary: OPEN_WEIGHT_BOUNDARY,
      methodologyVersion: methodology.version,
      volume: deriveVolumeShare(volumeRows, VOLUME_WINDOW_DAYS),
      // Model Frontier's own rows, through Model Frontier's own derivation, so the efficient
      // set reported here is the set the chart above it draws.
      benchmarks: deriveComparisons(deriveAll(await loadJoinableRows(sql)), await loadAccessClasses(sql)),
    };
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`open-weight: load failed (${detail})`);
    return null;
  } finally {
    await sql?.end();
  }
}
