/**
 * The currentness decision, in one pure function.
 *
 * Every branch here fails closed: the only path to `current` requires a monitor that is active,
 * a check that succeeded inside its interval, a discovered vintage that matches the one being
 * served, and a served vintage that passed validation. Anything else is named, not softened.
 *
 * The ordering matters and is deliberate. A blocked source is blocked whatever its dates say. A
 * source Urdais cannot currently read is not a source Urdais can make claims about, so a failed
 * or expired check outranks a favourable comparison made against older knowledge.
 */

import type {
  PlanningCurrentnessInput, PlanningCurrentnessResult,
} from "@/lib/power-delivery/planning/freshness/types";

function result(
  input: PlanningCurrentnessInput,
  status: PlanningCurrentnessResult["status"],
  detail: string,
): PlanningCurrentnessResult {
  const expires = input.latestSuccessfulCheck === null || input.monitor === null
    ? null
    : new Date(new Date(input.latestSuccessfulCheck.checkedAt).valueOf() + input.monitor.checkIntervalMs).toISOString();
  return {
    status,
    isCurrent: status === "current",
    servedVintageKey: input.servedVintage?.nativeVintageKey ?? null,
    latestKnownVintageKey: input.latestSuccessfulCheck?.discoveredVintageKey ?? null,
    lastCheckedAt: input.latestCheck?.checkedAt ?? null,
    lastSuccessfulCheckAt: input.latestSuccessfulCheck?.checkedAt ?? null,
    checkExpiresAt: expires,
    detail,
  };
}

export function resolvePlanningCurrentness(input: PlanningCurrentnessInput): PlanningCurrentnessResult {
  const { monitor, latestCheck, latestSuccessfulCheck, servedVintage, discoveredVintage } = input;

  if (monitor === null) {
    return result(input, "unknown", "no monitor is configured for this source, so nothing establishes what the publisher has released");
  }
  if (monitor.monitoringState === "blocked") {
    return result(input, "blocked", monitor.blockedReason ?? "the source is not watchable");
  }
  if (latestCheck === null) {
    return result(input, "unknown", "this source has never been checked");
  }
  // A check that could not read the source cannot support a claim about the source.
  if (latestCheck.outcome === "failed") {
    return result(input, "source_check_failed", latestCheck.error ?? "the most recent source check failed");
  }
  if (latestSuccessfulCheck === null) {
    return result(input, "unknown", "no source check has ever succeeded");
  }

  const age = input.now.valueOf() - new Date(latestSuccessfulCheck.checkedAt).valueOf();
  if (age > monitor.checkIntervalMs) {
    const days = Math.floor(age / 86_400_000);
    return result(
      input,
      "source_check_overdue",
      `the last successful check was ${days} day(s) ago, past this source's ${Math.round(monitor.checkIntervalMs / 86_400_000)}-day interval; what the publisher has released since is unknown`,
    );
  }

  const latestKnown = latestSuccessfulCheck.discoveredVintageKey;
  if (latestKnown === null) {
    return result(input, "unknown", "the last successful check recorded no vintage identifier");
  }

  if (servedVintage === null) {
    return result(input, "new_vintage_available", `the publisher offers ${latestKnown} and Urdais holds no vintage for this market`);
  }

  // The publisher has moved on from what Urdais serves.
  if (servedVintage.nativeVintageKey !== latestKnown) {
    if (discoveredVintage === null) {
      return result(input, "new_vintage_available", `the publisher offers ${latestKnown}; Urdais serves ${servedVintage.nativeVintageKey} and has not ingested the newer release`);
    }
    if (discoveredVintage.qualityStatus === "suspect") {
      return result(input, "validation_failed", `${latestKnown} was ingested and failed validation; Urdais still serves ${servedVintage.nativeVintageKey}, which is not current`);
    }
    return result(input, "ingestion_pending", `${latestKnown} was ingested and is awaiting validation; Urdais still serves ${servedVintage.nativeVintageKey}, which is not current`);
  }

  // Serving the latest release. It still has to have passed validation to be called current.
  if (servedVintage.qualityStatus === "suspect") {
    return result(input, "validation_failed", `${latestKnown} is the latest release but failed validation`);
  }
  if (servedVintage.qualityStatus === "provisional") {
    return result(input, "ingestion_pending", `${latestKnown} is the latest release and is awaiting validation`);
  }
  return result(input, "current", `${latestKnown} is the latest release the publisher offers, ingested and validated`);
}
