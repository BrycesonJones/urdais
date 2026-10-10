/**
 * The privacy policy's publication state.
 *
 * The policy at `/privacy` is a **draft** until the open items it marks — legal
 * entity, privacy contact, retention periods, provider settings — are confirmed
 * and someone decides to publish it. While it is a draft:
 *
 * - production answers `/privacy` with a 404, so an unfinished policy is never
 *   presented as Urdais's policy;
 * - preview deployments and local builds render it, marked as a draft and
 *   `noindex`, so it can be reviewed;
 * - nothing links to it: not the footer, not the consent panel.
 *
 * Publishing is this one constant plus the effective date below. See
 * docs/architecture/analytics.md and the PR that introduced the draft.
 */

export type PrivacyPolicyStatus = "draft" | "published";

export const PRIVACY_POLICY_STATUS: PrivacyPolicyStatus = "draft";

/** Set when the policy is published. Null while it is a draft. */
export const PRIVACY_POLICY_EFFECTIVE_DATE: string | null = null;

export const PRIVACY_POLICY_HREF = "/privacy";

/** Whether anything may link to the policy. Only once it is published. */
export function privacyPolicyLinked(status: PrivacyPolicyStatus = PRIVACY_POLICY_STATUS): boolean {
  return status === "published";
}

/**
 * Whether `/privacy` renders for this deployment: always once published; while a
 * draft, everywhere except Vercel Production.
 */
export function privacyPolicyViewable(
  status: PrivacyPolicyStatus = PRIVACY_POLICY_STATUS,
  vercelEnv: string | undefined = process.env.VERCEL_ENV,
): boolean {
  if (status === "published") return true;
  return (vercelEnv ?? "").trim().toLowerCase() !== "production";
}
