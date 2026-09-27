import type { Metadata } from "next";
import Link from "next/link";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { signInHref } from "@/lib/access/gate-links";
import { safeReturnTo } from "@/lib/auth/return-to";

export const metadata: Metadata = {
  title: "Full access",
  description: "Urdais premium access.",
  // Not indexed: it is a temporary placeholder, not a product page.
  robots: { index: false, follow: false },
};

/**
 * Where "Get Full Access" leads, until onboarding and Stripe exist.
 *
 * **This is a deliberate placeholder.** Every premium gate's primary call to
 * action points here, and there is no checkout behind it, so this page says so in
 * as many words rather than presenting a form that cannot complete or a price that
 * cannot be paid. The alternative — pointing the CTA at a route that does not
 * exist, or at a sign-in page as though authenticating were the same as
 * subscribing — would be a broken journey in production.
 *
 * It is reachable today only by typing the URL: premium enforcement is inactive,
 * so no gate is rendered to anyone and nothing links here. That is what keeps it
 * from being a visible dead end while it waits for the phase that replaces it.
 *
 * Phase 4 owns the real journey (`Get Full Access → onboarding → create account →
 * verify → Stripe`). When it lands, `accessHref` in `@/lib/access/gate-links`
 * points at it and this file is deleted. The gates themselves do not change.
 */
export default async function AccessRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Validated with the one sanitiser, because it arrived in a query string.
  const returnTo = safeReturnTo(params.returnTo);
  const hasDestination = returnTo !== "/";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">FULL ACCESS</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-50">Subscriptions are not available yet</h1>

        <p className="mt-4 text-sm text-neutral-300">
          Urdais premium products are built, and the way to buy access is not. There is no subscription to purchase
          today and nothing on this page to fill in.
        </p>
        <p className="mt-3 text-sm text-neutral-400">
          Compute Economics, Power Analytics and the premium map layers are all currently readable without a
          subscription. Nothing you can reach today has been taken away.
        </p>

        <div className="mt-8 flex flex-col gap-3 text-sm">
          {hasDestination ? (
            <Link
              href={returnTo}
              className="rounded-md border border-white/15 px-4 py-2.5 text-center text-neutral-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
            >
              Back to where you were
            </Link>
          ) : null}
          <Link
            href="/markets"
            className="rounded-md border border-white/15 px-4 py-2.5 text-center text-neutral-200 transition-colors hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            Browse Urdais markets
          </Link>
        </div>

        <p className="mt-8 text-xs text-neutral-500">
          Already have a Urdais account?{" "}
          <Link
            href={signInHref(hasDestination ? returnTo : null)}
            className="text-neutral-300 underline underline-offset-2 transition-colors hover:text-neutral-100"
          >
            Sign in
          </Link>
          . An account does not grant premium access.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
