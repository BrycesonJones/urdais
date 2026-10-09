"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import type { GateSurface } from "@/lib/access/gate-copy";
import type { UrdaisProductId } from "@/lib/access/products";
import { track } from "@/lib/analytics/client";
import { ANALYTICS_EVENTS, productProperties } from "@/lib/analytics/events";

/**
 * A premium gate's "Get Full Access" link, recording `premium_cta_clicked`.
 *
 * Still an ordinary link: the event is fire-and-forget on click and never delays or
 * prevents the navigation. `surface` says which gate it was (`page` or
 * `map_layer`); `productId`, when known, which product the reader wanted.
 */
export function PremiumCtaLink({
  href,
  className,
  surface,
  productId,
  children,
}: {
  href: string;
  className: string;
  surface: GateSurface;
  productId?: UrdaisProductId;
  children: ReactNode;
}) {
  function handleClick() {
    const product = productId ? productProperties(productId) : null;
    track(ANALYTICS_EVENTS.premiumCtaClicked, {
      ...(product ?? {}),
      cta_surface: surface,
      source_page: window.location.pathname,
    });
  }

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
