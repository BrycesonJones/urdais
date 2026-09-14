/**
 * Read-only listed GPU HTTP handlers. Thin JSON around the canonical view
 * and the public series-point contract. Unknown ids are 404; nothing here
 * writes, publishes, or invents history.
 */

import { validatePublicResponseShape } from "@/lib/ucpi/api-contract";
import {
  getListedMarketView,
  getListedSeries,
  listListedMarketViews,
  resolveListedSymbol,
  type ListedMarketReadOptions,
} from "@/lib/ucpi/read/listed-markets";
import { validateListedMarketView } from "@/lib/ucpi/read/listed-view";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function assertView(body: unknown, symbol: string): void {
  const reasons = validateListedMarketView(body);
  if (reasons.length > 0) throw new Error(`${symbol}: listed view is not publishable: ${reasons.join(", ")}`);
}

export async function handleListedInstruments(options: ListedMarketReadOptions): Promise<Response> {
  const instruments = await listListedMarketViews(options);
  for (const instrument of instruments) assertView(JSON.parse(JSON.stringify(instrument)), instrument.symbol);
  return json({ instruments });
}

export async function handleListedInstrument(id: string, options: ListedMarketReadOptions): Promise<Response> {
  const symbol = resolveListedSymbol(id);
  if (!symbol) return json({ error: "not_found" }, 404);
  const instrument = await getListedMarketView(symbol, options);
  if (!instrument) return json({ error: "not_found" }, 404);
  assertView(JSON.parse(JSON.stringify(instrument)), instrument.symbol);
  return json({ instrument });
}

export async function handleListedSeries(id: string, options: ListedMarketReadOptions): Promise<Response> {
  const symbol = resolveListedSymbol(id);
  if (!symbol) return json({ error: "not_found" }, 404);
  const points = options.persistence ? ((await getListedSeries(symbol, options.persistence)) ?? []) : options.loadSeries ? await options.loadSeries(symbol) : [];
  for (const point of points) {
    const reasons = validatePublicResponseShape(JSON.parse(JSON.stringify(point)) as unknown);
    if (reasons.length > 0) throw new Error(`${symbol}: series point is not publishable: ${reasons.join(", ")}`);
  }
  return json({ instrument: symbol, points });
}
