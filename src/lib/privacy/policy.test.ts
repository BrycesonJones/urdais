import { describe, expect, it } from "vitest";

import { PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_STATUS, privacyPolicyLinked, privacyPolicyViewable } from "@/lib/privacy/policy";

describe("privacy policy publication gate", () => {
  it("is a draft with no effective date until someone publishes it", () => {
    // Publishing is a deliberate edit to both constants; this fails loudly if one moves without the other.
    expect(PRIVACY_POLICY_STATUS === "published").toBe(PRIVACY_POLICY_EFFECTIVE_DATE !== null);
  });

  it("a draft is never linked, and never served by Vercel Production", () => {
    expect(privacyPolicyLinked("draft")).toBe(false);
    expect(privacyPolicyViewable("draft", "production")).toBe(false);
    expect(privacyPolicyViewable("draft", " Production ")).toBe(false);
  });

  it("a draft is viewable on previews and local builds, for review", () => {
    expect(privacyPolicyViewable("draft", "preview")).toBe(true);
    expect(privacyPolicyViewable("draft", "development")).toBe(true);
    expect(privacyPolicyViewable("draft", undefined)).toBe(true);
  });

  it("a published policy is linked and served everywhere", () => {
    expect(privacyPolicyLinked("published")).toBe(true);
    expect(privacyPolicyViewable("published", "production")).toBe(true);
  });
});
