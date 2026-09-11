import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PowerAnalyticsPage } from "@/components/power-analytics/power-analytics-page";

export const metadata: Metadata = {
  title: "Power Analytics",
  description: "Whether the grid can deliver enough power, fast enough, to the Information Age: load, interconnection, transmission, buildout, and flexibility.",
};

/** The Power Analytics analytical market: not an index route, so it has no symbol. */
export default function PowerAnalyticsRoute() {
  return (
    <>
      <SiteHeader />
      <PowerAnalyticsPage />
      <SiteFooter />
    </>
  );
}
