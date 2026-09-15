import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  images: {
    // Urdais references a publisher's own image URL and never stores or
    // re-serves the bytes, so news thumbnails render `unoptimized` (see
    // src/components/news/news-thumbnail.tsx) and the reader's browser fetches
    // them straight from the publisher. The authoritative gate on which images
    // may be referenced at all is the per-source allowlist in
    // src/lib/news/sources.ts, enforced during ingestion: a URL outside it is
    // never stored. This list mirrors that one for anything that does reach
    // the optimizer, and exists so the permitted origins are visible in the
    // build configuration too.
    //
    // Every entry is pinned to a path as well as a host. Two approved
    // publishers serve from one shared CDN, and host-only rules would admit
    // each other's assets and every other site on that CDN besides. Never add
    // a wildcard host.
    remotePatterns: [
      // Mock-development thumbnails only (see src/data/mock/news.ts).
      { protocol: "https", hostname: "picsum.photos", pathname: "/seed/**" },
      // Google Cloud blog, its own publishing bucket.
      { protocol: "https", hostname: "storage.googleapis.com", pathname: "/gweb-cloudblog-publish/**" },
      // CoreWeave, its own Webflow site id.
      { protocol: "https", hostname: "cdn.prod.website-files.com", pathname: "/62bc66d283fd9c34ffec780a/**" },
      // Together AI, its own Webflow site id on the same CDN.
      { protocol: "https", hostname: "cdn.prod.website-files.com", pathname: "/69654e88dce9154b5f12070c/**" },
      // Cloudflare blog, served from the publisher's own host.
      { protocol: "https", hostname: "blog.cloudflare.com", pathname: "/_emdash/api/media/file/**" },
    ],
  },
};

export default nextConfig;
