import { cecChecker } from "@/lib/power-delivery/planning/freshness/discovery/cec";
import { ercotChecker } from "@/lib/power-delivery/planning/freshness/discovery/ercot";
import { isoneChecker } from "@/lib/power-delivery/planning/freshness/discovery/isone";
import { pjmChecker } from "@/lib/power-delivery/planning/freshness/discovery/pjm";
import type { PlanningSourceChecker } from "@/lib/power-delivery/planning/freshness/discovery/types";

/** Only sources whose monitor is active have a checker; a blocked source has nothing to check. */
export const PLANNING_SOURCE_CHECKERS: Record<string, PlanningSourceChecker> = {
  ercot: ercotChecker,
  pjm: pjmChecker,
  cec: cecChecker,
  isone: isoneChecker,
};

export const CHECKABLE_PLANNING_SOURCES = Object.keys(PLANNING_SOURCE_CHECKERS);

export function planningSourceChecker(key: string): PlanningSourceChecker | null {
  return PLANNING_SOURCE_CHECKERS[key] ?? null;
}
