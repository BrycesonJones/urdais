/**
 * RSS 2.0 and Atom 1.0 reading.
 *
 * This is a feed reader, not a general XML parser, and the difference is the
 * point: it extracts a fixed set of elements from a fixed set of containers and
 * ignores everything else, so an unexpected element, a namespace it has never
 * seen, or a half-written entry at the end of a truncated response costs it an
 * entry rather than the whole feed. A dependency would buy generality this has
 * no use for.
 *
 * Nothing here decides what is valid or storable; it reports what the feed
 * said. Urdais's own rules live in normalize.ts.
 */

import { MalformedFeedError, type FeedEntry, type FeedMechanism } from "@/lib/news/types";

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  trade: "™",
  reg: "®",
  copy: "©",
  deg: "°",
  times: "×",
  middot: "·",
  bull: "•",
};

/**
 * One decoding pass. Feed text is XML-escaped HTML, so the caller decodes once
 * to recover the markup and once more after stripping it; decoding twice in one
 * pass would corrupt a legitimately escaped "&amp;lt;".
 */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const code = body.startsWith("#x") || body.startsWith("#X")
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Markup to readable text: block boundaries become spaces, tags go, entities resolve. */
export function stripMarkup(html: string): string {
  const spaced = html
    .replace(/<\s*(br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "");
  return decodeEntities(spaced).replace(/\s+/g, " ").trim();
}

/** The text of the first `<tag>` inside `xml`, CDATA unwrapped. Null when absent or empty. */
export function elementText(xml: string, tag: string): string | null {
  const pattern = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeTag(tag)}\\s*>`, "i");
  const match = pattern.exec(xml);
  if (!match || match[1] === undefined) return null;
  const raw = match[1];
  const cdata = /^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/.exec(raw);
  const text = cdata?.[1] ?? decodeEntities(raw);
  const trimmed = text.trim();
  return trimmed === "" ? null : trimmed;
}

/** The whole opening tag of the first `<tag ...>`, so its attributes can be read. */
function openingTag(xml: string, tag: string): string | null {
  const match = new RegExp(`<${escapeTag(tag)}(?:\\s[^>]*)?\\/?>`, "i").exec(xml);
  return match ? match[0] : null;
}

export function attribute(tagMarkup: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"|\\s${name}\\s*=\\s*'([^']*)'`, "i").exec(tagMarkup);
  const value = match?.[1] ?? match?.[2];
  if (value === undefined) return null;
  const text = decodeEntities(value).trim();
  return text === "" ? null : text;
}

function escapeTag(tag: string): string {
  return tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A thumbnail the feed itself offered, in the order publishers tend to offer one. */
function feedImage(block: string): string | null {
  for (const tag of ["media:content", "media:thumbnail"]) {
    const markup = openingTag(block, tag);
    const url = markup ? attribute(markup, "url") : null;
    if (url) return url;
  }
  const enclosure = openingTag(block, "enclosure");
  if (enclosure && (attribute(enclosure, "type") ?? "").startsWith("image/")) {
    return attribute(enclosure, "url");
  }
  return null;
}

function rssEntry(block: string): FeedEntry {
  return {
    title: elementText(block, "title"),
    link: elementText(block, "link"),
    guid: elementText(block, "guid"),
    description: elementText(block, "description"),
    published: elementText(block, "pubDate") ?? elementText(block, "dc:date"),
    imageUrl: feedImage(block),
  };
}

function atomEntry(block: string): FeedEntry {
  // Atom carries the destination on a link element's href. The alternate link
  // is the article; a self or enclosure link is not, so it is matched first
  // and a bare href only used when no relation is stated.
  const links = block.match(/<link(?:\s[^>]*)?\/?>/gi) ?? [];
  let href: string | null = null;
  for (const markup of links) {
    const rel = attribute(markup, "rel");
    if (rel === null || rel.toLowerCase() === "alternate") {
      href = attribute(markup, "href");
      if (href) break;
    }
  }
  return {
    title: elementText(block, "title"),
    link: href,
    guid: elementText(block, "id"),
    description: elementText(block, "summary") ?? elementText(block, "content"),
    published: elementText(block, "published") ?? elementText(block, "updated"),
    imageUrl: feedImage(block),
  };
}

export type ParsedFeed = {
  feedTitle: string | null;
  entries: FeedEntry[];
};

/**
 * Reads a feed body. Throws only when the body is not the kind of document it
 * claims to be, which is the case worth failing a whole source over: an error
 * page, an HTML redirect, or a truncated response with no recoverable root.
 */
export function parseFeed(body: string, mechanism: FeedMechanism): ParsedFeed {
  const text = body.trimStart();
  if (text === "") throw new MalformedFeedError("empty response body");

  if (mechanism === "rss") {
    if (!/<rss[\s>]/i.test(text) && !/<rdf:RDF[\s>]/i.test(text)) {
      throw new MalformedFeedError("response is not an RSS document");
    }
    const channel = /<channel(?:\s[^>]*)?>([\s\S]*)<\/channel\s*>/i.exec(text);
    const scope = channel?.[1] ?? text;
    const blocks = scope.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item\s*>/gi) ?? [];
    return {
      feedTitle: channel ? elementText(scope.split("<item")[0] ?? "", "title") : null,
      entries: blocks.map(rssEntry),
    };
  }

  if (!/<feed[\s>]/i.test(text)) throw new MalformedFeedError("response is not an Atom document");
  const blocks = text.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry\s*>/gi) ?? [];
  return {
    feedTitle: elementText(text.split("<entry")[0] ?? "", "title"),
    entries: blocks.map(atomEntry),
  };
}
