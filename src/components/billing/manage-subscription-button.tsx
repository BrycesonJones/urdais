"use client";

import { useActionState } from "react";

import { openBillingPortalAction } from "@/app/access/billing-actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * "Manage subscription" / "Manage billing" — a door to Stripe's own portal, not a
 * UI Urdais built. Rendered on `/account`, the one place billing is managed from.
 *
 * There is deliberately no Urdais cancel button, no card form and no invoice list.
 * Each would be a second place where billing state is presented, and the one that
 * is wrong is always the one the customer read. Stripe hosts all of it and Urdais
 * hears the outcome through the webhook.
 *
 * A form rather than a link because creating a portal session is a side effect, and
 * the Customer it opens against is resolved from the session on the server. The
 * form carries no fields at all: nothing in it could name a Customer or a return.
 */
export function ManageSubscriptionButton({ label }: { label: "Manage subscription" | "Manage billing" }) {
  const [state, formAction, pending] = useActionState(openBillingPortalAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-2" aria-describedby={failed ? "portal-error" : undefined}>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="self-start rounded-md border border-white/15 px-4 py-2 text-sm text-neutral-100 transition-colors hover:bg-white/[0.06] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Opening…" : label}
      </button>

      <p className="text-xs text-neutral-500">
        Opens Stripe&rsquo;s secure billing management. Changes can take a moment to appear here.
      </p>

      {failed ? (
        <p id="portal-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
