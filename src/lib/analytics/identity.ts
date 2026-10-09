import type { Viewer } from "@/lib/access/entitlement";

/**
 * The analytics distinct id for a server-resolved viewer: the Urdais account id,
 * or null for an anonymous reader. Only the id crosses to the browser — not the
 * email, not the entitlement.
 */
export function analyticsAccountId(viewer: Viewer): string | null {
  return viewer.authentication.kind === "authenticated" ? viewer.authentication.accountId : null;
}
