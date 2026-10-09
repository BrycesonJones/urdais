import { fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const track = vi.hoisted(() => vi.fn());
const identifyAccount = vi.hoisted(() => vi.fn());
const resetIdentity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics/client", () => ({ track, identifyAccount, resetIdentity }));
vi.mock("@/app/auth/actions", () => ({ signOutAction: vi.fn() }));

import { SignOutForm } from "@/components/account/sign-out-form";
import { AnalyticsIdentity } from "@/components/analytics/analytics-identity";
import { PremiumCtaLink } from "@/components/analytics/premium-cta-link";
import { TrackProductView } from "@/components/analytics/track-product-view";

beforeEach(() => {
  track.mockReset();
  identifyAccount.mockReset();
  resetIdentity.mockReset();
});

const eventsNamed = (name: string) => track.mock.calls.filter(([event]) => event === name);

describe("TrackProductView", () => {
  it("records product_viewed and the category event once, even under Strict Mode", () => {
    render(
      <StrictMode>
        <TrackProductView productId="market_ucpi" />
      </StrictMode>,
    );
    expect(eventsNamed("product_viewed")).toHaveLength(1);
    expect(eventsNamed("index_viewed")).toHaveLength(1);
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      product_id: "market_ucpi",
      product_name: "Urdais Compute Price Index",
      product_category: "index",
      access_tier: "public",
      locked: false,
    });
  });

  it("records a locked premium page as analytics_viewed with locked: true", () => {
    render(<TrackProductView productId="power_analytics" locked />);
    expect(eventsNamed("analytics_viewed")[0]?.[1]).toMatchObject({ access_tier: "premium", locked: true });
  });

  it("records the new product when a client-side navigation changes it", () => {
    const { rerender } = render(<TrackProductView productId="market_ucpi" />);
    rerender(<TrackProductView productId="market_utvi" />);
    expect(eventsNamed("product_viewed").map(([, properties]) => properties.product_id)).toEqual(["market_ucpi", "market_utvi"]);
  });

  it("records map_viewed for the map", () => {
    render(<TrackProductView productId="map" />);
    expect(eventsNamed("map_viewed")).toHaveLength(1);
  });
});

describe("PremiumCtaLink", () => {
  it("is still the same link, and records premium_cta_clicked on click", () => {
    render(
      <PremiumCtaLink href="/access?returnTo=%2Fmarkets%2Fpower-analytics" className="c" surface="page" productId="power_analytics">
        Get Full Access
      </PremiumCtaLink>,
    );
    const link = screen.getByRole("link", { name: "Get Full Access" });
    expect(link.getAttribute("href")).toBe("/access?returnTo=%2Fmarkets%2Fpower-analytics");
    fireEvent.click(link);
    expect(track).toHaveBeenCalledExactlyOnceWith(
      "premium_cta_clicked",
      expect.objectContaining({ product_id: "power_analytics", access_tier: "premium", cta_surface: "page" }),
    );
  });
});

describe("AnalyticsIdentity", () => {
  it("identifies with the account id the server resolved", () => {
    render(<AnalyticsIdentity accountId="acct_1" />);
    expect(identifyAccount).toHaveBeenCalledWith("acct_1");
    expect(resetIdentity).not.toHaveBeenCalled();
  });

  it("resets when the server found no session", () => {
    render(<AnalyticsIdentity accountId={null} />);
    expect(resetIdentity).toHaveBeenCalled();
    expect(identifyAccount).not.toHaveBeenCalled();
  });
});

describe("SignOutForm", () => {
  it("resets analytics identity when sign-out is submitted", () => {
    render(
      <SignOutForm>
        <button type="submit">Sign out</button>
      </SignOutForm>,
    );
    fireEvent.submit(screen.getByRole("button", { name: "Sign out" }).closest("form")!);
    expect(resetIdentity).toHaveBeenCalledOnce();
  });
});
