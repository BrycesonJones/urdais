"use client";

import { useActionState } from "react";

import { startCheckoutAction } from "@/app/access/billing-actions";
import { IDLE_AUTH_STATE } from "@/app/auth/form-state";

/**
 * The one control that begins a purchase.
 *
 * A real submit, not a link: starting Checkout creates a Stripe object, which is a
 * side effect and belongs behind a POST. There is no Stripe.js here and no card
 * field — the action redirects to Stripe-hosted Checkout, so Urdais never sees a
 * card number and has no PCI surface to reason about.
 *
 * `pending` disables it, because a double-click on a payment control is how someone
 * ends up looking at two Checkout sessions.
 */
export function SubscribeButton({ returnTo, label = "Continue to Checkout" }: { returnTo: string | null; label?: string }) {
  const [state, formAction, pending] = useActionState(startCheckoutAction, IDLE_AUTH_STATE);
  const failed = state.status === "error";

  return (
    <form action={formAction} className="flex flex-col gap-3" aria-describedby={failed ? "checkout-error" : undefined}>
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}

      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className="rounded-md bg-[#526fe0] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#6480e8] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8ca4ff]"
      >
        {pending ? "Opening Checkout…" : label}
      </button>

      <p className="text-xs text-neutral-500">
        Payment is handled by Stripe. Urdais never sees your card details.
      </p>

      {failed ? (
        <p id="checkout-error" role="alert" className="text-sm text-red-300">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
