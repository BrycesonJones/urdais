import type { Metadata } from "next";

import { signOutAction } from "@/app/auth/actions";
import { AuthShell } from "@/app/auth/auth-shell";
import { canAccess, hasPremiumEntitlement } from "@/lib/access/entitlement";
import { PREMIUM_PRODUCT_IDS } from "@/lib/access/products";
import { resolveViewer } from "@/lib/access/server";
import { isPremiumEnforcementActive } from "@/lib/access/activation";

export const metadata: Metadata = {
  title: "Session status",
  robots: { index: false, follow: false },
};

/**
 * What the server believes about the current reader.
 *
 * This is the verification surface for Phase 2 and the only page that reads
 * `resolveViewer`. It renders the whole chain — Supabase session → Urdais account
 * → entitlement → access decision — so that signup, confirmation, session
 * persistence across a hard refresh, and sign-out can each be confirmed by a
 * person rather than inferred from a passing unit test.
 *
 * It is **not** a premium gate. It reads the access decision and prints it; it
 * does not withhold anything, and no premium data is loaded here. The premium
 * products are listed with their decision precisely to demonstrate the invariant
 * that matters most in this phase: a signed-in reader with no entitlement is
 * refused every one of them.
 *
 * Phase 4 should delete this page, or keep it as an operator diagnostic. It must
 * not become the account/profile surface.
 */
export const dynamic = "force-dynamic";

export default async function AuthStatusRoute() {
  const viewer = await resolveViewer();
  const authenticated = viewer.authentication.kind === "authenticated";
  const enforcementActive = isPremiumEnforcementActive();

  return (
    <AuthShell title="Session status">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        <dt className="text-neutral-400">Authentication</dt>
        <dd className="text-neutral-100">{authenticated ? "authenticated" : "anonymous"}</dd>

        {viewer.authentication.kind === "authenticated" ? (
          <>
            <dt className="text-neutral-400">Urdais account</dt>
            <dd className="font-mono text-xs break-all text-neutral-100">{viewer.authentication.accountId}</dd>

            <dt className="text-neutral-400">Email verified</dt>
            <dd className="text-neutral-100">{viewer.authentication.emailVerified ? "yes" : "no"}</dd>
          </>
        ) : null}

        <dt className="text-neutral-400">Premium entitlement</dt>
        <dd className="text-neutral-100">
          {viewer.premiumEntitlement
            ? `${viewer.premiumEntitlement.status} (source: ${viewer.premiumEntitlement.source})`
            : "none"}
        </dd>

        <dt className="text-neutral-400">Premium access</dt>
        <dd className="text-neutral-100">{hasPremiumEntitlement(viewer) ? "granted" : "denied"}</dd>
      </dl>

      <h2 className="mt-8 mb-2 text-sm font-medium text-neutral-200">Access decisions</h2>
      <ul className="flex flex-col gap-1 text-xs">
        {PREMIUM_PRODUCT_IDS.map((id) => {
          const decision = canAccess(viewer, id);
          return (
            <li key={id} className="flex justify-between gap-4 font-mono">
              <span className="text-neutral-400">{id}</span>
              <span className={decision.allowed ? "text-emerald-300" : "text-neutral-500"}>
                {decision.allowed ? "allowed" : decision.reason}
              </span>
            </li>
          );
        })}
      </ul>

      {/*
        Conditional, because this sentence is the one an operator reads when they
        want to know whether the paywall is on. It was written in Phase 3 as flat
        prose, when enforcement was permanently inactive and the claim was always
        true; live activation made it false while the gates themselves were working
        correctly. A diagnostic page that states the opposite of reality is worse
        than one that says nothing, and this is the page somebody checks precisely
        when they are unsure.
      */}
      <p className="mt-6 text-xs text-neutral-500">
        {enforcementActive ? (
          <>
            Premium enforcement is <span className="text-neutral-300">active</span>. These decisions are applied —
            Compute Economics, Power Analytics and the premium map layers require a subscription.
          </>
        ) : (
          <>
            Premium enforcement is not active. These decisions are reported, not applied — Compute Economics, Power
            Analytics and the premium map layers remain publicly readable until a subscription can be purchased.
          </>
        )}
      </p>

      {authenticated ? (
        <form action={signOutAction} className="mt-8">
          {/*
            No `returnTo` field: `safeReturnTo` refuses every `/auth/*`
            destination to avoid redirect loops, so passing this page's own path
            would be discarded for "/" regardless. Signing out lands on the home
            page.
          */}
          <button type="submit" className="rounded border border-white/15 px-3 py-2 text-sm text-neutral-200">
            Sign out
          </button>
        </form>
      ) : (
        <p className="mt-8 text-sm">
          <a className="underline" href="/access/login">
            Sign in
          </a>
        </p>
      )}
    </AuthShell>
  );
}
