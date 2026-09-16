/**
 * Choosing which published price represents a model, by name and never by magnitude.
 *
 * A model does not have "a price". Production holds up to six input rows for one SKU across
 * two context tiers and three service tiers — `gpt-6-astra` spans $5 to $40 — so something
 * has to choose, and what it chooses by is the whole question. A rule that took the minimum
 * would systematically select `batch`, which is a different product with different latency
 * guarantees, and would flatter every model whose provider offers one. A rule that took the
 * maximum would do the mirror. So selection is by **named product characteristic** and the
 * price is not read until after the row is chosen — which is the structural guarantee that
 * frontier position cannot be improved by selection.
 *
 * The rule, from the Phase 3A source decision:
 *
 *   service tier   `standard`. A provider publishing none — DeepSeek, whose catalogue is
 *                  peak/off-peak — yields no eligible price and is excluded, exactly as
 *                  Token Price already refuses it.
 *   context tier   the provider's declared base tier, or none where the provider publishes
 *                  one price for the model.
 *   region         the provider's declared base region.
 *
 * And the part that makes it deterministic rather than merely principled: the selection must
 * resolve to **exactly one** input row and one output row. Zero excludes the model; more than
 * one excludes it as ambiguous. There is deliberately no tie-break, because every tie-break
 * that could be written here is a price comparison wearing a different name.
 */

import { FrontierContractError, type PriceSelection } from "@/lib/frontier/types";

/** Token Price 1.2: a 500k input + 500k output workload, weighted 0.5 / 0.5. */
export const BLEND_INPUT_WEIGHT = 0.5;
export const BLEND_OUTPUT_WEIGHT = 0.5;
export const BLEND_UNIT = "USD per 1M tokens";

/** The service tier Model Frontier compares. Named, not cheapest. */
export const SELECTED_SERVICE_TIER = "standard";

/**
 * Each provider's declared base context tier.
 *
 * Absent from this table means the provider does not tier its context window in the
 * catalogue, and the model's single standard row is the base by construction.
 */
export const PROVIDER_BASE_CONTEXT_TIER: Readonly<Record<string, string>> = Object.freeze({
  openai: "short_context",
  google: "prompt_lte_200k",
  xai: "prompt_lt_200k",
});

/**
 * Each provider's declared base region.
 *
 * Anthropic is deliberately absent, which means `null`: its published pricing table is the
 * global list, its documentation states the first-party API is "global by default", and the
 * `us` rows are the `inference_geo` data-residency option at a 1.1x multiplier — an opt-in
 * variant rather than the base product. `claude-haiku-4-5-20251001` has no `us` row at all,
 * so a `us` rule would unprice a model for lacking a surcharge. It is the cheaper row and it
 * is not chosen for that reason: the same evidence would select it if the multiplier were
 * below 1.0.
 */
export const PROVIDER_BASE_REGION: Readonly<Record<string, string>> = Object.freeze({
  alibaba: "international",
  moonshot: "international",
});

/** One published price row, as the selection rule receives it. */
export type PriceRow = {
  dimension: string;
  serviceTier: string | null;
  contextTier: string | null;
  region: string | null;
  usdPer1m: number;
  observedAt: string;
};

export type PriceOutcome =
  | { kind: "selected"; selection: PriceSelection; input: PriceRow; output: PriceRow; blended: number; priceAsOf: string }
  | { kind: "excluded"; reason: string };

/** The blended price under Token Price 1.2. Adopted by reference, never restated. */
export function blendedPrice(input: number, output: number): number {
  return BLEND_INPUT_WEIGHT * input + BLEND_OUTPUT_WEIGHT * output;
}

/**
 * Select the comparable price pair for one model, or explain why there is none.
 *
 * `rows` is every published observation for the model. The function reads no price until the
 * row is already chosen.
 */
export function selectPrice(
  providerSlug: string,
  providerModelId: string,
  rows: readonly PriceRow[],
): PriceOutcome {
  const standard = rows.filter((row) => row.serviceTier === SELECTED_SERVICE_TIER);
  if (standard.length === 0) {
    return {
      kind: "excluded",
      reason: `${providerSlug}/${providerModelId} publishes no '${SELECTED_SERVICE_TIER}' service tier; there is no comparable list price and the model is excluded rather than priced from another tier.`,
    };
  }

  const baseContext = PROVIDER_BASE_CONTEXT_TIER[providerSlug] ?? null;
  const baseRegion = PROVIDER_BASE_REGION[providerSlug] ?? null;

  // The provider's base tier where the model is tiered at all; otherwise the untiered row.
  const tiered = standard.filter((row) => row.contextTier !== null);
  const contextTier = tiered.length > 0 && baseContext !== null ? baseContext : null;

  const matching = standard.filter(
    (row) => row.contextTier === contextTier && row.region === baseRegion,
  );

  const pick = (dimension: string): PriceRow[] => matching.filter((row) => row.dimension === dimension);
  const inputs = pick("input");
  const outputs = pick("output");

  const describe = `${providerSlug}/${providerModelId} at service tier '${SELECTED_SERVICE_TIER}', context tier ${contextTier ?? "none"}, region ${baseRegion ?? "none"}`;

  if (inputs.length === 0 || outputs.length === 0) {
    return {
      kind: "excluded",
      reason: `${describe} resolves to ${inputs.length} input and ${outputs.length} output rows; both legs are required and the model is excluded.`,
    };
  }
  if (inputs.length > 1 || outputs.length > 1) {
    return {
      kind: "excluded",
      reason: `${describe} is ambiguous: ${inputs.length} input and ${outputs.length} output rows match. The model is excluded rather than tie-broken, because every available tie-break is a price comparison.`,
    };
  }

  const input = inputs[0]!;
  const output = outputs[0]!;
  if (!(input.usdPer1m > 0) || !(output.usdPer1m > 0)) {
    return { kind: "excluded", reason: `${describe} has a non-positive price leg.` };
  }

  return {
    kind: "selected",
    selection: {
      providerSlug,
      providerModelId,
      serviceTier: SELECTED_SERVICE_TIER,
      contextTier,
      region: baseRegion,
      rationale:
        `Provider's declared standard product: service tier '${SELECTED_SERVICE_TIER}'` +
        (contextTier === null ? ", no context tiering" : `, base context tier '${contextTier}'`) +
        (baseRegion === null ? ", global list price" : `, base region '${baseRegion}'`) +
        ". Selected by named product characteristics; price was not read until the row was chosen.",
    },
    input,
    output,
    blended: blendedPrice(input.usdPer1m, output.usdPer1m),
    // Both legs come from the same catalogue read; the later of the two is the honest stamp.
    priceAsOf: input.observedAt >= output.observedAt ? input.observedAt : output.observedAt,
  };
}

/** Assert a selection still resolves, for the readiness check. Throws with the reason. */
export function assertSelectable(providerSlug: string, providerModelId: string, rows: readonly PriceRow[]): void {
  const outcome = selectPrice(providerSlug, providerModelId, rows);
  if (outcome.kind === "excluded") throw new FrontierContractError(outcome.reason);
}
