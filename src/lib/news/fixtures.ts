/**
 * Retained feed artifacts.
 *
 * Each file is the real response from the approved feed, trimmed to the first
 * few items and with any `content:encoded` element removed: Urdais does not
 * store article bodies, and a fixture is not an exception to that. Loading
 * re-hashes the file and refuses a mismatch, so a fixture cannot drift from
 * the provenance recorded beside it.
 *
 * Core tests read these rather than the network, so the suite does not depend
 * on a publisher being reachable or on today's headlines.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Hex } from "@/lib/tokens/hash";
import type { NewsSourceSlug } from "@/lib/news/types";

export type FeedFixture = {
  source: NewsSourceSlug;
  sourceUrl: string;
  retrievedAt: string;
  contentType: string;
  bodyFile: string;
  sha256: string;
  provenance: string;
  body: string;
};

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const META: Record<NewsSourceSlug, Omit<FeedFixture, "body">> = {
  "google-cloud-infrastructure": {
    source: "google-cloud-infrastructure",
    sourceUrl: "https://cloudblog.withgoogle.com/products/infrastructure/rss/",
    retrievedAt: "2026-09-14T17:45:00Z",
    contentType: "application/xml; charset=utf-8",
    bodyFile: "google-cloud-infrastructure.xml",
    sha256: "30b8d009c242c65730e5733e170f596ce9410779b7e0a9817ccd611e68f35076",
    provenance:
      "First three items of the live response retrieved 2026-09-14 (HTTP 200, application/xml; charset=utf-8, 388679 bytes, sha256 fa07ddf85bd47ae9079e4ba9b17e0996b03ab9ba19d5396e132dd8e753cfe191, 20 items). Channel header verbatim. The description elements are kept as published because they are the evidence that this feed carries article HTML rather than a snippet, which is why the source stores no description.",
  },
  "google-cloud-compute": {
    source: "google-cloud-compute",
    sourceUrl: "https://cloudblog.withgoogle.com/products/compute/rss/",
    retrievedAt: "2026-09-14T17:45:00Z",
    contentType: "application/xml; charset=utf-8",
    bodyFile: "google-cloud-compute.xml",
    sha256: "f33ada910df16c619bfa5f6cea42e97962d6f8941a901c3c44909f09424de8c6",
    provenance:
      "First two items of the live response retrieved 2026-09-14 (HTTP 200, application/xml; charset=utf-8, 463924 bytes, sha256 11271ec9f54c1d6d83e406871b216ff713e22629440697fde7de0c396e27f883, 20 items). Channel header verbatim.",
  },
  "microsoft-azure-blog": {
    source: "microsoft-azure-blog",
    sourceUrl: "https://azure.microsoft.com/en-us/blog/feed/",
    retrievedAt: "2026-09-14T17:45:00Z",
    contentType: "application/rss+xml; charset=UTF-8",
    bodyFile: "microsoft-azure-blog.xml",
    sha256: "bb607c0d6ce2ab0144832fde1703b1baadad8cd1c93589470d0738eedd2124d6",
    provenance:
      "First four items of the live response retrieved 2026-09-14 (HTTP 200, application/rss+xml; charset=UTF-8, 205068 bytes, sha256 057c772e01b036969ad615fa2411d9e9fdf0738bd9acbbb915b5e9296ed18bce, 10 items), with content:encoded removed from each item. Channel header verbatim.",
  },
  "coreweave-blog": {
    source: "coreweave-blog",
    sourceUrl: "https://www.coreweave.com/blog/rss.xml",
    retrievedAt: "2026-09-14T17:45:00Z",
    contentType: "application/rss+xml; charset=utf-8",
    bodyFile: "coreweave-blog.xml",
    sha256: "65cf3ef49517ff15e15c889d85d9a3090cb3882d9dd4d241eb28e647e068e907",
    provenance:
      "First four items of the live response retrieved 2026-09-14 (HTTP 200, application/rss+xml; charset=utf-8, 89532 bytes, sha256 d92f061d93a2d6c1bb9388984b4040c1a08bcafba1da7a51146548a1bc64502f). Channel header verbatim. Item links use the wf.coreweave.com publishing host, which is the evidence for the recorded canonical-host rewrite.",
  },
  "lambda-blog": {
    source: "lambda-blog",
    sourceUrl: "https://lambda.ai/blog/rss.xml",
    retrievedAt: "2026-09-14T22:40:00Z",
    contentType: "text/xml; charset=UTF-8",
    bodyFile: "lambda-blog.xml",
    sha256: "8bb451d5727c3fb10533ae509dd9cd184b3ffb0e01181bc0e0d76e9ba08aea6f",
    provenance:
      "First three items of the live response retrieved 2026-09-14 (HTTP 200, text/xml; charset=UTF-8, 34299 bytes, RSS 2.0, 10 items). Channel header verbatim. The description elements are kept as published because they are the evidence that this feed carries the whole HubSpot post, including its inline featured image, which is why the source stores neither a description nor an image.",
  },
  "together-ai-blog": {
    source: "together-ai-blog",
    sourceUrl: "https://www.together.ai/blog/rss.xml",
    retrievedAt: "2026-09-14T22:40:00Z",
    contentType: "application/rss+xml; charset=utf-8",
    bodyFile: "together-ai-blog.xml",
    sha256: "a879b46888fc527422d01d411269703df471ab5c5c5ad8676a1ddc859182e3eb",
    provenance:
      "First four items of the live response retrieved 2026-09-14 (HTTP 200, application/rss+xml; charset=utf-8, 59196 bytes, RSS 2.0, 100 items). Channel header verbatim. Short publisher descriptions, and media:content on the items that carry artwork.",
  },
  "cloudflare-workers-blog": {
    source: "cloudflare-workers-blog",
    sourceUrl: "https://blog.cloudflare.com/tag/workers/rss/",
    retrievedAt: "2026-09-14T22:40:00Z",
    contentType: "application/rss+xml; charset=utf-8",
    bodyFile: "cloudflare-workers-blog.xml",
    sha256: "3aafce8104b4c26a6360d2978ab158b7190f6189884674d631d40302a48a68b9",
    provenance:
      "First four items of the live response retrieved 2026-09-14 (HTTP 200, application/rss+xml; charset=utf-8, 304887 bytes, RSS 2.0, 20 items), with content:encoded removed from each item. Channel header verbatim. The description elements and the image enclosures are the ones the parser reads and are kept as published.",
  },
  "digitalocean-blog": {
    source: "digitalocean-blog",
    sourceUrl: "https://www.digitalocean.com/rss/blog.atom",
    retrievedAt: "2026-09-14T22:40:00Z",
    contentType: "application/atom+xml",
    bodyFile: "digitalocean-blog.xml",
    sha256: "4c1d321b656f60300d76f14be7a50f9766746914fb144724468bd847c26257c4",
    provenance:
      "First three entries of the live response retrieved 2026-09-14 (HTTP 200, application/atom+xml, 1442396 bytes, Atom 1.0, 100 entries). Feed header verbatim. The content elements are kept as published because they are the element this parser reads and the evidence that the feed offers an article body rather than a summary, which is why the source stores no description.",
  },
  "doe-newsroom": {
    source: "doe-newsroom",
    sourceUrl: "https://www.energy.gov/newsroom/rss.xml",
    retrievedAt: "2026-09-15T14:20:00Z",
    contentType: "application/rss+xml; charset=utf-8",
    bodyFile: "doe-newsroom.xml",
    sha256: "7fcc0780a920adc10853faa930ff4558fcc3b0931a9bd0889d8996d808971e92",
    provenance:
      "First four items of the live response retrieved 2026-09-15 (HTTP 200, application/rss+xml; charset=utf-8, 7274 bytes, RSS 2.0, 10 items). Channel header verbatim. Plain-text descriptions of around 180 characters, which is why this source stores them; no media element.",
  },
  "pjm-inside-lines": {
    source: "pjm-inside-lines",
    sourceUrl: "https://insidelines.pjm.com/feed/",
    retrievedAt: "2026-09-15T14:20:00Z",
    contentType: "application/rss+xml; charset=UTF-8",
    bodyFile: "pjm-inside-lines.xml",
    sha256: "755445e3126b811a7920434528ed245e6cfac9b282e5ef048c84a012246e61e8",
    provenance:
      "First four items of the live response retrieved 2026-09-15 (HTTP 200, application/rss+xml; charset=UTF-8, 49930 bytes, RSS 2.0, 10 items), with content:encoded removed from each. Channel header verbatim. The description elements are kept as published because they are the evidence that this feed carries the post body with an inline image, which is why the source stores neither a description nor an image.",
  },
  "power-magazine": {
    source: "power-magazine",
    sourceUrl: "https://www.powermag.com/feed/",
    retrievedAt: "2026-09-15T14:20:00Z",
    contentType: "application/rss+xml; charset=UTF-8",
    bodyFile: "power-magazine.xml",
    sha256: "397605b723749088e3d7040c36e9640bc73507676d6633e2c23affad8f5bfa44",
    provenance:
      "First three items of the live response retrieved 2026-09-15 (HTTP 200, application/rss+xml; charset=UTF-8, 31082 bytes, RSS 2.0, 10 items), with content:encoded removed from each. Channel header verbatim.",
  },
  "power-magazine-data-centers": {
    source: "power-magazine-data-centers",
    sourceUrl: "https://www.powermag.com/category/data-centers/feed/",
    retrievedAt: "2026-09-15T14:20:00Z",
    contentType: "application/rss+xml; charset=UTF-8",
    bodyFile: "power-magazine-data-centers.xml",
    sha256: "05744f3eaf180e6767b7094ac246af9bd502325239f9e85fc7a0c1492d2e8403",
    provenance:
      "First three items of the live response retrieved 2026-09-15 (HTTP 200, application/rss+xml; charset=UTF-8, 30561 bytes, RSS 2.0, 10 items), with content:encoded removed from each. Channel header verbatim. Items carry the publisher's own category terms, Data Centers among them, which is how this endpoint is scoped.",
  },
  "bitcoin-optech": {
    source: "bitcoin-optech",
    sourceUrl: "https://bitcoinops.org/feed.xml",
    retrievedAt: "2026-09-15T15:10:00Z",
    contentType: "application/xml",
    bodyFile: "bitcoin-optech.xml",
    sha256: "f64cc521eb11e1f81021077dfdb9f785063c2765922d5da7e8be0b4d7c1cdf88",
    provenance:
      "First three entries of the live response retrieved 2026-09-15 (HTTP 200, application/xml, 627631 bytes, Atom 1.0, 10 entries), with the content element removed from each. Feed header verbatim. The summary elements are kept as published because they are the element the parser reads; the content elements carry the whole newsletter and are not retained.",
  },
  "the-block": {
    source: "the-block",
    sourceUrl: "https://www.theblock.co/rss.xml",
    retrievedAt: "2026-09-15T15:10:00Z",
    contentType: "text/xml; charset=UTF-8",
    bodyFile: "the-block.xml",
    sha256: "98927d093bfa86a5dd8067fe16022c8cc24f0a86ef139fa7da46deb2e8a49b28",
    provenance:
      "First four items of the live response retrieved 2026-09-15 (HTTP 200, text/xml; charset=UTF-8, 28904 bytes, RSS 2.0, 20 items), with content:encoded removed from each. Channel header verbatim. UUID guids distinct from the canonical link, short publisher descriptions, and media:content on every item.",
  },
  "chainalysis-blog": {
    source: "chainalysis-blog",
    sourceUrl: "https://www.chainalysis.com/feed/",
    retrievedAt: "2026-09-15T15:10:00Z",
    contentType: "application/rss+xml; charset=UTF-8",
    bodyFile: "chainalysis-blog.xml",
    sha256: "5c873117ecf9ec3c00ef59935c091ff29595c01db3cfbc5dd4547236c1756769",
    provenance:
      "First three items of the live response retrieved 2026-09-15 (HTTP 200, application/rss+xml; charset=UTF-8, 12503 bytes, RSS 2.0, 10 items). Channel header verbatim. Descriptions are summary paragraphs of around 450 characters; no media element.",
  },
};

export function loadFeedFixture(source: NewsSourceSlug): FeedFixture {
  const meta = META[source];
  const body = readFileSync(path.join(FIXTURE_DIR, meta.bodyFile), "utf8");
  const sha256 = sha256Hex(body);
  if (meta.sha256 !== sha256) {
    throw new Error(`${meta.bodyFile} hash ${sha256} does not match recorded provenance ${meta.sha256}`);
  }
  return { ...meta, sha256, body };
}

export function feedFixtureMeta(source: NewsSourceSlug): Omit<FeedFixture, "body"> {
  return META[source];
}
