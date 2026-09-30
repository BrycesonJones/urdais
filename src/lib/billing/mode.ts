/**
 * Which Stripe environment this deployment is allowed to talk to.
 *
 * ## The failure this module exists to prevent
 *
 * Two of them, in opposite directions, and both are worse than an outage:
 *
 *   - **production running on test keys** would sell subscriptions that do not
 *     exist. Readers would complete Checkout, be charged nothing, and Urdais
 *     would hand out premium against a Stripe object in a sandbox.
 *   - **development running on live keys** would charge real cards during a
 *     browser test.
 *
 * Neither is caught by "is a key present". Both are caught by asking whether the
 * key's *mode* is the one this deployment is permitted to use, so that is the
 * question asked here, and a mismatch is `unavailable` rather than an error —
 * fail closed, because the safe direction is selling nothing.
 *
 * ## Why the key's prefix is the authority
 *
 * Stripe encodes the mode in the secret itself: `sk_test_…` and `sk_live_…`.
 * That cannot drift from the credential the way a separate `STRIPE_MODE=test`
 * variable can, and a wrong separate flag is exactly how the first failure above
 * happens. The prefix is read; nothing else is trusted.
 */

/** The two Stripe environments. There is no third. */
export type StripeMode = "test" | "live";

/** Where this build is running, which decides the mode it may use. */
export type DeploymentEnvironment = "production" | "preview" | "development";

export type ProcessEnvLike = Record<string, string | undefined>;

export const STRIPE_SECRET_KEY_VAR = "STRIPE_SECRET_KEY";
export const STRIPE_WEBHOOK_SECRET_VAR = "STRIPE_WEBHOOK_SECRET";
export const STRIPE_PREMIUM_PRICE_ID_VAR = "STRIPE_PREMIUM_PRICE_ID";

/**
 * The mode a Stripe secret or restricted key names, or `null` if it names neither.
 *
 * `null` for anything unrecognised rather than a guess: an unparseable credential
 * must not default to either mode.
 */
export function stripeModeOfKey(key: string | undefined): StripeMode | null {
  const value = (key ?? "").trim();
  if (value.startsWith("sk_test_") || value.startsWith("rk_test_")) return "test";
  if (value.startsWith("sk_live_") || value.startsWith("rk_live_")) return "live";
  return null;
}

/**
 * Where this build is running.
 *
 * `VERCEL_ENV` is the authority when present because it is set by the platform
 * and distinguishes a preview from production, which `NODE_ENV` cannot: a preview
 * deployment is `NODE_ENV=production` while being emphatically not production.
 * Treating a preview as production would demand live keys on every branch build.
 */
export function deploymentEnvironment(env: ProcessEnvLike = process.env): DeploymentEnvironment {
  const vercel = (env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercel === "production") return "production";
  if (vercel === "preview") return "preview";
  if (vercel === "development") return "development";
  // No platform signal. Only an explicit production NODE_ENV counts, and a local
  // `next build` is the case this is deliberately conservative about.
  return (env.NODE_ENV ?? "").trim().toLowerCase() === "production" ? "production" : "development";
}

/** The one Stripe mode a deployment of this kind may use. */
export function requiredStripeMode(environment: DeploymentEnvironment): StripeMode {
  return environment === "production" ? "live" : "test";
}

export type BillingAvailability =
  | {
      readonly kind: "available";
      readonly mode: StripeMode;
      readonly environment: DeploymentEnvironment;
      readonly secretKey: string;
      readonly priceId: string;
    }
  | {
      readonly kind: "unavailable";
      readonly environment: DeploymentEnvironment;
      readonly reason:
        | "not_configured"
        | "unreadable_key"
        | "mode_mismatch"
        | "price_not_configured";
    };

/**
 * Whether this deployment may create Stripe objects, and with which mode.
 *
 * Read on every path that would touch Stripe, not once at boot: the answer is a
 * property of the environment, and a module-level constant computed at import
 * time is a value that can be stale in a long-lived serverless process.
 *
 * **`unavailable` is a normal answer, not an error.** Production today has no
 * live credentials, so the subscription offer must render as "not purchasable
 * yet" rather than throwing — which is what keeps merging this phase from
 * changing what a production reader can do.
 */
export function billingAvailability(env: ProcessEnvLike = process.env): BillingAvailability {
  const environment = deploymentEnvironment(env);
  const secretKey = (env[STRIPE_SECRET_KEY_VAR] ?? "").trim();
  const priceId = (env[STRIPE_PREMIUM_PRICE_ID_VAR] ?? "").trim();

  if (secretKey === "") return { kind: "unavailable", environment, reason: "not_configured" };

  const mode = stripeModeOfKey(secretKey);
  if (mode === null) return { kind: "unavailable", environment, reason: "unreadable_key" };

  // The whole point of the module.
  if (mode !== requiredStripeMode(environment)) {
    return { kind: "unavailable", environment, reason: "mode_mismatch" };
  }

  if (priceId === "") return { kind: "unavailable", environment, reason: "price_not_configured" };

  return { kind: "available", mode, environment, secretKey, priceId };
}

/**
 * Whether a Stripe object's own `livemode` is the one this deployment expects.
 *
 * Checked on webhook payloads as well as on objects Urdais creates. A live event
 * delivered to a test deployment (or the reverse) is a misconfiguration
 * somewhere else, and processing it would write billing state derived from the
 * wrong Stripe account.
 */
export function livemodeMatches(livemode: boolean, mode: StripeMode): boolean {
  return livemode === (mode === "live");
}

/** An operator-facing sentence for a refusal. Never contains a credential. */
export function describeUnavailability(availability: BillingAvailability): string {
  if (availability.kind === "available") return "billing is available";
  const where = availability.environment;
  switch (availability.reason) {
    case "not_configured":
      return `no ${STRIPE_SECRET_KEY_VAR} is set for the ${where} environment`;
    case "unreadable_key":
      return `${STRIPE_SECRET_KEY_VAR} is not a recognisable Stripe secret key`;
    case "mode_mismatch":
      return `the ${where} environment requires a ${requiredStripeMode(where)}-mode Stripe key and the configured key is the other mode`;
    case "price_not_configured":
      return `no ${STRIPE_PREMIUM_PRICE_ID_VAR} is set for the ${where} environment`;
  }
}
