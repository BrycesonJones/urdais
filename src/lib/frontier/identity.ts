/**
 * Deciding whether a source model identifier is a priced Urdais model, and refusing to guess.
 *
 * The temptation, again, is normalisation: lowercase it, strip the suffix, drop `-preview`,
 * call `gpt-5.6-luna_high` the same thing as `gpt-5.6-luna`. Production already holds the
 * traps that punishes — `gemini-3.1-pro-preview` is priced separately from any GA sibling,
 * and `grok-4.20-0309-reasoning` and `-non-reasoning` are two priced rows whose scores must
 * differ. So the rule here is **exact decomposition against the priced catalogue**, not
 * matching:
 *
 *   the identifier equals a priced SKU exactly            → evidenced, no configuration
 *   the identifier equals `<priced SKU>_<token>` exactly  → evidenced, configuration `<token>`
 *   it decomposes against more than one priced SKU        → ambiguous
 *   anything else                                         → unmapped
 *
 * Two properties make that a decomposition rather than a guess. The SKU half must match a
 * known catalogue entry **character for character** — nothing is trimmed, folded or inferred.
 * And the source's own `Organization` must agree with the provider Urdais prices the SKU
 * under, which is an independent field the identifier cannot fake: a coincidental prefix
 * collision between two labs is caught by it.
 *
 * Everything that is not `evidenced` keeps its observation and refuses the join. A wrong link
 * silently moves a point on a public chart; a missing one is visible in the exclusion counts.
 */

import type { IdentityLink, LinkState } from "@/lib/frontier/types";

/**
 * The provider each Epoch `Organization` value corresponds to.
 *
 * An explicit table, not a slug transformation, because the two disagree in exactly the ways
 * a transformation would paper over: Epoch writes `Google DeepMind` for models Urdais prices
 * under `google`, and `Moonshot` for `moonshot`. Measured against the V1 files — every
 * matched row carries exactly one of these.
 */
export const ORGANIZATION_TO_PROVIDER: Readonly<Record<string, string>> = Object.freeze({
  Alibaba: "alibaba",
  Anthropic: "anthropic",
  "Google DeepMind": "google",
  Google: "google",
  Moonshot: "moonshot",
  "Moonshot AI": "moonshot",
  OpenAI: "openai",
  xAI: "xai",
});

/** One priced SKU, as the catalogue presents it to the identity rule. */
export type PricedModel = { providerSlug: string; providerModelId: string };

/**
 * Every way the identifier decomposes against the catalogue.
 *
 * Returned rather than resolved so the caller can tell "no match" from "more than one match",
 * which are different facts with different remedies: one is research Urdais has not done, the
 * other is a catalogue that cannot distinguish two products.
 */
function decompositions(
  identifier: string,
  catalogue: readonly PricedModel[],
): { model: PricedModel; configuration: string | null }[] {
  const found: { model: PricedModel; configuration: string | null }[] = [];
  for (const model of catalogue) {
    if (identifier === model.providerModelId) {
      found.push({ model, configuration: null });
      continue;
    }
    const prefix = `${model.providerModelId}_`;
    if (identifier.startsWith(prefix)) {
      const configuration = identifier.slice(prefix.length);
      // A trailing underscore declares nothing; it is not a configuration name.
      if (configuration !== "") found.push({ model, configuration });
    }
  }
  return found;
}

/**
 * Resolve one source identifier, or decline to.
 *
 * `organization` is the source's own field for the row. It is required for an evidenced link:
 * without it the only thing supporting the claim is a string prefix, and a prefix is not
 * evidence.
 */
export function resolveIdentity(
  identifier: string,
  organization: string | null,
  catalogue: readonly PricedModel[],
): IdentityLink {
  const decline = (state: LinkState, evidence: string): IdentityLink => ({
    sourceModelIdentifier: identifier,
    providerModelId: null,
    providerSlug: null,
    sourceConfiguration: null,
    state,
    evidence,
  });

  const matches = decompositions(identifier, catalogue);
  if (matches.length === 0) {
    return decline(
      "unmapped",
      `'${identifier}' does not equal any priced Urdais SKU, nor any priced SKU followed by '_' and a configuration token. No link is asserted; the observation is retained and is not plotted.`,
    );
  }
  if (matches.length > 1) {
    const names = matches.map((match) => match.model.providerModelId).sort().join(", ");
    return decline(
      "ambiguous",
      `'${identifier}' decomposes against more than one priced Urdais SKU (${names}). The catalogue cannot distinguish which product was evaluated, so no link is asserted.`,
    );
  }

  const { model, configuration } = matches[0]!;
  const expected = organization === null ? undefined : ORGANIZATION_TO_PROVIDER[organization];
  if (organization === null) {
    return decline(
      "unmapped",
      `'${identifier}' decomposes to the priced SKU '${model.providerModelId}', but the source declared no organization for the row. A string prefix alone is not evidence, so no link is asserted.`,
    );
  }
  if (expected === undefined) {
    return decline(
      "unmapped",
      `'${identifier}' decomposes to '${model.providerModelId}', but the source organization '${organization}' is not mapped to an Urdais provider. No link is asserted.`,
    );
  }
  if (expected !== model.providerSlug) {
    return decline(
      "ambiguous",
      `'${identifier}' decomposes to '${model.providerModelId}', which Urdais prices under '${model.providerSlug}', but the source attributes the result to '${organization}' (${expected}). The two disagree, so no link is asserted.`,
    );
  }

  return {
    sourceModelIdentifier: identifier,
    providerModelId: model.providerModelId,
    providerSlug: model.providerSlug,
    sourceConfiguration: configuration,
    state: "evidenced",
    evidence:
      `Source identifier '${identifier}' equals the priced Urdais SKU '${model.providerModelId}'` +
      (configuration === null
        ? " exactly, with no configuration suffix"
        : ` followed by '_${configuration}', the configuration the source declared`) +
      `, and the source attributes the result to '${organization}', which is the provider Urdais prices that SKU under ('${model.providerSlug}'). Matched character for character; nothing normalised.`,
  };
}
