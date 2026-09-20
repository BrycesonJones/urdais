import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import {
  publishablePointsForScenario,
  publishableScenariosForVintage,
} from "@/lib/power-delivery/planning/read";
import { planningMarketStatuses, type PlanningMarketStatus } from "@/lib/power-delivery/planning/market-status";
import type { PlanningForecastPoint, PlanningForecastScenario, PublicPlanningUsePurpose } from "@/lib/power-delivery/planning/types";

/**
 * Server-only entry point for planning demand. The `pipeline` tables are never exposed to a
 * browser client; a component receives the shapes this module returns and nothing else.
 *
 * Every value that leaves here has already been through the publication policy, and carries the
 * classification, attribution and unresolved-rights note that must be shown with it.
 */
export type PublicPlanningForecastData = {
  /**
   * Every monitored market with both gates resolved. A caller presents a market as the current
   * official forecast only where `publishableAsCurrent` is true; the rest carry the status that
   * says why not.
   */
  markets: PlanningMarketStatus[];
  scenarios: PlanningForecastScenario[];
  points: PlanningForecastPoint[];
};

export async function loadPublicPlanningForecasts(input?: {
  vintageId?: string;
  scenarioId?: string;
  purpose?: PublicPlanningUsePurpose;
}): Promise<PublicPlanningForecastData | null> {
  const url = resolveTokenDatabaseUrl(process.env, { allowLocalDefault: process.env.NODE_ENV === "development" });
  if (!url) return null;
  const sql = await tokenSqlExecutor(url);
  const purpose = input?.purpose ?? "public_raw_planning_value_display";
  const markets = await planningMarketStatuses(sql, { purpose });
  if (!input?.vintageId) return { markets, scenarios: [], points: [] };
  const scenarios = await publishableScenariosForVintage(sql, input.vintageId, purpose);
  const points = input.scenarioId
    ? await publishablePointsForScenario(sql, input.vintageId, input.scenarioId, purpose)
    : [];
  return { markets, scenarios, points };
}
