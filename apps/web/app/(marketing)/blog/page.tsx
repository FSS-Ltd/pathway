/**
 * Blog index page - "Browse Our Resources".
 * Two-column layout: sidebar (search, filter, categories) + main (featured + grid).
 * ISR with revalidate 60s.
 */

import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { fetchAllBlogPosts } from "../../../lib/blog-client";
import BlogFaq from "./blog-faq";
import BlogIndexClient from "./blog-index-client";
import {
  BLOG_POSTS_PER_PAGE,
  buildBlogIndexMetadata,
  parseBlogPage,
} from "../../../lib/blog-pagination";

type BlogIndexPageProps = {
  searchParams?: { page?: string | string[] };
};

export function generateMetadata({ searchParams }: BlogIndexPageProps) {
  return buildBlogIndexMetadata(parseBlogPage(searchParams?.page) ?? 1);
}

export const revalidate = 60;

export default async function BlogIndexPage({
  searchParams,
}: BlogIndexPageProps) {
  if (searchParams?.page === "1") permanentRedirect("/blog");
  const page = parseBlogPage(searchParams?.page);
  if (page === null) notFound();

  const posts = await fetchAllBlogPosts();
  const totalPages = Math.max(1, Math.ceil(posts.length / BLOG_POSTS_PER_PAGE));
  if (page > totalPages) notFound();

  // All unique tags for categories
  const allTags = Array.from(
    new Set(posts.flatMap((p) => p.tags).filter(Boolean)),
  ).sort();

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <Link
          href="/blog"
          className="text-sm font-medium text-accent-strong transition hover:text-accent-primary"
        >
          Read Our Blog
        </Link>
        <h1 className="mt-2 text-4xl font-bold text-text-primary md:text-5xl">
          Browse Our Resources
        </h1>
        <p className="mt-3 text-lg text-text-muted">
          We provide tips and resources from industry leaders. For real.
        </p>
      </div>

      <BlogIndexClient posts={posts} allTags={allTags} initialPage={page} />

      <BlogFaq />
    </div>
  );
}
