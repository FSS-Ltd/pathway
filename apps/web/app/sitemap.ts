import type { MetadataRoute } from "next";
import { fetchBlogPosts } from "../lib/blog-client";
import { absoluteContentUrl, buildStaticSitemap } from "../lib/seo";

export const revalidate = 60;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [...buildStaticSitemap(), ...(await getBlogPostUrls())];
}

async function getBlogPostUrls(): Promise<MetadataRoute.Sitemap> {
  try {
    const posts: Awaited<ReturnType<typeof fetchBlogPosts>>["posts"] = [];
    let cursor: string | undefined;

    // Pull all published posts page-by-page so sitemap stays complete.
    for (let i = 0; i < 50; i += 1) {
      const page = await fetchBlogPosts(cursor, 100);
      posts.push(...page.posts);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    return posts.map((post) => ({
      url: absoluteContentUrl(`/blog/${encodeURIComponent(post.slug)}`),
      lastModified: new Date(post.publishedAt ?? post.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}
