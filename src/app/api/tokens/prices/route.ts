import { loadVisibleTokenBenchmarks } from "@/lib/tokens/read/load";
import { validatePublicTokenBenchmark } from "@/lib/tokens/read/api-contract";

/**
 * The public Tokens product surface: the Urdais Token Price benchmark, one
 * row per provider, under docs/methodology/token-price.md.
 *
 * Raw model-level facets (input, output, cache, service tier, context tier,
 * region) are the machinery behind the benchmark, not the product, and are
 * not exposed here. They stay internal for calculation and developer
 * verification. Production remains `{ benchmarks: [] }` until observations
 * satisfy publication policy; development may return Wave-1 research-preview
 * values from the local database.
 *
 * Served from the same read path as the market pages: frozen rows in
 * `pipeline.token_price_benchmarks` are the record, and the calculator is only
 * the fallback where nothing has been frozen. Recalculating here instead would
 * re-derive each point's methodology version from its date -- relabelling a
 * 1.1 row frozen on 14 September as 1.2, the latest version sharing that date --
 * and would let a corrected raw leg move a published value the page still
 * shows frozen.
 */
export async function GET(): Promise<Response> {
  const { benchmarks } = await loadVisibleTokenBenchmarks();
  const reasons = benchmarks.flatMap((row) => validatePublicTokenBenchmark(JSON.parse(JSON.stringify(row)) as unknown));
  if (reasons.length > 0) return new Response(null, { status: 500 });
  return Response.json({ benchmarks });
}
