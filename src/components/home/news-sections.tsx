import { NewsRail } from "@/components/news/news-rail";
import { loadNewsRail, type NewsRailData } from "@/lib/news/read/load";
import { productionNewsCategories } from "@/lib/news/sources";
import { getMockNewsByCategory } from "@/data/mock/news";
import { HOMEPAGE_NEWS_CATEGORIES } from "@/types/news";

/**
 * The Information Age news rails beneath Information Markets.
 *
 * Which categories appear is `HOMEPAGE_NEWS_CATEGORIES`, a presentation
 * decision held in one place rather than as conditions scattered here. The
 * taxonomy behind it is unchanged: the categories missing from this surface are
 * hidden from it, not removed from Urdais.
 *
 * Which of those are production-backed is asked of the source registry rather
 * than named here, so migrating a category is adding its source definitions
 * and nothing else. A production rail's stories come from the approved feeds in
 * reference.news_sources by way of pipeline.news_articles, and if that store
 * cannot be read the rail says so rather than quietly showing invented content.
 * The rest render mock data and are labelled as such.
 */
export async function NewsSections() {
  const production = new Set<string>(productionNewsCategories());
  const live = new Map<string, NewsRailData>(
    await Promise.all(
      HOMEPAGE_NEWS_CATEGORIES.filter((category) => production.has(category.id)).map(
        async (category) => [category.id, await loadNewsRail(category.id)] as const,
      ),
    ),
  );

  return (
    <div className="bg-[#0a0a0a] px-4 pb-20 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-12">
        {HOMEPAGE_NEWS_CATEGORIES.map((category) => {
          const data = live.get(category.id);
          if (!data) {
            return (
              <NewsRail
                key={category.id}
                title={category.label}
                articles={getMockNewsByCategory(category.id)}
                provenance="demo"
              />
            );
          }
          return (
            <NewsRail
              key={category.id}
              title={category.label}
              articles={data.articles}
              provenance="production"
              emptyMessage={
                data.available
                  ? `No ${category.label} stories have been ingested yet.`
                  : `${category.label} news is unavailable right now.`
              }
            />
          );
        })}
      </div>
    </div>
  );
}
