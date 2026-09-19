import { describeDatabaseError } from "@/lib/db/connection";
import type { ComputeEconomicsReadModel } from "@/lib/compute-economics/domain";
import { computeEconomicsReadModelFrom } from "@/lib/compute-economics/read-model";
import { loadListedChildren } from "@/lib/ucpi/read/load";
import type { ProcessEnvLike } from "@/lib/tokens/read/publication";

/** Server-only production loader. It has no mock or catalog fallback. */
export async function loadComputeEconomicsReadModel(
  env: ProcessEnvLike = process.env,
  now: Date = new Date(),
): Promise<ComputeEconomicsReadModel> {
  try {
    return computeEconomicsReadModelFrom(await loadListedChildren(env), now);
  } catch (error) {
    console.warn(`compute economics: database unavailable (${describeDatabaseError(error)}); no production price`);
    return { generatedAt: now.toISOString(), instruments: [], unavailableReason: "database_unavailable" };
  }
}
