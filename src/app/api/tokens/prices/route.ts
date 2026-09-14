import { loadTokenReadCatalog, visibleTokenBenchmarks } from "@/lib/tokens/read/load";
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
 */
export async function GET(): Promise<Response> {
  const benchmarks = visibleTokenBenchmarks(await loadTokenReadCatalog());
  const reasons = benchmarks.flatMap((row) => validatePublicTokenBenchmark(JSON.parse(JSON.stringify(row)) as unknown));
  if (reasons.length > 0) return new Response(null, { status: 500 });
  return Response.json({ benchmarks });
}
