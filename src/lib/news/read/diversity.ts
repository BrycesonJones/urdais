/**
 * Visible-source diversity on the Compute rail.
 *
 * The stored order is chronological and stays that way: nothing here writes,
 * reorders or invents a timestamp. This is a presentation rule applied after
 * the read, and it exists because chronology alone produces a misleading rail.
 * One approved publisher stamps every item in its feed with the same
 * publication minute, so a strict newest-first cut of a hundred articles is a
 * hundred cards from that publisher — which says something about that feed's
 * timestamps, not about the compute market.
 *
 * The rule is the smallest one that fixes it: walking newest-first, never place
 * a third consecutive card from the same publisher. When only one publisher has
 * anything left, its cards are placed anyway. No publisher is ever hidden, no
 * card is dropped, and each publisher's own stories stay in their published
 * order.
 */

import type { NewsArticle } from "@/types/news";

export const MAX_CONSECUTIVE_PER_SOURCE = 2;

export type DiversifyOptions = {
  limit: number;
  maxConsecutive?: number;
};

/**
 * Deterministic: the same input list always yields the same output list.
 * Articles are taken from the front of the queue, so the newest eligible story
 * always wins and a deferred story is never dropped, only placed later.
 */
export function diversifyBySource(
  articles: readonly NewsArticle[],
  { limit, maxConsecutive = MAX_CONSECUTIVE_PER_SOURCE }: DiversifyOptions,
): NewsArticle[] {
  if (limit <= 0) return [];
  const remaining = [...articles];
  const out: NewsArticle[] = [];

  while (out.length < limit && remaining.length > 0) {
    const tail = out.slice(-maxConsecutive);
    const blocked =
      tail.length === maxConsecutive && tail.every((row) => row.source === tail[0]!.source)
        ? tail[0]!.source
        : null;

    // The newest story that does not extend a run. Falling back to index 0 is
    // deliberate: when the only stories left are the blocked publisher's, a
    // shorter rail would be a worse answer than a third consecutive card.
    let index = blocked === null ? 0 : remaining.findIndex((row) => row.source !== blocked);
    if (index === -1) index = 0;
    out.push(remaining.splice(index, 1)[0]!);
  }

  return out;
}
