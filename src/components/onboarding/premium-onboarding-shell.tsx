import Link from "next/link";

import { SITE_NAME } from "@/constants/site";

/** The wide, minimal two-page premium-conversion frame. */
export function PremiumOnboardingShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen flex-1 bg-black px-3 py-3 text-neutral-100 sm:px-6 sm:py-6">
      <section className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col rounded-2xl border border-white/[0.04] bg-[#0a0a0a] px-5 py-6 sm:px-8 sm:py-8 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/15 pb-6 sm:pb-8">
          <Link
            href="/"
            className="rounded-sm text-xl font-medium tracking-tight text-neutral-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
          >
            {SITE_NAME}
          </Link>
          <p className="text-sm font-medium tracking-[0.08em] text-neutral-400 sm:text-base">{label}</p>
        </header>
        {children}
      </section>
    </main>
  );
}

