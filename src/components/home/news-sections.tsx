import { NewsRail } from "@/components/news/news-rail";
import { loadComputeNews } from "@/lib/news/read/load";
import { getMockNewsByCategory } from "@/data/mock/news";
import { HOMEPAGE_NEWS_CATEGORIES } from "@/types/news";

/**
 * The Information Age news rails beneath Information Markets.
 *
 * Which categories appear is `HOMEPAGE_NEWS_CATEGORIES`, a presentation
 * decision held in one place rather than as conditions scattered here. The
 * taxonomy behind it is unchanged: Memory, Photonics and AI Chips are hidden
 * from this surface, not removed from Urdais.
 *
 * Compute is production-backed: its stories come from the approved feeds in
 * reference.news_sources by way of pipeline.news_articles, and if that store
 * cannot be read the rail says so rather than quietly showing invented
 * content. The rest still render mock data and are labelled as such. The
 * boundary between the two is the accessor each rail is given, so migrating
 * one changes this file and nothing else.
 */
export async function NewsSections() {
  const compute = await loadComputeNews();

  return (
    <div className="bg-[#0a0a0a] px-4 pb-20 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-12">
        {HOMEPAGE_NEWS_CATEGORIES.map((category) =>
          category.id === "compute" ? (
            <NewsRail
              key={category.id}
              title={category.label}
              articles={compute.articles}
              provenance="production"
              emptyMessage={
                compute.available
                  ? "No Compute stories have been ingested yet."
                  : "Compute news is unavailable right now."
              }
            />
          ) : (
            <NewsRail
              key={category.id}
              title={category.label}
              articles={getMockNewsByCategory(category.id)}
              provenance="demo"
            />
          ),
        )}
      </div>
    </div>
  );
}
