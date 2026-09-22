/**
 * Urdais's own rules, applied to what a feed said.
 *
 * Every rule here is deterministic and stated once: the same entry normalizes
 * to the same record on every run, which is what makes repeated ingestion a
 * no-op rather than a second copy. Nothing is invented. A publisher that
 * supplies no description yields no description; a publisher that supplies an
 * article body in place of one yields no description either, because an
 * excerpt of a body is not a snippet the publisher offered.
 */

import { stripMarkup } from "@/lib/news/feed";
import type { DescriptionPolicy, ImageHost, ImagePolicy, NewsSourceDefinition } from "@/lib/news/types";

export const MAX_TITLE_LENGTH = 400;
export const MAX_SUMMARY_LENGTH = 500;

/**
 * Parameters that identify a campaign or a referrer rather than a document.
 * The list is exact on purpose: a parameter Urdais does not recognise is left
 * alone, because removing one that selects content would send readers to a
 * different page than the publisher linked.
 */
const TRACKING_PARAM_PREFIXES = ["utm_", "hsa_", "pk_", "mtm_", "piwik_"];
const TRACKING_PARAMS: ReadonlySet<string> = new Set([
  "gclid", "gbraid", "wbraid", "dclid", "fbclid", "msclkid", "twclid", "ttclid", "yclid",
  "mc_cid", "mc_eid", "igshid", "_hsenc", "_hsmi", "ref_src", "s_kwcid", "ef_id",
  "sfmc_id", "oly_enc_id", "oly_anon_id", "vero_id", "cmpid", "icid", "ncid",
]);

function isTrackingParam(name: string): boolean {
  const key = name.toLowerCase();
  return TRACKING_PARAMS.has(key) || TRACKING_PARAM_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export type NormalizedUrl = { canonicalUrl: string; urlKey: string };

export type UrlNormalizationResult =
  | { ok: true; value: NormalizedUrl }
  | { ok: false; reason: "unparseable" | "not_https" };

/**
 * The destination Urdais publishes, and the identity it deduplicates on.
 *
 * `canonicalUrl` is the publisher's own link with campaign noise and the
 * fragment removed: it is what a reader is sent to. `urlKey` is that URL
 * reduced further — query parameters ordered, a trailing slash on a non-root
 * path dropped — so that two feeds spelling one story slightly differently
 * still collide on a unique index.
 */
export function normalizeArticleUrl(
  raw: string,
  rewrite?: NewsSourceDefinition["canonicalHostRewrite"],
): UrlNormalizationResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, reason: "unparseable" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };

  // A recorded, verified rewrite of a publishing host the publisher's own
  // article pages declare non-canonical. Never a guess made at parse time.
  if (rewrite && url.hostname.toLowerCase() === rewrite.from.toLowerCase()) {
    url.hostname = rewrite.to;
  }
  url.hash = "";
  for (const name of [...url.searchParams.keys()]) {
    if (isTrackingParam(name)) url.searchParams.delete(name);
  }
  if ([...url.searchParams.keys()].length === 0) url.search = "";
  const canonicalUrl = url.toString();

  const key = new URL(canonicalUrl);
  const sorted = [...key.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  key.search = "";
  for (const [name, value] of sorted) key.searchParams.append(name, value);
  if (key.pathname.length > 1 && key.pathname.endsWith("/")) key.pathname = key.pathname.replace(/\/+$/, "");
  return { ok: true, value: { canonicalUrl, urlKey: key.toString() } };
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit - 1);
  const boundary = cut.lastIndexOf(" ");
  return `${(boundary > limit * 0.6 ? cut.slice(0, boundary) : cut).trimEnd()}…`;
}

/** Markup out, entities resolved, whitespace collapsed. Null when nothing is left. */
export function normalizeTitle(raw: string | null): string | null {
  if (raw === null) return null;
  const text = stripMarkup(raw);
  return text === "" ? null : truncate(text, MAX_TITLE_LENGTH);
}

/**
 * WordPress appends its own trailer to the syndicated description. It is the
 * platform's sentence, not the publisher's snippet, and repeating it on every
 * card would read as Urdais's own text.
 */
const WORDPRESS_TRAILER = /\s*The post\b[\s\S]*?\bappeared first on\b[\s\S]*$/;

export function normalizeSummary(raw: string | null, policy: DescriptionPolicy): string | null {
  if (policy === "omit_feed_carries_body") return null;
  if (raw === null) return null;
  const text = stripMarkup(raw).replace(WORDPRESS_TRAILER, "").trim();
  return text === "" ? null : truncate(text, MAX_SUMMARY_LENGTH);
}

export type TimestampResult =
  | { ok: true; value: string }
  | { ok: false; reason: "unparseable" | "implausible" };

const EARLIEST_PLAUSIBLE = Date.UTC(2000, 0, 1);
/** A publisher's clock may run ahead of Urdais's; two days of it is tolerated, a year is not. */
const FUTURE_TOLERANCE_MS = 48 * 60 * 60 * 1000;

/** RFC 822 (`pubDate`) and ISO 8601 (Atom `published`) both land on one UTC instant. */
export function normalizePublishedAt(raw: string | null, retrievedAt: string): TimestampResult {
  if (raw === null) return { ok: false, reason: "unparseable" };
  const parsed = new Date(raw.trim());
  const time = parsed.getTime();
  if (!Number.isFinite(time)) return { ok: false, reason: "unparseable" };
  const now = new Date(retrievedAt).getTime();
  const ceiling = Number.isFinite(now) ? now + FUTURE_TOLERANCE_MS : Date.now() + FUTURE_TOLERANCE_MS;
  if (time < EARLIEST_PLAUSIBLE || time > ceiling) return { ok: false, reason: "implausible" };
  return { ok: true, value: parsed.toISOString() };
}

export type ImageResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: "host_not_permitted"; url: string };

/**
 * Only a thumbnail the feed offered, only where the source opts in, only over
 * https, and only from a host and path the source's own rights finding names.
 *
 * The allowlist is enforced here rather than only in the renderer, because the
 * renderer is a display concern and this is a rights one: a URL Urdais may not
 * reference should never reach the database in the first place. A URL that
 * fails the allowlist is reported rather than silently dropped — a publisher
 * moving its CDN should look like a diagnostic, not like a feed that quietly
 * stopped having artwork.
 */
/**
 * Cloudflare Images serves a resized copy of an asset from the publisher's own
 * host, by prefixing the asset's path with `/cdn-cgi/image/<options>/`. The
 * options segment is opaque and publisher-chosen; what matters is the path
 * underneath it, which is the asset the source's rights finding was made
 * about. A prefix with no asset path after it matches nothing.
 */
const CLOUDFLARE_IMAGE_TRANSFORM = /^\/cdn-cgi\/image\/[^/]+(\/.+)$/;

/**
 * Whether one permitted origin admits this URL.
 *
 * The direct asset path is always the rule. Where a source opts in, the
 * publisher's own resizing prefix is peeled off first and the same path
 * requirement is applied to the asset path underneath — never to the host
 * alone, and never to some other path on the same host.
 */
export function imageOriginPermits(url: URL, entry: ImageHost): boolean {
  if (url.hostname.toLowerCase() !== entry.host.toLowerCase()) return false;
  if (url.pathname.startsWith(entry.pathPrefix)) return true;
  if (!entry.allowsCloudflareImageTransform) return false;
  const underlying = CLOUDFLARE_IMAGE_TRANSFORM.exec(url.pathname)?.[1];
  return underlying !== undefined && underlying.startsWith(entry.pathPrefix);
}

export function normalizeImageUrl(
  raw: string | null,
  policy: ImagePolicy,
  hosts: readonly ImageHost[] = [],
): ImageResult {
  if (policy === "none" || raw === null) return { ok: true, value: null };
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: true, value: null };
  }
  if (url.protocol !== "https:") return { ok: true, value: null };
  url.hash = "";
  if (!hosts.some((entry) => imageOriginPermits(url, entry))) {
    return { ok: false, reason: "host_not_permitted", url: url.toString() };
  }
  return { ok: true, value: url.toString() };
}

/**
 * Deterministic identity within a source: the publisher's own stable id where
 * the feed supplies one, the normalized URL otherwise. Headline text is never
 * an identity signal.
 */
export function articleKey(guid: string | null, urlKey: string): string {
  const trimmed = guid?.trim();
  return trimmed ? trimmed : urlKey;
}
