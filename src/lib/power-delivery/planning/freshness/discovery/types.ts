/** The contract a source checker implements. Parsing is pure; fetching is the caller's job. */

import type { PlanningSourceKey } from "@/lib/power-delivery/planning/ingest/types";

export const PLANNING_CHECKER_VERSION = "urdais-planning-source-checker/1.0.0" as const;

/** What one look at a source found. `parse` returns this; the network never appears in a test. */
export type DiscoveredVintage = {
  /** The key the ingestion adapter would give this release, so the two are directly comparable. */
  nativeVintageKey: string;
  publishedAt: string | null;
  publishedAtPrecision: "year" | "month" | "day" | "minute" | null;
  /** The artifact that identifies the release, where the discovery names one. */
  artifactUrl: string | null;
  /** Everything the check saw, kept as evidence rather than summarised away. */
  evidence: Record<string, unknown>;
};

export class PlanningDiscoveryError extends Error {
  constructor(
    readonly source: PlanningSourceKey,
    message: string,
  ) {
    super(`${source}: ${message}`);
    this.name = "PlanningDiscoveryError";
  }
}

/** One fetched document, handed to a parser. */
export type DiscoveryDocument = { url: string; status: number; body: string };

export interface PlanningSourceChecker {
  source: PlanningSourceKey;
  sourceInterfaceSlug: string;
  /** Pages the checker needs. For an asset probe these are candidate artifact URLs. */
  documents(now: Date): string[];
  /**
   * Decide what the publisher is currently offering. Pure: same documents, same answer.
   * Throws `PlanningDiscoveryError` when the source no longer looks the way it was written
   * against, because a checker that silently finds nothing would read as "nothing has changed".
   */
  parse(documents: readonly DiscoveryDocument[]): DiscoveredVintage;
}

/** Anchors in HTML, matched case-insensitively and with entities already decoded. */
export function anchors(html: string): { href: string; text: string }[] {
  const decode = (value: string): string => value
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number.parseInt(dec, 10)));
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => ({
    href: decode(match[1]!),
    text: decode(match[2]!.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(),
  }));
}
