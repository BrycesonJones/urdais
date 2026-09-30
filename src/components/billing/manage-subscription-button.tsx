"use client";

import { useActionState } from "react";

import { openBillingPortalAction } from "@/app/access/billing-actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * "Manage subscription" — a door to Stripe's own portal, not a UI Urdais built.
 *
 * There is deliberately no Urdais cancel button, no card form and no invoice list.
 * Each would be a second place where billing state is presented, and the one that
 * is wrong is always the one the customer read. Stripe hosts all of it and Urdais
 * hears the outcome through the webhook.
 *
 * A form rather than a link because creating a portal session is a side effect, and
 * the Customer it opens against is resolved from the session on the server.
 */
export function ManageSubscriptionButton({ returnTo }: { returnTo: string | null }) {
  const [state, formAction, pending] = useActionState(openBillingPortalAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-2" aria-describedby={failed ? "portal-error" : undefined}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md border border-white/15 px-4 py-2.5 text-sm text-neutral-200 transition-colors hover:bg-white/[0.06] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Opening…" : "Manage subscription"}
      </button>

      <p className="text-xs text-neutral-500">Billing, invoices and cancellation are handled by Stripe.</p>

      {failed ? (
        <p id="portal-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
