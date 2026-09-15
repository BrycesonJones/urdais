import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above the imports, so the stub is created inside the
// factory and read back afterwards rather than closed over from here.
vi.mock("@/lib/news/read/load", () => ({ loadComputeNews: vi.fn() }));

import { NewsSections } from "@/components/home/news-sections";
import { loadComputeNews } from "@/lib/news/read/load";
import { MOCK_NEWS } from "@/data/mock/news";
import { HOMEPAGE_NEWS_CATEGORIES, NEWS_CATEGORIES, type NewsArticle } from "@/types/news";

const computeNews = vi.mocked(loadComputeNews);

const PRODUCTION: NewsArticle[] = [
  {
    id: "a1",
    category: "compute",
    title: "Capacity comes online in three regions",
    summary: "The publisher's own dek.",
    source: "CoreWeave",
    publishedAt: "2026-09-12T19:24:20.000Z",
    url: "https://www.coreweave.com/blog/capacity",
    imageUrl: null,
  },
  {
    id: "a2",
    category: "compute",
    title: "A story the publisher gave no description",
    summary: null,
    source: "Google Cloud",
    publishedAt: "2026-09-11T10:00:00.000Z",
    url: "https://cloud.google.com/blog/products/compute/none",
    imageUrl: null,
  },
];

async function renderSections() {
  render(await NewsSections());
}

function rail(title: string): HTMLElement {
  return screen.getByRole("region", { name: title });
}

beforeEach(() => {
  computeNews.mockReset();
});

describe("the homepage news rails", () => {
  it("shows exactly the V1 categories, in taxonomy order", async () => {
    computeNews.mockResolvedValue({ articles: PRODUCTION, available: true });
    await renderSections();
    const headings = screen.getAllByRole("heading", { level: 2 }).map((node) => node.textContent);
    expect(headings).toEqual(["Compute", "Energy / Power", "Crypto"]);
    expect(headings).toEqual(HOMEPAGE_NEWS_CATEGORIES.map((category) => category.label));
  });

  it("hides the deferred categories completely, heading and stories alike", async () => {
    computeNews.mockResolvedValue({ articles: PRODUCTION, available: true });
    await renderSections();

    // The hidden set is the complement of the visible one, so this test cannot
    // drift out of step with the config it is checking.
    const hidden = NEWS_CATEGORIES.filter(
      (category) => !HOMEPAGE_NEWS_CATEGORIES.some((visible) => visible.id === category.id),
    );
    expect(hidden.map((category) => category.id)).toEqual(["memory", "photonics", "ai-chips"]);

    for (const category of hidden) {
      expect(screen.queryByRole("region", { name: category.label })).not.toBeInTheDocument();
      expect(screen.queryByRole("heading", { level: 2, name: category.label })).not.toBeInTheDocument();
      // Not merely visually hidden: none of their mock stories is rendered at all.
      for (const mock of MOCK_NEWS[category.id]) {
        expect(screen.queryByText(mock.title)).not.toBeInTheDocument();
      }
    }
  });

  it("leaves the taxonomy alone: hidden is not deleted", async () => {
    // The backend still knows about all six. Ingestion, the schedule and the
    // database category constraint are unchanged by a presentation decision.
    expect(NEWS_CATEGORIES.map((category) => category.id)).toEqual([
      "compute",
      "memory",
      "photonics",
      "energy-power",
      "ai-chips",
      "crypto",
    ]);
  });

  it("renders Compute from production data, attributed and linked to the publisher", async () => {
    computeNews.mockResolvedValue({ articles: PRODUCTION, available: true });
    await renderSections();

    const compute = rail("Compute");
    const link = within(compute).getByRole("link", { name: PRODUCTION[0]!.title });
    expect(link).toHaveAttribute("href", "https://www.coreweave.com/blog/capacity");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(within(compute).getByText(/CoreWeave/)).toBeInTheDocument();
    expect(within(compute).getByText("Live")).toBeInTheDocument();
    expect(within(compute).queryByText("Demo content")).not.toBeInTheDocument();
  });

  it("renders no dek where the publisher supplied none", async () => {
    computeNews.mockResolvedValue({ articles: PRODUCTION, available: true });
    await renderSections();
    const compute = rail("Compute");
    expect(within(compute).getByText("The publisher's own dek.")).toBeInTheDocument();
    expect(within(compute).getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(within(compute).getAllByText(/./).filter((n) => n.textContent === "null")).toEqual([]);
  });

  it("never shows a mock Compute story once the rail is production-backed", async () => {
    computeNews.mockResolvedValue({ articles: PRODUCTION, available: true });
    await renderSections();
    for (const mock of MOCK_NEWS.compute) {
      expect(screen.queryByText(mock.title)).not.toBeInTheDocument();
    }
  });

  it("says so plainly when the production store cannot be read, and invents nothing", async () => {
    computeNews.mockResolvedValue({ articles: [], available: false });
    await renderSections();

    const compute = rail("Compute");
    expect(within(compute).getByText("Compute news is unavailable right now.")).toBeInTheDocument();
    expect(within(compute).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
    for (const mock of MOCK_NEWS.compute) {
      expect(screen.queryByText(mock.title)).not.toBeInTheDocument();
    }
  });

  it("distinguishes a store with nothing in it from a store it could not read", async () => {
    computeNews.mockResolvedValue({ articles: [], available: true });
    await renderSections();
    expect(within(rail("Compute")).getByText("No Compute stories have been ingested yet.")).toBeInTheDocument();
  });

  it("renders a publisher thumbnail when one was approved, and the fallback otherwise", async () => {
    computeNews.mockResolvedValue({
      articles: [
        { ...PRODUCTION[0]!, imageUrl: "https://blog.cloudflare.com/_emdash/api/media/file/a.png" },
        PRODUCTION[1]!,
      ],
      available: true,
    });
    await renderSections();

    const compute = rail("Compute");
    const images = within(compute).getAllByRole("presentation", { hidden: true });
    // One card shows the publisher's own image; the other keeps the Urdais
    // fallback, and neither leaks a broken-image slot.
    const img = compute.querySelector("img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toContain("blog.cloudflare.com");
    expect(compute.querySelectorAll("img")).toHaveLength(1);
    expect(images.length).toBeGreaterThan(0);
  });

  it("references the publisher's image rather than proxying it through Urdais", async () => {
    computeNews.mockResolvedValue({
      articles: [{ ...PRODUCTION[0]!, imageUrl: "https://blog.cloudflare.com/_emdash/api/media/file/a.png" }],
      available: true,
    });
    await renderSections();

    const img = rail("Compute").querySelector("img")!;
    // Not /_next/image?url=…: the reader's browser fetches it from the
    // publisher, and Urdais stores and re-serves nothing.
    expect(img.getAttribute("src")).toBe("https://blog.cloudflare.com/_emdash/api/media/file/a.png");
    expect(img.getAttribute("src")).not.toContain("/_next/image");
  });

  it("leaves the visible categories that are still mocked working and labelled as demo", async () => {
    computeNews.mockResolvedValue({ articles: PRODUCTION, available: true });
    await renderSections();

    for (const category of HOMEPAGE_NEWS_CATEGORIES) {
      if (category.id === "compute") continue;
      const section = rail(category.label);
      expect(within(section).getByText("Demo content")).toBeInTheDocument();
      // And never mistaken for production: a demo rail carries no Live badge.
      expect(within(section).queryByText("Live")).not.toBeInTheDocument();
      const mocks = MOCK_NEWS[category.id];
      expect(within(section).getAllByRole("heading", { level: 3 })).toHaveLength(mocks.length);
      expect(within(section).getByText(mocks[0]!.title)).toBeInTheDocument();
      // Mock stories still link nowhere.
      expect(within(section).queryAllByRole("link")).toHaveLength(0);
    }
  });
});
