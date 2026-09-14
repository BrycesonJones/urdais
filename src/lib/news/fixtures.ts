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
