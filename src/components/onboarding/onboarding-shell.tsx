import Link from "next/link";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Shared chrome for every onboarding screen.
 *
 * One narrow column on the existing dark surface, using the site header and footer
 * rather than a separate full-screen wizard shell. Onboarding is a page of Urdais,
 * not a modal world a reader is trapped in — which also means ordinary back
 * navigation always works and nothing needs to trap focus.
 *
 * There is deliberately **no "Step 2 of 4" indicator**. The paths differ: an
 * existing subscriber sees one screen, a new user sees three, someone already
 * signed in sees one. A fixed count would be wrong for most of them, so the state
 * is communicated by the heading instead.
 */
export function OnboardingShell({
  eyebrow,
  title,
  lead,
  back,
  children,
}: {
  /** Small label above the heading, naming the state. */
  eyebrow: string;
  title: string;
  lead?: string;
  /** An explicit way back, where one makes sense. */
  back?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:py-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">{eyebrow}</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-neutral-50">{title}</h1>
        {lead ? <p className="mt-3 text-sm text-neutral-300">{lead}</p> : null}

        <div className="mt-8 flex flex-col gap-6">{children}</div>

        {back ? (
          <p className="mt-8 text-xs text-neutral-500">
            <Link
              href={back.href}
              className="underline underline-offset-2 transition-colors hover:text-neutral-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
            >
              {back.label}
            </Link>
          </p>
        ) : null}
      </main>
      <SiteFooter />
    </>
  );
}
