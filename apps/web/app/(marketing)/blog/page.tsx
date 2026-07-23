/**
 * Blog index page - "Browse Our Resources".
 * Two-column layout: sidebar (search, filter, categories) + main (featured + grid).
 * ISR with revalidate 60s.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { fetchAllBlogPosts } from "../../../lib/blog-client";
import BlogFaq from "./blog-faq";
import BlogIndexClient from "./blog-index-client";

export const metadata: Metadata = {
  title: "Browse Our Resources",
  description:
    "We provide tips and resources from industry leaders. Insights on safeguarding, attendance, rotas, and school operations.",
  openGraph: {
    title: "Browse Our Resources | Nexsteps",
    description:
      "We provide tips and resources from industry leaders. Insights on safeguarding, attendance, rotas, and school operations.",
    url: "https://nexsteps.dev/blog",
    type: "website",
  },
};

export const revalidate = 60;

export default async function BlogIndexPage() {
  const posts = await fetchAllBlogPosts();

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

      <BlogIndexClient posts={posts} allTags={allTags} />

      <BlogFaq />
    </div>
  );
}
