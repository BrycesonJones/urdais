/**
 * Mapping a source namespace to a lab, and refusing to when the evidence is not there.
 *
 * The temptation is `permaslug.split("/")[0]`. Phase 1A measured four reasons that is
 * wrong, and each one is a real row carrying real volume:
 *
 *   `meta` and `meta-llama`   two namespaces, one lab
 *   `qwen`                    a model family; the lab is Alibaba
 *   `openrouter/owl-alpha`    the serving platform appearing as a model author
 *   `stealth/ox-alpha`        an undisclosed author carrying ~3 % of attributed volume
 *
 * So the mapping is an explicit table, every entry of which is a claim Urdais is making
 * on evidence, and anything absent from it is `unmapped` — which keeps the volume and
 * refuses the attribution. That asymmetry is deliberate: a wrong lab is worse than no lab,
 * because a wrong lab silently moves a market-share number that someone will quote.
 */

import { RESIDUAL_PERMASLUG, type LabAttributionState, type ParsedPermaslug } from "@/lib/utvi/types";

/**
 * Namespaces Urdais has established a lab for, mapped to the provider slug that lab holds
 * in `reference.providers`. Where the namespace differs from the slug, the entry exists
 * precisely because the two are not the same string.
 */
export const NAMESPACE_TO_LAB_SLUG: Readonly<Record<string, string>> = Object.freeze({
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  deepseek: "deepseek",
  nvidia: "nvidia",
  minimax: "minimax",
  tencent: "tencent",
  xiaomi: "xiaomi",
  cohere: "cohere",
  perplexity: "perplexity",
  stepfun: "stepfun",
  upstage: "upstage",
  poolside: "poolside",
  baai: "baai",
  // The namespace and the slug differ. Each of these is why this table exists.
  "x-ai": "xai",
  qwen: "alibaba",
  moonshotai: "moonshot",
  mistralai: "mistral",
  "z-ai": "zhipu-ai",
  "bytedance-seed": "bytedance",
  thinkingmachines: "thinking-machines",
  // One lab, two namespaces.
  meta: "meta",
  "meta-llama": "meta",
});

/**
 * Namespaces whose author is deliberately undisclosed by the source. Distinct from
 * `unmapped`: no amount of Urdais research will resolve `stealth`, because not saying is
 * the point of it.
 */
export const UNDISCLOSED_NAMESPACES: ReadonlySet<string> = new Set(["stealth"]);

/**
 * Namespaces that are the serving platform rather than a lab. Volume here is real and is
 * counted in the total; it is never credited to a lab, least of all to the platform, which
 * would put the observer into its own observation.
 */
export const PLATFORM_NAMESPACES: ReadonlySet<string> = new Set(["openrouter"]);

export type LabResolution = {
  labSlug: string | null;
  state: LabAttributionState;
  qualityFlags: string[];
};

/**
 * Resolve a parsed permaslug to a lab, or decline to.
 *
 * Four outcomes, and the three that yield no lab are not interchangeable — a reader of a
 * share table is owed the difference between "nobody knows", "we have not done the work"
 * and "this is the platform's own model".
 */
export function resolveLab(parsed: ParsedPermaslug): LabResolution {
  if (parsed.isResidual) {
    return { labSlug: null, state: "not_applicable", qualityFlags: ["RESIDUAL_UNATTRIBUTED"] };
  }

  const namespace = parsed.namespace;
  if (namespace === null) {
    // No namespace has ever been observed on a named row. If one appears, it is a contract
    // surprise worth flagging rather than quietly treating as a lab name.
    return { labSlug: null, state: "unmapped", qualityFlags: ["NO_NAMESPACE"] };
  }

  if (UNDISCLOSED_NAMESPACES.has(namespace)) {
    return { labSlug: null, state: "undisclosed", qualityFlags: ["LAB_UNDISCLOSED"] };
  }

  if (PLATFORM_NAMESPACES.has(namespace)) {
    return { labSlug: null, state: "unmapped", qualityFlags: ["SERVING_PLATFORM_AS_AUTHOR"] };
  }

  const labSlug = NAMESPACE_TO_LAB_SLUG[namespace];
  if (labSlug === undefined) {
    return { labSlug: null, state: "unmapped", qualityFlags: ["LAB_UNMAPPED"] };
  }

  const flags: string[] = [];
  // Recorded on the row so a later reader can see the mapping was not the identity function.
  if (labSlug !== namespace) flags.push("LAB_NAMESPACE_ALIASED");
  if (parsed.variant !== null) flags.push("VARIANT_ROW");
  return { labSlug, state: "evidenced", qualityFlags: flags };
}

/**
 * Whether two permaslugs denote the same canonical model.
 *
 * Folding is by base slug only: `model` and `model:free` are the same model served on two
 * commercial terms, and Phase 1A measured 29 dates where both were in the top 50 at once.
 * Nothing else folds. Two dated versions of a family are different models and merging them
 * would destroy the version history that makes the series worth reading.
 */
export function foldsTogether(a: ParsedPermaslug, b: ParsedPermaslug): boolean {
  if (a.isResidual || b.isResidual) return false;
  return a.baseSlug === b.baseSlug;
}

/** True for the reserved tail permaslug. */
export function isResidualPermaslug(permaslug: string): boolean {
  return permaslug === RESIDUAL_PERMASLUG;
}
