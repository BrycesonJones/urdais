import { NewsRail } from "@/components/news/news-rail";
import { loadComputeNews } from "@/lib/news/read/load";
import { getMockNewsByCategory } from "@/data/mock/news";
import { NEWS_CATEGORIES } from "@/types/news";

/**
 * The six Information Age news rails beneath Information Markets.
 *
 * Compute is production-backed: its stories come from the approved feeds in
 * reference.news_sources by way of pipeline.news_articles, and if that store
 * cannot be read the rail says so rather than quietly showing invented
 * content. The other five still render mock data and are labelled as such.
 * Their ingestion is a later phase; the boundary between the two is the
 * accessor each rail is given, so migrating one changes this file and nothing
 * else.
 */
export async function NewsSections() {
  const compute = await loadComputeNews();

  return (
    <div className="bg-[#0a0a0a] px-4 pb-20 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-12">
        {NEWS_CATEGORIES.map((category) =>
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
