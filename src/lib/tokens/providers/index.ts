/**
 * The parser registry: one entry per provider Urdais can read.
 *
 * This replaces a dispatch chain that tested two providers by name and then
 * returned the OpenAI parser for everything else. With three providers whose
 * names were all tested somewhere, that fallback was invisible. With a fourth,
 * it becomes a silent wrong answer: an unregistered provider's HTML would be
 * handed to a parser written for a different page, and the likely outcome is
 * not a crash but a plausible set of quotes attributed to the wrong source.
 *
 * A registry keyed by the provider union has the property that mattered here:
 * adding a provider to `TOKEN_PROVIDERS` without writing its parser is a
 * compile error, and asking for a provider that is not in the registry at all
 * throws by name rather than guessing.
 */

import { parseAnthropicPricing } from "@/lib/tokens/providers/anthropic";
import { parseOpenAiPricing } from "@/lib/tokens/providers/openai";
import { parseXaiPricing } from "@/lib/tokens/providers/xai";
import type { ProviderParseResult, Wave1Provider } from "@/lib/tokens/types";

/** What every provider parser is: retained artifact in, canonical quotes out. */
export type ProviderParser = (html: string, retrievedAt: string) => ProviderParseResult;

/**
 * Every provider must appear here. The Record over the provider union is the
 * point: a new provider slug does not compile until its parser exists.
 */
export const PROVIDER_PARSERS: Record<Wave1Provider, ProviderParser> = {
  anthropic: parseAnthropicPricing,
  openai: parseOpenAiPricing,
  xai: parseXaiPricing,
};

export class UnknownProviderParserError extends Error {
  constructor(provider: string) {
    super(`no pricing parser is registered for provider "${provider}"`);
    this.name = "UnknownProviderParserError";
  }
}

/**
 * The parser for a provider. Throws rather than falling back, because a
 * fallback here attributes one provider's prices to another.
 */
export function providerParser(provider: string): ProviderParser {
  const parser = (PROVIDER_PARSERS as Record<string, ProviderParser | undefined>)[provider];
  if (!parser) throw new UnknownProviderParserError(provider);
  return parser;
}
