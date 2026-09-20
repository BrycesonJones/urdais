/**
 * The planning read surface a frontend will eventually consume: for each market, what Urdais
 * serves, what it may show, and whether what it serves is still the publisher's latest word.
 *
 * The two gates are kept separate because they fail for different reasons and a reader needs to
 * know which. Rights decide whether a value may be shown at all; currentness decides whether it
 * may be called the current official forecast. A rights-cleared vintage whose publisher has
 * since released a replacement is publishable history, not current data, and
 * `publishableAsCurrent` is the only field that asserts both.
 *
 * `publishableLatestVintageByMarket` in the read module remains a rights decision alone. It is
 * deliberately not a currentness claim, which is why this module exists rather than that one
 * growing a boolean nobody would have to look at.
 */

import { loadPlanningFreshness } from "@/lib/power-delivery/planning/freshness/store";
import type { PlanningFreshness } from "@/lib/power-delivery/planning/freshness/types";
import { mayPublishPlanningForecast, type PlanningPublicationDecision } from "@/lib/power-delivery/planning/rights";
import { latestVintageByMarketInternal, type PlanningSqlExecutor } from "@/lib/power-delivery/planning/read";
import type { PlanningForecastVintage, PublicPlanningUsePurpose } from "@/lib/power-delivery/planning/types";

export type PlanningMarketStatus = {
  marketSlug: string;
  marketName: string;
  eiaBaCode: string | null;
  sourceInterfaceSlug: string;
  sourceName: string | null;
  /** The live vintage a read would serve. Null where Urdais holds nothing for this market. */
  vintage: PlanningForecastVintage | null;
  /** Why it may or may not be shown. Null where there is no vintage to decide about. */
  publication: PlanningPublicationDecision | null;
  freshness: PlanningFreshness;
  /**
   * The only field that asserts both gates: rights permit publication and the served vintage is
   * the latest release, ingested and validated, established by a check that has not expired.
   */
  publishableAsCurrent: boolean;
};

export async function planningMarketStatuses(
  sql: PlanningSqlExecutor,
  options?: { purpose?: PublicPlanningUsePurpose; now?: Date },
): Promise<PlanningMarketStatus[]> {
  const purpose = options?.purpose ?? "public_raw_planning_value_display";
  const [freshness, vintages] = await Promise.all([
    loadPlanningFreshness(sql, options?.now ?? new Date()),
    latestVintageByMarketInternal(sql, purpose),
  ]);
  const byMarket = new Map(vintages.map((vintage) => [vintage.marketSlug, vintage]));

  return freshness.map((entry) => {
    const vintage = byMarket.get(entry.marketSlug) ?? null;
    const publication = vintage === null ? null : mayPublishPlanningForecast({
      rights: vintage.rights, publicationState: vintage.publicationState, purpose,
    });
    return {
      marketSlug: entry.marketSlug,
      marketName: vintage?.marketName ?? entry.marketSlug,
      eiaBaCode: vintage?.eiaBaCode ?? null,
      sourceInterfaceSlug: entry.sourceInterfaceSlug,
      sourceName: vintage?.sourceName ?? null,
      vintage,
      publication,
      freshness: entry,
      publishableAsCurrent: publication?.allowed === true && entry.isCurrent,
    };
  });
}

/**
 * Markets a public surface may present as the current official forecast. Anything the rights
 * policy blocks, and anything whose publisher has moved on, is absent rather than downgraded --
 * a caller cannot accidentally render a superseded vintage from this list.
 */
export async function publishableCurrentPlanningMarkets(
  sql: PlanningSqlExecutor,
  options?: { purpose?: PublicPlanningUsePurpose; now?: Date },
): Promise<PlanningMarketStatus[]> {
  return (await planningMarketStatuses(sql, options)).filter((status) => status.publishableAsCurrent);
}
