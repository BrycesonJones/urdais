import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Mock-development thumbnails only (see src/data/mock/news.ts). Urdais
    // stores provider thumbnail URLs rather than image bytes; the production
    // image host policy is decided with the news ingestion backend. Keep this
    // list narrow and never add a wildcard host.
    remotePatterns: [{ protocol: "https", hostname: "picsum.photos", pathname: "/seed/**" }],
  },
};

export default nextConfig;
