import { beforeEach, describe, expect, it, vi } from "vitest";

const rememberPendingAudience = vi.hoisted(() => vi.fn());
const forgetPendingAudience = vi.hoisted(() => vi.fn());
const redirect = vi.hoisted(() => vi.fn((href: string) => { throw new Error(`NEXT_REDIRECT:${href}`); }));

vi.mock("@/lib/onboarding/pending-audience", () => ({
  AudienceStateUnavailableError: class AudienceStateUnavailableError extends Error {},
  rememberPendingAudience,
  forgetPendingAudience,
}));
vi.mock("next/navigation", () => ({ redirect }));

import {
  continueWithAudienceAction,
  IDLE_AUDIENCE_STATE,
  skipAudienceAction,
} from "@/app/access/audience/actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  rememberPendingAudience.mockReset();
  forgetPendingAudience.mockReset();
  redirect.mockClear();
});

describe("audience classification actions", () => {
  it("remembers an allowed choice and carries the validated destination", async () => {
    await expect(continueWithAudienceAction(IDLE_AUDIENCE_STATE, form({
      primaryRole: "energy_power_market_professional",
      returnTo: "/markets/power-analytics",
    }))).rejects.toThrow(`NEXT_REDIRECT:/access?returnTo=${encodeURIComponent("/markets/power-analytics")}`);
    expect(rememberPendingAudience).toHaveBeenCalledWith("energy_power_market_professional");
  });

  it("rejects an invented category", async () => {
    const state = await continueWithAudienceAction(IDLE_AUDIENCE_STATE, form({ primaryRole: "site_admin" }));
    expect(state.status).toBe("error");
    expect(rememberPendingAudience).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("allows a blank choice without fabricating a default", async () => {
    await expect(continueWithAudienceAction(IDLE_AUDIENCE_STATE, form({ primaryRole: "" }))).rejects.toThrow("NEXT_REDIRECT:/access");
    expect(forgetPendingAudience).toHaveBeenCalledOnce();
    expect(rememberPendingAudience).not.toHaveBeenCalled();
  });

  it("skip clears only pending state and proceeds", async () => {
    await expect(skipAudienceAction(form({ returnTo: "/markets/compute-analytics" }))).rejects.toThrow(
      `NEXT_REDIRECT:/access?returnTo=${encodeURIComponent("/markets/compute-analytics")}`,
    );
    expect(forgetPendingAudience).toHaveBeenCalledOnce();
  });

  it("drops an external or looping destination", async () => {
    for (const hostile of ["https://evil.test", "/access/discover", "/auth/sign-in"]) {
      redirect.mockClear();
      await expect(skipAudienceAction(form({ returnTo: hostile }))).rejects.toThrow("NEXT_REDIRECT:/access");
    }
  });
});

