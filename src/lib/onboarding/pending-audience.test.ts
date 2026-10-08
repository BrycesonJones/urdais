import { describe, expect, it } from "vitest";

import { AUDIENCE_ROLES } from "@/lib/onboarding/audience";
import { decodePendingAudience, encodePendingAudience } from "@/lib/onboarding/pending-audience";

const SECRET = "test-secret-that-is-longer-than-thirty-two-characters";
const NOW = 1_800_000_000;

describe("signed audience onboarding state", () => {
  it("round-trips every allowed category", () => {
    for (const { value } of AUDIENCE_ROLES) {
      expect(decodePendingAudience(encodePendingAudience(value, NOW, SECRET), SECRET, NOW)).toBe(value);
    }
  });

  it("rejects tampering and a signature from another deployment", () => {
    const encoded = encodePendingAudience("frontier_ai_lab", NOW, SECRET);
    expect(decodePendingAudience(`${encoded}x`, SECRET, NOW)).toBeNull();
    expect(decodePendingAudience(encoded, `${SECRET}-other`, NOW)).toBeNull();
  });

  it("expires after thirty minutes and refuses implausible future state", () => {
    const encoded = encodePendingAudience("other", NOW, SECRET);
    expect(decodePendingAudience(encoded, SECRET, NOW + 30 * 60)).toBe("other");
    expect(decodePendingAudience(encoded, SECRET, NOW + 30 * 60 + 1)).toBeNull();
    // Sixty seconds of clock skew is tolerated; anything later is refused.
    expect(decodePendingAudience(encodePendingAudience("other", NOW + 60, SECRET), SECRET, NOW)).toBe("other");
    expect(decodePendingAudience(encodePendingAudience("other", NOW + 61, SECRET), SECRET, NOW)).toBeNull();
    expect(decodePendingAudience(encodePendingAudience("other", NOW + 365 * 86400, SECRET), SECRET, NOW)).toBeNull();
  });

  it("carries no account or authentication identifier", () => {
    const encoded = encodePendingAudience("academic_university", NOW, SECRET);
    expect(encoded).not.toContain("account");
    expect(encoded).not.toContain("email");
    expect(encoded).not.toContain("subject");
  });
});

