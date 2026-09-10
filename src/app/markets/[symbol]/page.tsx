import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/layout/site-header";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { UCPI_INDEX } from "@/data/mock/ucpi";
import { MARKETS_HREF } from "@/lib/routes";
import type { MarketIndex } from "@/types/market";

const INDICES: MarketIndex[] = [UCPI_INDEX, ...INDEX_SNAPSHOTS];

type PageProps = { params: Promise<{ symbol: string }> };

function findIndex(symbol: string): MarketIndex | undefined {
  return INDICES.find((index) => index.symbol.toLowerCase() === symbol.toLowerCase());
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const index = findIndex((await params).symbol);
  return { title: index ? index.symbol : "Not found" };
}

/**
 * Temporary route shell so homepage links resolve. The detailed market and
 * chart page is a later slice; nothing here is final.
 */
export default async function MarketIndexPage({ params }: PageProps) {
  const index = findIndex((await params).symbol);
  if (!index) notFound();

  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 py-12 text-neutral-50 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-screen-2xl">
          <Link
            href={MARKETS_HREF}
            className="text-sm text-neutral-400 hover:text-neutral-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
          >
            ← Information Markets
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight md:text-3xl">{index.symbol}</h1>
          <p className="mt-1 text-sm text-neutral-400">{index.name}</p>
          <p className="mt-8 text-sm text-neutral-400">The detailed {index.symbol} chart is coming soon.</p>
        </div>
      </main>
    </>
  );
}
