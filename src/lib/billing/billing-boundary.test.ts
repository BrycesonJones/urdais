/**
 * What the billing layer must not be, asserted across the whole surface.
 *
 * A source scan rather than a set of unit tests, because these are absences: a
 * secret that must not reach a bundle, a card field that must not exist, an
 * entitlement write that must not appear outside the billing store. An absence
 * cannot be proven by testing one file.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function sourcesUnder(...relative: string[]): { file: string; source: string }[] {
  const files: { file: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      files.push({ file: path.relative(REPO_ROOT, full), source: readFileSync(full, "utf8") });
    }
  };
  for (const rel of relative) walk(path.join(REPO_ROOT, rel));
  return files;
}

const codeOf = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/**
 * Everything except this file, which necessarily contains every pattern it looks
 * for. Scanning itself would make each assertion fail on its own text.
 */
const ALL_SOURCES = sourcesUnder("src").filter(({ file }) => !file.endsWith("billing-boundary.test.ts"));

/** Non-test sources, for the absences that a test file legitimately spells out. */
const SHIPPED_SOURCES = ALL_SOURCES.filter(({ file }) => !/\.test\.tsx?$/.test(file));
const CLIENT_SOURCES = ALL_SOURCES.filter(({ source }) => /^\s*["']use client["']/m.test(source));

describe("the surface is large enough for these assertions to mean something", () => {
  it("scans the whole of src, and finds client components in it", () => {
    expect(ALL_SOURCES.length).toBeGreaterThan(100);
    expect(CLIENT_SOURCES.length).toBeGreaterThan(5);
  });
});

describe("the Stripe secret never reaches a browser", () => {
  it("is never read from a client component", async () => {
    for (const { file, source } of CLIENT_SOURCES) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/STRIPE_SECRET_KEY/);
      expect(code, file).not.toMatch(/STRIPE_WEBHOOK_SECRET/);
      // Not the SDK either: importing it into a client component would bundle it.
      expect(code, file).not.toMatch(/from\s+["']stripe["']/);
      expect(code, file).not.toMatch(/@\/lib\/billing\/(stripe|checkout|store|webhook|reconcile|customers)/);
    }
  });

  it("is never named with a NEXT_PUBLIC_ prefix anywhere", async () => {
    // A secret in a NEXT_PUBLIC_ variable is shipped to every browser that loads
    // Urdais, which is a total compromise rather than a misconfiguration.
    for (const { file, source } of SHIPPED_SOURCES) {
      expect(source, file).not.toMatch(/NEXT_PUBLIC_STRIPE_SECRET/);
      expect(source, file).not.toMatch(/NEXT_PUBLIC_[A-Z_]*WEBHOOK/);
    }
  });

  it("is not committed anywhere in the repository's source", async () => {
    // Real Stripe credentials are long and mix case with digits; the fixtures in
    // these tests are deliberately lowercase words. Requiring both an uppercase
    // letter and a digit keeps this sharp against an actual paste without firing on
    // a fixture. Test files are scanned too, because a real key pasted into one is
    // exactly as committed as anywhere else.
    //
    // The patterns are built from fragments for the same reason the fixtures are:
    // a literal key prefix here is itself a key-shaped string, and GitHub's push
    // protection cannot tell a detector from the thing it detects.
    const long = (n: number) => `(?=[A-Za-z0-9]{${n},})(?=[A-Za-z0-9]*[A-Z])(?=[A-Za-z0-9]*[0-9])[A-Za-z0-9]{${n},}`;
    const REAL_SECRET = new RegExp(`(?:sk|rk)_(?:${["te", "st"].join("")}|${["li", "ve"].join("")})_${long(24)}`);
    const REAL_WHSEC = new RegExp(`${["wh", "sec"].join("")}_${long(32)}`);
    for (const { file, source } of ALL_SOURCES) {
      expect(source, file).not.toMatch(REAL_SECRET);
      expect(source, file).not.toMatch(REAL_WHSEC);
    }
  });
});

describe("Urdais never handles a card", () => {
  it("renders no card, CVC or expiry field", async () => {
    for (const { file, source } of SHIPPED_SOURCES) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/name=["'](cardNumber|card_number|cvc|cvv|expiry|exp_month|exp_year)["']/i);
      expect(code, file).not.toMatch(/autoComplete=["']cc-(number|csc|exp)["']/i);
    }
  });

  it("loads no browser Stripe client", async () => {
    // Checkout is Stripe-hosted. @stripe/stripe-js would be a dependency, a bundle
    // and an attack surface added for nothing.
    // Code, not comments: `stripe.ts` names the package in prose precisely to
    // record that it is deliberately not a dependency.
    for (const { file, source } of SHIPPED_SOURCES) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/@stripe\/stripe-js/);
      expect(code, file).not.toMatch(/js\.stripe\.com/);
    }
  });
});

describe("only the billing store moves an entitlement", () => {
  it("is the one module that writes premium_entitlements", async () => {
    const writers = SHIPPED_SOURCES.filter(({ source }) =>
      /(insert into|update)\s+identity\.premium_entitlements/i.test(codeOf(source)),
    ).map(({ file }) => file);

    // One writer. A second would be a second policy, and the two would disagree
    // about who is entitled the first time either changed.
    expect(writers).toEqual(["src/lib/billing/store.ts"]);
  });

  it("keeps the read path unable to write", async () => {
    const store = ALL_SOURCES.find(({ file }) => file.endsWith("src/lib/access/entitlement-store.ts"));
    expect(store).toBeDefined();
    expect(codeOf(store!.source)).not.toMatch(/insert|update|delete/i);
  });
});

describe("the entitlement policy lives in one module", () => {
  it("is the only place that names the entitling statuses", async () => {
    const deciders = ALL_SOURCES.filter(({ file, source }) => {
      if (/subscription-state/.test(file)) return false;
      if (/\.test\.tsx?$/.test(file)) return false;
      return /["']trialing["']/.test(codeOf(source));
    }).map(({ file }) => file);

    // `trialing` is the tell: any module comparing against it is re-deciding the
    // policy. Reconciliation did exactly this once and was corrected.
    expect(deciders).toEqual([]);
  });
});

describe("checkout trusts nothing from the request", () => {
  it("reads no account, price, customer or subscription id from a form or query", async () => {
    for (const { file, source } of sourcesUnder("src/lib/billing")) {
      const code = codeOf(source);
      expect(code, file).not.toMatch(/formData\.get\(\s*["'](accountId|account_id|priceId|price_id|customerId|customer|subscriptionId|subscription)["']/);
      expect(code, file).not.toMatch(/searchParams\.get\(\s*["'](accountId|account_id|priceId|price_id|customer)["']/);
    }
  });

  it("reads only returnTo from the billing actions' form", async () => {
    const actions = ALL_SOURCES.find(({ file }) => file.endsWith("src/app/access/billing-actions.ts"));
    expect(actions).toBeDefined();
    const fields = [...codeOf(actions!.source).matchAll(/field\(formData,\s*["']([^"']+)["']\)/g)].map((m) => m[1]);
    expect([...new Set(fields)]).toEqual(["returnTo"]);
  });
});
