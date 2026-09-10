import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/layout/site-header";
import { INDEX_SNAPSHOTS } from "@/data/mock/indices";
import { UCPI_INDEX } from "@/data/mock/ucpi";
import { marketIndexHref } from "@/lib/routes";

export const metadata: Metadata = { title: "Information Markets" };

/**
 * Temporary route shell so homepage links resolve. The real Information
 * Markets landing experience is a later slice; nothing here is final.
 */
export default function MarketsPage() {
  const indices = [UCPI_INDEX, ...INDEX_SNAPSHOTS];
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 flex-col bg-[#0a0a0a] px-4 py-12 text-neutral-50 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-screen-2xl">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Information Markets</h1>
          <p className="mt-2 text-sm text-neutral-400">The full markets experience is coming soon.</p>
          <ul className="mt-8 flex flex-col gap-2">
            {indices.map((index) => (
              <li key={index.symbol}>
                <Link
                  href={marketIndexHref(index.symbol)}
                  className="text-sm text-neutral-300 underline-offset-4 hover:text-neutral-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-400"
                >
                  {index.symbol} · {index.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
}
