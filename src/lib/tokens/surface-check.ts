/**
 * Runtime check of the public surfaces.
 *
 * A phase was called complete while the Tokens page was blank, because every
 * check looked at the database and the tests, and none looked at what a person
 * actually sees. This closes that: given a running origin, it asks the API for
 * the benchmarks and then asks each public page whether those values are
 * present in what it served.
 *
 * It compares against the text a reader sees rather than raw markup. React
 * serializes a literal "$" beside an interpolated number as `$<!-- -->30.00`,
 * so matching the raw HTML would report a healthy page as blank. Comments and
 * tags are stripped first, then whitespace collapsed.
 */

export type SurfaceExpectation = {
  providerName: string;
  priceUsdPer1m: number;
};

export type SurfaceFinding = {
  code: "API_UNREACHABLE" | "API_EMPTY" | "API_SHAPE" | "PAGE_UNREACHABLE" | "PAGE_MISSING_VALUE" | "PAGE_SHOWS_PLACEHOLDER";
  detail: string;
  remedy: string;
};

/**
 * What a surface is expected to show.
 *
 *   value   the page renders the benchmark itself, server-side
 *   family  the page offers the Tokens family, which opens on Compute and
 *           switches client-side, so the price is not in the first response
 */
export type SurfaceExpectationKind = "value" | "family";

export type SurfacePage = { path: string; expects: SurfaceExpectationKind };

export const DEFAULT_TOKEN_SURFACES: readonly SurfacePage[] = [
  { path: "/markets/model-economics", expects: "value" },
  { path: "/markets/ucpi", expects: "family" },
];

export type SurfaceReport = {
  ok: boolean;
  origin: string;
  benchmarks: SurfaceExpectation[];
  pages: { path: string; expects: SurfaceExpectationKind; ok: boolean; missing: string[] }[];
  findings: SurfaceFinding[];
};

export type Fetcher = (url: string) => Promise<{ status: number; text: () => Promise<string> }>;

/** The product's own formatting, so the check asserts what a reader sees. */
export function formattedPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/** Copy that means the surface has nothing to show. Its presence is a failure. */
const PLACEHOLDERS = ["benchmark not yet defined", "No Token Price benchmark is available"];

/**
 * The visible text of a served page. Scripts and styles carry framework
 * payloads that would produce false passes, so they go first; then comments,
 * which is what splits "$" from "30.00"; then tags; then whitespace.
 */
export function visibleText(html: string): string {
  const withoutCode = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const withoutComments = withoutCode.replace(/<!--[\s\S]*?-->/g, "");
  const withoutTags = withoutComments.replace(/<[^>]+>/g, " ");
  return withoutTags.replace(/&amp;/g, "&").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
}

export async function checkTokenSurfaces(
  origin: string,
  fetcher: Fetcher,
  pages: readonly SurfacePage[] = DEFAULT_TOKEN_SURFACES,
): Promise<SurfaceReport> {
  const findings: SurfaceFinding[] = [];
  const base = origin.replace(/\/$/, "");

  let benchmarks: SurfaceExpectation[] = [];
  try {
    const response = await fetcher(`${base}/api/tokens/prices`);
    if (response.status !== 200) {
      findings.push({
        code: "API_UNREACHABLE",
        detail: `GET ${base}/api/tokens/prices returned ${response.status}`,
        remedy: "check that the deployment is running and can reach its database",
      });
    } else {
      const body = JSON.parse(await response.text()) as { benchmarks?: { providerName?: string; priceUsdPer1m?: number }[] };
      if (!Array.isArray(body.benchmarks)) {
        findings.push({ code: "API_SHAPE", detail: "the response carries no benchmarks array", remedy: "the API contract changed; reconcile it with the read model" });
      } else if (body.benchmarks.length === 0) {
        findings.push({
          code: "API_EMPTY",
          detail: "the API returned no benchmarks, so the public surfaces have nothing to show",
          remedy: "run npm run tokens:production:check against this deployment's database, and the operator verification if it reports rows missing",
        });
      } else {
        benchmarks = body.benchmarks.flatMap((row) =>
          typeof row.providerName === "string" && typeof row.priceUsdPer1m === "number"
            ? [{ providerName: row.providerName, priceUsdPer1m: row.priceUsdPer1m }]
            : [],
        );
      }
    }
  } catch (error) {
    findings.push({
      code: "API_UNREACHABLE",
      detail: `GET ${base}/api/tokens/prices failed: ${error instanceof Error ? error.message : String(error)}`,
      remedy: "check that the deployment is running",
    });
  }

  const pageReports: SurfaceReport["pages"] = [];
  for (const page of pages) {
    const { path, expects } = page;
    try {
      const response = await fetcher(`${base}${path}`);
      if (response.status !== 200) {
        findings.push({ code: "PAGE_UNREACHABLE", detail: `GET ${base}${path} returned ${response.status}`, remedy: "check that the deployment is serving this route" });
        pageReports.push({ path, expects, ok: false, missing: [] });
        continue;
      }
      const html = visibleText(await response.text());
      const placeholder = PLACEHOLDERS.find((text) => html.includes(text));
      if (placeholder) {
        findings.push({
          code: "PAGE_SHOWS_PLACEHOLDER",
          detail: `${path} is showing "${placeholder}" instead of a price`,
          remedy: "the surface has no benchmark to render; verify the deployment's database",
        });
      }

      const missing: string[] = [];
      if (expects === "value") {
        // Only the first benchmark needs to be on the page; the others sit behind the selector.
        const first = benchmarks[0];
        if (first) {
          if (!html.includes(first.providerName)) missing.push(first.providerName);
          if (!html.includes(formattedPrice(first.priceUsdPer1m))) missing.push(formattedPrice(first.priceUsdPer1m));
        }
      } else if (!html.includes("Tokens")) {
        // The market page opens on Compute and switches families client-side, so
        // the price is not in the first response. What must be there is the family.
        missing.push("Tokens family");
      }

      if (missing.length > 0) {
        findings.push({
          code: "PAGE_MISSING_VALUE",
          detail: `${path} does not render ${missing.join(" or ")}`,
          remedy:
            expects === "value"
              ? "the API has data the page is not showing; check the read path the page uses"
              : "the Tokens family is absent from the market page; check the family hydration on the server",
        });
      }
      pageReports.push({ path, expects, ok: missing.length === 0 && !placeholder, missing });
    } catch (error) {
      findings.push({ code: "PAGE_UNREACHABLE", detail: `GET ${base}${path} failed: ${error instanceof Error ? error.message : String(error)}`, remedy: "check that the deployment is running" });
      pageReports.push({ path, expects, ok: false, missing: [] });
    }
  }

  return { ok: findings.length === 0 && benchmarks.length > 0, origin: base, benchmarks, pages: pageReports, findings };
}
