/**
 * Operator tool: erase one Urdais account's analytics from PostHog.
 *
 *   npm run analytics:erase -- --account <account uuid>            # dry run
 *   npm run analytics:erase -- --account <account uuid> --execute  # sends it
 *
 * Needs, in the shell only (never committed, never NEXT_PUBLIC_):
 *   POSTHOG_PERSONAL_API_KEY   phx_… with the person:write scope
 *   POSTHOG_PROJECT_ID         the numeric project id
 *   NEXT_PUBLIC_POSTHOG_HOST   the project's ingestion host (us./eu.i.posthog.com)
 *
 * Account deletion erases automatically (src/lib/account/analytics-erasure.ts).
 * This tool is for erasing analytics WITHOUT deleting the account, or for checking
 * a held deletion by hand. See docs/operations/posthog-activation.md § Account
 * deletion and analytics.
 */

import { erasePostHogPerson, erasureConfig, erasureRequest } from "@/lib/analytics/erasure";

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const accountId = argv[argv.indexOf("--account") + 1] ?? "";
  const execute = argv.includes("--execute");
  if (!argv.includes("--account") || accountId.startsWith("--")) {
    console.error("usage: npm run analytics:erase -- --account <account uuid> [--execute]");
    return 2;
  }

  const config = erasureConfig();
  if ("missing" in config) {
    console.error(`not configured; missing or malformed: ${config.missing.join(", ")}`);
    return 2;
  }

  const request = erasureRequest(config, accountId);
  if (!execute) {
    console.log("dry run — nothing sent. Would POST:");
    console.log(`  ${request.url}`);
    console.log(`  ${JSON.stringify(request.body)}`);
    console.log("re-run with --execute to send it.");
    return 0;
  }

  const outcome = await erasePostHogPerson(accountId, config);
  if (outcome.kind === "queued") {
    console.log(`queued: ${outcome.personsFound} person(s) found; events deletion queued by PostHog (asynchronous).`);
    return outcome.personsFound > 0 ? 0 : 1;
  }
  console.error(`failed: ${outcome.kind === "failed" ? `status ${outcome.status ?? "none (network or invalid id)"}` : outcome.kind}`);
  return 1;
}

main().then((code) => process.exit(code));
