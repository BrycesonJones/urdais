/**
 * The parser registry. The behaviour under test is mostly what it refuses.
 */

import { describe, expect, it } from "vitest";

import { loadPricingFixture } from "@/lib/tokens/fixtures";
import { PROVIDER_PARSERS, providerParser, UnknownProviderParserError } from "@/lib/tokens/providers";
import { WAVE1_PROVIDERS } from "@/lib/tokens/types";

const RETRIEVED = "2026-09-14T03:10:00Z";

describe("every provider in the roster has a parser", () => {
  it("registers exactly the providers the roster declares", () => {
    expect(Object.keys(PROVIDER_PARSERS).sort()).toEqual([...WAVE1_PROVIDERS].sort());
  });

  it("returns a parser for each one, and each parses its own retained artifact", () => {
    for (const provider of WAVE1_PROVIDERS) {
      const parsed = providerParser(provider)(loadPricingFixture(provider).body, RETRIEVED);
      expect(parsed.quotes.length).toBeGreaterThan(0);
      // Every quote a provider's parser yields belongs to that provider.
      for (const quote of parsed.quotes) {
        expect(quote.identityKey.startsWith(`${provider}::`)).toBe(true);
      }
    }
  });
});

describe("an unregistered provider is refused, not guessed at", () => {
  it("throws by name rather than falling back to another provider's parser", () => {
    // The defect this replaces: the dispatch chain tested two providers and
    // returned the OpenAI parser for everything else, so an unregistered
    // provider's page was parsed as though it were OpenAI's.
    expect(() => providerParser("google")).toThrow(UnknownProviderParserError);
    expect(() => providerParser("google")).toThrow(/no pricing parser is registered for provider "google"/);
  });

  it("refuses every Wave-2 provider slug until its parser exists", () => {
    for (const provider of ["google", "deepseek", "alibaba"]) {
      expect(() => providerParser(provider)).toThrow(UnknownProviderParserError);
    }
  });

  it("does not treat a provider's own artifact as another provider's", () => {
    // Anthropic's retained artifact through the OpenAI parser must not quietly
    // produce OpenAI-attributed quotes.
    const anthropic = loadPricingFixture("anthropic").body;
    let openAiQuotes: string[] = [];
    try {
      openAiQuotes = PROVIDER_PARSERS.openai(anthropic, RETRIEVED).quotes.map((row) => row.identityKey);
    } catch {
      // Refusing outright is the better outcome, and is also acceptable here.
      openAiQuotes = [];
    }
    expect(openAiQuotes.every((key) => key.startsWith("openai::"))).toBe(true);
    expect(openAiQuotes.some((key) => key.includes("claude"))).toBe(false);
  });
});
