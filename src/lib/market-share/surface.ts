/**
 * Server-only loading of the Market Share section for the Model Economics page.
 *
 * Fails soft and says nothing rather than something wrong, exactly as the UTVI surface does: an
 * unconfigured deployment, an unreachable database, a view that fails its own contract, or a
 * date whose decomposition does not reconcile all produce `null`, and the section then states
 * that no shares are published.
 *
 * The reconciliation check runs here and not only in the report script. A share table that does
 * not add up is the one output worth refusing outright — every row of it looks plausible, so
 * nothing downstream would catch it, and a reader would have no way to tell.
 */

import { checkDerivation } from "@/lib/market-share/checks";
import { loadLatestShare } from "@/lib/market-share/load";
import { buildMarketShareView, validateMarketShareView, type MarketShareView } from "@/lib/market-share/view";
import { createTokenSqlExecutor } from "@/lib/tokens/read/database";

export async function loadMarketShareView(): Promise<MarketShareView | null> {
  const databaseUrl = (process.env.DATABASE_URL ?? process.env.URDAIS_DATABASE_URL ?? "").trim();
  if (!databaseUrl) {
    console.info("market share: no DATABASE_URL is configured; the section reports no published shares");
    return null;
  }

  let sql: Awaited<ReturnType<typeof createTokenSqlExecutor>> | null = null;
  try {
    sql = await createTokenSqlExecutor(databaseUrl);
    const share = await loadLatestShare(sql);

    if (share !== null) {
      const failures = checkDerivation(share.derivation);
      if (failures.length > 0) {
        console.error(
          `market share: ${share.derivation.date} failed reconciliation ` +
            `(${failures.map((failure) => `${failure.check}: ${failure.detail}`).join("; ")})`,
        );
        return null;
      }
    }

    const { view, unavailableReason } = buildMarketShareView(share);
    if (view === null) {
      console.info(`market share: no shares served (${unavailableReason})`);
      return null;
    }

    const reasons = validateMarketShareView(JSON.parse(JSON.stringify(view)) as unknown);
    if (reasons.length > 0) {
      console.error(`market share: view failed its own contract (${reasons.join("; ")})`);
      return null;
    }
    return view;
  } catch (error) {
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`market share: load failed (${detail})`);
    return null;
  } finally {
    await sql?.end();
  }
}
