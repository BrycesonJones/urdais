import type { Metadata } from "next";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { PowerAnalyticsPage } from "@/components/power-analytics/power-analytics-page";
import { loadQueueAnalytics, unavailableQueueAnalytics } from "@/lib/interconnection-queue/analytics/read";
import { loadDeliveryGapReadModel, unconfiguredDeliveryGapReadModel } from "@/lib/power-delivery/gap/read";
import { loadTransmissionAnalytics, unavailableTransmissionModel } from "@/lib/transmission-headroom/analytics/read";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export const metadata: Metadata = {
  title: "Power Analytics",
  description: "Whether the grid can deliver enough power, fast enough, to the Information Age: load, interconnection, transmission, buildout, and flexibility.",
};

// The delivery gap and interconnection queue sections read the database on every request, so the
// page is never statically cached with one calculation's numbers baked into it.
export const dynamic = "force-dynamic";

/** The Power Analytics analytical market: not an index route, so it has no symbol. */
export default async function PowerAnalyticsRoute() {
  // The delivery gap is read server-side. The subtraction happened in PostgreSQL when the gap was
  // calculated; nothing about it is computed in a browser, and a failed read degrades to the
  // not-initialized model rather than to an error page.
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  let gap = unconfiguredDeliveryGapReadModel();
  let queue = unavailableQueueAnalytics();
  let headroom = unavailableTransmissionModel();
  if (databaseUrl) {
    const sql = await createTokenSqlExecutor(databaseUrl);
    try {
      gap = await loadDeliveryGapReadModel(sql);
    } catch (error) {
      console.error(`power analytics: delivery gap read failed (${error instanceof Error ? error.message : String(error)})`);
    }
    try {
      // Publishable results only: the read model filters blocked markets in SQL, so nothing a
      // publisher forbids can reach a rendered prop.
      queue = await loadQueueAnalytics(sql);
    } catch (error) {
      console.error(`power analytics: interconnection queue read failed (${error instanceof Error ? error.message : String(error)})`);
    }
    try {
      // Same discipline: the rights gate and the publication filter are in SQL, so a blocked or
      // deferred result cannot reach a rendered prop.
      headroom = await loadTransmissionAnalytics(sql);
    } catch (error) {
      console.error(`power analytics: transmission headroom read failed (${error instanceof Error ? error.message : String(error)})`);
    } finally {
      await sql.end();
    }
  }

  return (
    <>
      <SiteHeader />
      <PowerAnalyticsPage gap={gap} queue={queue} headroom={headroom} />
      <SiteFooter />
    </>
  );
}
