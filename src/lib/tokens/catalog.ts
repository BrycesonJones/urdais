/**
 * Wave-1 stable model catalog and source-interface pins.
 *
 * Identities here match migration `20260914020000_token_pricing_wave1_models.sql`.
 * Latest-pointer strings are aliases, never models. Display names may change;
 * provider-native ids do not.
 */

import type { SourceRegistryState } from "@/lib/ucpi/permission-gate";
import type { ModelIdentity } from "@/lib/tokens/identity";
import type { TokenSourceInterface, Wave1Provider } from "@/lib/tokens/types";

export type Wave1ModelSeed = ModelIdentity & { id: string };

export const WAVE1_MODELS: readonly Wave1ModelSeed[] = [
  {
    id: "99999999-a002-4000-8000-000000000001",
    providerSlug: "anthropic",
    providerModelId: "claude-fable-5-1",
    displayName: "Claude Fable 5.1",
    modelFamily: "Claude",
    version: "5.1",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a002-4000-8000-000000000002",
    providerSlug: "anthropic",
    providerModelId: "claude-opus-5",
    displayName: "Claude Opus 5",
    modelFamily: "Claude",
    version: "5",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a002-4000-8000-000000000003",
    providerSlug: "anthropic",
    providerModelId: "claude-sonnet-5",
    displayName: "Claude Sonnet 5",
    modelFamily: "Claude",
    version: "5",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a002-4000-8000-000000000004",
    providerSlug: "anthropic",
    providerModelId: "claude-haiku-4-5-20251001",
    displayName: "Claude Haiku 4.5",
    modelFamily: "Claude",
    version: "4.5-20251001",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000001",
    providerSlug: "xai",
    providerModelId: "grok-4.6",
    displayName: "Grok 4.6",
    modelFamily: "Grok",
    version: "4.6",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000002",
    providerSlug: "xai",
    providerModelId: "grok-4.5",
    displayName: "Grok 4.5",
    modelFamily: "Grok",
    version: "4.5",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000003",
    providerSlug: "xai",
    providerModelId: "grok-4.3",
    displayName: "Grok 4.3",
    modelFamily: "Grok",
    version: "4.3",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000004",
    providerSlug: "xai",
    providerModelId: "grok-4.20-0309-reasoning",
    displayName: "Grok 4.20 Reasoning (0309)",
    modelFamily: "Grok",
    version: "4.20-0309-reasoning",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000005",
    providerSlug: "xai",
    providerModelId: "grok-4.20-0309-non-reasoning",
    displayName: "Grok 4.20 Non-reasoning (0309)",
    modelFamily: "Grok",
    version: "4.20-0309-non-reasoning",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000006",
    providerSlug: "xai",
    providerModelId: "grok-build-0.1",
    displayName: "Grok Build 0.1",
    modelFamily: "Grok",
    version: "0.1",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a004-4000-8000-000000000007",
    providerSlug: "xai",
    providerModelId: "grok-4.20-multi-agent-0309",
    displayName: "Grok 4.20 Multi-agent (0309)",
    modelFamily: "Grok",
    version: "4.20-multi-agent-0309",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000001",
    providerSlug: "openai",
    providerModelId: "gpt-6-astra",
    displayName: "GPT-6 Astra",
    modelFamily: "GPT",
    version: "6",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000002",
    providerSlug: "openai",
    providerModelId: "gpt-5.6-sol",
    displayName: "GPT-5.6 Sol",
    modelFamily: "GPT",
    version: "5.6",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000003",
    providerSlug: "openai",
    providerModelId: "gpt-5.6-terra",
    displayName: "GPT-5.6 Terra",
    modelFamily: "GPT",
    version: "5.6",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000004",
    providerSlug: "openai",
    providerModelId: "gpt-5.6-luna",
    displayName: "GPT-5.6 Luna",
    modelFamily: "GPT",
    version: "5.6",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000005",
    providerSlug: "openai",
    providerModelId: "gpt-5.6-cyber",
    displayName: "GPT-5.6 Cyber",
    modelFamily: "GPT",
    version: "5.6",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000006",
    providerSlug: "openai",
    providerModelId: "gpt-5.3-codex",
    displayName: "GPT-5.3 Codex",
    modelFamily: "Codex",
    version: "5.3",
    lifecycleStatus: "current",
    identityKind: "stable",
  },
  {
    id: "99999999-a001-4000-8000-000000000007",
    providerSlug: "openai",
    providerModelId: "gpt-rosalind-research",
    displayName: "GPT-Rosalind Research",
    modelFamily: "GPT-Rosalind",
    version: null,
    lifecycleStatus: "current",
    identityKind: "stable",
  },
];

export type Wave1AliasSeed = {
  id: string;
  providerSlug: string;
  alias: string;
  targetProviderModelId: string;
  aliasKind: "latest_pointer" | "family_alias" | "legacy_name";
  notes: string;
};

export const WAVE1_ALIASES: readonly Wave1AliasSeed[] = [
  {
    id: "99999999-b002-4000-8000-000000000001",
    providerSlug: "anthropic",
    alias: "claude-haiku-4-5",
    targetProviderModelId: "claude-haiku-4-5-20251001",
    aliasKind: "family_alias",
    notes: "Dateless Haiku 4.5 id is an alias of the dated snapshot, not a floating latest pointer.",
  },
  {
    id: "99999999-b001-4000-8000-000000000001",
    providerSlug: "openai",
    alias: "gpt-daybreak-blue-latest",
    targetProviderModelId: "gpt-5.6-sol",
    aliasKind: "latest_pointer",
    notes: "Daybreak blue pointer; retargetable. Not a historical identity.",
  },
  {
    id: "99999999-b001-4000-8000-000000000002",
    providerSlug: "openai",
    alias: "gpt-daybreak-red-latest",
    targetProviderModelId: "gpt-5.6-cyber",
    aliasKind: "latest_pointer",
    notes: "Daybreak red pointer; retargetable. Not a historical identity.",
  },
];

const RESEARCH_USABLE: Omit<SourceRegistryState, "slug"> = {
  termsReviewState: "under_review",
  dataUseTermsState: "under_review",
  productionAccessState: "research_usable",
  writtenAgreementRequired: null,
};

export const WAVE1_SOURCE_INTERFACES: Record<Wave1Provider, TokenSourceInterface> = {
  anthropic: {
    id: "88888888-0000-4000-8000-000000000002",
    slug: "anthropic-api-pricing-docs",
    canonicalUrl: "https://docs.anthropic.com/en/docs/about-claude/pricing",
    parserId: "tokens.anthropic.pricing.html.v1",
    registry: { slug: "anthropic-api-pricing-docs", ...RESEARCH_USABLE },
  },
  openai: {
    id: "88888888-0000-4000-8000-000000000001",
    slug: "openai-api-pricing-docs",
    canonicalUrl: "https://platform.openai.com/docs/pricing",
    parserId: "tokens.openai.pricing.html.v1",
    registry: { slug: "openai-api-pricing-docs", ...RESEARCH_USABLE },
  },
  xai: {
    id: "88888888-0000-4000-8000-000000000004",
    slug: "xai-models-docs",
    canonicalUrl: "https://docs.x.ai/docs/models",
    parserId: "tokens.xai.pricing.html.v1",
    registry: { slug: "xai-models-docs", ...RESEARCH_USABLE },
  },
};

export function modelsFor(provider: Wave1Provider): Wave1ModelSeed[] {
  return WAVE1_MODELS.filter((model) => model.providerSlug === provider);
}

export function aliasesFor(provider: Wave1Provider): Wave1AliasSeed[] {
  return WAVE1_ALIASES.filter((alias) => alias.providerSlug === provider);
}

export function modelByNativeId(providerSlug: string, providerModelId: string): Wave1ModelSeed | undefined {
  return WAVE1_MODELS.find((model) => model.providerSlug === providerSlug && model.providerModelId === providerModelId);
}
