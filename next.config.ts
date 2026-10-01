import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pg"],
  experimental: {
    // Off: authentication freshness outranks development fetch reuse. With this
    // cache on (Next's development default), a hot reload re-renders open tabs
    // with every Server Component fetch answered from the previous render --
    // including Supabase's `GET /auth/v1/user`. After an account deletion, a tab
    // still holding the deleted user's unexpired token was handed that user's old
    // 200, resolved as authenticated without Supabase being asked, and
    // `resolveUrdaisAccount` recreated the deleted account (reproduced in Phase 7D
    // verification; see docs/architecture/account-deletion.md §11).
    //
    // A per-request opt-out does not exist: Next 16.3.4 reads and fills this
    // cache whatever the fetch's `cache` / `revalidate` options say, and the only
    // bypass (`next: { internal: true }`) is private. Turning the cache off makes
    // Next attach none to any request, so every auth lookup reaches Supabase.
    // Pinned by src/lib/auth/deleted-identity-replay.test.ts.
    serverComponentsHmrCache: false,
  },
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
      // The Block, its own asset host, and the Cloudflare Images resizing path
      // the publisher put in front of it on 2026-09-19. A remote pattern cannot
      // express "then /wp/uploads/ underneath", which the ingestion rule does
      // require; this entry is the coarser mirror of it, not the gate.
      { protocol: "https", hostname: "www.tbstat.com", pathname: "/wp/uploads/**" },
      { protocol: "https", hostname: "www.tbstat.com", pathname: "/cdn-cgi/image/**" },
    ],
  },
};

export default nextConfig;
