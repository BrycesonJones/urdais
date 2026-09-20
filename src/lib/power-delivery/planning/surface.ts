import { resolveTokenDatabaseUrl, tokenSqlExecutor } from "@/lib/tokens/read/database";
import {
  publishableLatestVintageByMarket,
  publishablePointsForScenario,
  publishableScenariosForVintage,
  type PublishablePlanningVintage,
} from "@/lib/power-delivery/planning/read";
import type { PlanningForecastPoint, PlanningForecastScenario, PublicPlanningUsePurpose } from "@/lib/power-delivery/planning/types";

/**
 * Server-only entry point for planning demand. The `pipeline` tables are never exposed to a
 * browser client; a component receives the shapes this module returns and nothing else.
 *
 * Every value that leaves here has already been through the publication policy, and carries the
 * classification, attribution and unresolved-rights note that must be shown with it.
 */
export type PublicPlanningForecastData = {
  latestByMarket: PublishablePlanningVintage[];
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
  const latestByMarket = await publishableLatestVintageByMarket(sql, purpose);
  if (!input?.vintageId) return { latestByMarket, scenarios: [], points: [] };
  const scenarios = await publishableScenariosForVintage(sql, input.vintageId, purpose);
  const points = input.scenarioId
    ? await publishablePointsForScenario(sql, input.vintageId, input.scenarioId, purpose)
    : [];
  return { latestByMarket, scenarios, points };
}
