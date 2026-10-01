import { redirect } from "next/navigation";

import { ACCOUNT_HREF } from "@/lib/routes";

export const dynamic = "force-dynamic";

/**
 * `/account/subscription` — retired in Phase 7C.
 *
 * Phase 7B's placeholder for subscription management. Management now starts on
 * `/account` itself: "Manage subscription" / "Manage billing" is a form that opens
 * Stripe's hosted Customer Portal, and the Portal returns to `/account`. This page
 * added nothing to that journey, so it only carries an old link to the account.
 *
 * Deliberately a redirect and not a Portal launcher: creating a Portal session is a
 * side effect, and a GET that performed one could be triggered by a prefetch, a
 * crawler or a link in an email.
 */
export default function RetiredManageSubscriptionRoute() {
  redirect(ACCOUNT_HREF);
}
