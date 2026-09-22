/**
 * Margin derivation. The one piece of arithmetic in Transmission Headroom, and the one place the
 * product can go quietly wrong.
 *
 * Three rules do the work, and each of them exists because the obvious alternative produces a
 * plausible-looking wrong number rather than an error:
 *
 *   Direction is chosen before any absolute value. NYISO publishes a signed flow and a pair of
 *   limits, one per direction. Taking `abs(flow)` first and comparing it to the positive limit
 *   would measure a westbound flow against an eastbound limit and report a comfortable margin on a
 *   constrained interface.
 *
 *   A sentinel is not a quantity. `abs(limit) === 9999` means NYISO does not monitor that
 *   direction. `flow - (-9999)` would report 11,272 MW of reverse capability on CENTRAL EAST.
 *   The test is exact equality because the largest genuine limit in the archive is 9899.
 *
 *   Zero flow determines no direction. With `flow === 0` neither limit is the applicable one, and
 *   picking the positive limit because it is listed first would invent a direction the grid was
 *   not running in.
 *
 * Everything that cannot produce a number produces a state and a reason instead. Nothing here ever
 * returns zero to mean "unknown".
 */

import {
  IMPLAUSIBLE_LIMIT_MW, NYISO_SENTINEL_MW,
  type LimitState, type MarginState, type SelectedDirection,
} from "@/lib/transmission-headroom/types";

/** Classify a published limit before anything is allowed to measure against it. */
export function classifyLimit(
  limitMw: number, options: { sentinel?: boolean; implausibleAboveMw?: number } = {},
): LimitState {
  const { sentinel = false, implausibleAboveMw = IMPLAUSIBLE_LIMIT_MW } = options;
  if (sentinel && Math.abs(limitMw) === NYISO_SENTINEL_MW) return "sentinel";
  if (Math.abs(limitMw) > implausibleAboveMw) return "implausible";
  if (limitMw === 0) return "zero";
  return "real";
}

export function isEligibleLimit(state: LimitState): boolean {
  return state === "real" || state === "zero";
}

export type DirectionalLimit = {
  limitMw: number;
  state: LimitState;
  nativeField: string;
};

export type MarginOutcome = {
  state: MarginState;
  selectedDirection: SelectedDirection;
  /** The limit actually measured against, where one was selected. */
  selectedLimit: DirectionalLimit | null;
  headroomMw: number | null;
  utilizationPct: number | null;
};

/**
 * NYISO: a signed flow against a directional limit pair.
 *
 * The order of the branches is the algorithm. Direction comes from the sign of the flow, the limit
 * is chosen from that direction, and only then does the negative branch take magnitudes — by which
 * point both operands are known to describe the same direction.
 */
export function deriveDirectionalMargin(
  flowMw: number, positive: DirectionalLimit, negative: DirectionalLimit,
): MarginOutcome {
  if (flowMw === 0) {
    // No direction, therefore no applicable limit. Choosing one would be inventing the direction.
    return {
      state: "zero_flow_direction_undetermined", selectedDirection: "undetermined",
      selectedLimit: null, headroomMw: null, utilizationPct: null,
    };
  }

  const selectedDirection: SelectedDirection = flowMw > 0 ? "positive" : "negative";
  const selected = flowMw > 0 ? positive : negative;

  if (selected.state === "sentinel") {
    return {
      state: "unmonitored_direction", selectedDirection,
      selectedLimit: selected, headroomMw: null, utilizationPct: null,
    };
  }
  if (selected.state === "implausible") {
    return {
      state: "implausible_limit", selectedDirection,
      selectedLimit: selected, headroomMw: null, utilizationPct: null,
    };
  }

  // Both operands now describe the same direction, so magnitudes are comparable.
  const limitMagnitude = Math.abs(selected.limitMw);
  const flowMagnitude = Math.abs(flowMw);
  const headroomMw = round4(limitMagnitude - flowMagnitude);

  return {
    state: "ok", selectedDirection, selectedLimit: selected, headroomMw,
    // A zero limit has no denominator. Reporting "100% utilized" against it would be arithmetic
    // dressed up as a measurement.
    utilizationPct: limitMagnitude === 0 ? null : round6(flowMagnitude / limitMagnitude),
  };
}

/**
 * ERCOT: an oriented flow against a single limit.
 *
 * No direction is selected, because ERCOT publishes the monitored element's flow already oriented
 * into the direction the constraint protects and never publishes the element's physical
 * orientation. Inventing a northbound/southbound label here would be asserting something the
 * source does not say.
 */
export function deriveOrientedMargin(
  flowMw: number, limit: DirectionalLimit,
): MarginOutcome {
  if (limit.state === "implausible") {
    return {
      state: "implausible_limit", selectedDirection: "undirected",
      selectedLimit: limit, headroomMw: null, utilizationPct: null,
    };
  }
  if (limit.state === "sentinel") {
    return {
      state: "unmonitored_direction", selectedDirection: "undirected",
      selectedLimit: limit, headroomMw: null, utilizationPct: null,
    };
  }

  // Signed and unfloored: a flow over its limit is negative headroom, which is the observation
  // the product exists to surface.
  const headroomMw = round4(limit.limitMw - flowMw);
  return {
    state: "ok", selectedDirection: "undirected", selectedLimit: limit, headroomMw,
    utilizationPct: limit.limitMw === 0 ? null : round6(flowMw / limit.limitMw),
  };
}

/**
 * Parse a numeric field, distinguishing "absent" from "unparseable".
 *
 * Returned as a discriminated result rather than NaN or null, because the caller has to record a
 * different deferral reason for each and a silent zero would be the worst of the three.
 */
export type NumericParse =
  | { ok: true; value: number }
  | { ok: false; reason: "missing_required_field" | "malformed_numeric"; raw: string };

export function parseNumeric(raw: string | undefined | null): NumericParse {
  const text = (raw ?? "").trim();
  if (text === "") return { ok: false, reason: "missing_required_field", raw: text };
  const value = Number(text);
  if (!Number.isFinite(value)) return { ok: false, reason: "malformed_numeric", raw: text };
  return { ok: true, value };
}

/** NUMERIC(14,4) in the database; rounding here keeps a float artefact from becoming a write error. */
function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}
