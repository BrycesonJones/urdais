import { NewsRail } from "@/components/news/news-rail";
import { getMockNewsByCategory } from "@/data/mock/news";
import { NEWS_CATEGORIES } from "@/types/news";

/**
 * The six Information Age news rails beneath Information Markets. Data is
 * mock only; nothing here fetches news. Swap getMockNewsByCategory for the
 * ingestion-backed accessor when it exists.
 */
export function NewsSections() {
  return (
    <div className="flex-1 bg-[#0a0a0a] px-4 pb-20 text-neutral-50 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-12">
        {NEWS_CATEGORIES.map((category) => (
          <NewsRail
            key={category.id}
            title={category.label}
            articles={getMockNewsByCategory(category.id)}
          />
        ))}
      </div>
    </div>
  );
}
