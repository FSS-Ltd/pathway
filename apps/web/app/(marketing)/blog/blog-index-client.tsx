"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Search, ExternalLink } from "lucide-react";
import type { BlogPostSummary } from "../../../lib/blog-client";

type Props = {
  posts: BlogPostSummary[];
  allTags: string[];
};

export default function BlogIndexClient({
  posts,
  allTags,
}: Props) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(10);

  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      if (selectedCategory !== "all" && !post.tags.includes(selectedCategory)) {
        return false;
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          post.title.toLowerCase().includes(q) ||
          (post.excerpt?.toLowerCase().includes(q) ?? false) ||
          post.tags.some((t) => t.toLowerCase().includes(q));
        if (!matches) return false;
      }
      return true;
    });
  }, [posts, selectedCategory, searchQuery]);

  const filteredFeatured = filteredPosts[0];
  const filteredGrid = filteredPosts.slice(1);
  const visibleGridPosts = filteredGrid.slice(0, visibleCount);
  const hasMoreVisiblePosts = visibleGridPosts.length < filteredGrid.length;

  useEffect(() => {
    setVisibleCount(10);
  }, [searchQuery, selectedCategory]);

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-12">
      {/* Left Sidebar */}
      <aside className="w-full shrink-0 lg:w-72">
        <div className="space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-text-primary">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
              <input
                type="search"
                placeholder="Search article..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border-subtle bg-surface py-2.5 pl-10 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              Browse By Categories
            </h3>
            <ul className="space-y-1">
              <li>
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    selectedCategory === "all"
                      ? "bg-accent-subtle text-accent-strong"
                      : "text-text-muted hover:bg-muted hover:text-text-primary"
                  }`}
                >
                  All Category
                </button>
              </li>
              {allTags.map((tag) => (
                <li key={tag}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(tag)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      selectedCategory === tag
                        ? "bg-accent-subtle text-accent-strong"
                        : "text-text-muted hover:bg-muted hover:text-text-primary"
                    }`}
                  >
                    {tag}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="min-w-0 flex-1">
        {filteredPosts.length === 0 ? (
          <div className="rounded-xl border border-border-subtle bg-surface p-12 text-center">
            <p className="text-text-muted">No posts found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Featured Post */}
            {filteredFeatured && (
              <Link
                href={`/blog/${filteredFeatured.slug}`}
                className="block overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-soft transition hover:border-accent-primary/30 hover:shadow-card"
              >
                <div className="flex flex-col md:flex-row md:items-stretch">
                  <div className="relative min-h-[200px] w-full shrink-0 overflow-hidden rounded-b-xl md:min-h-0 md:w-1/2 md:rounded-b-none md:rounded-r-xl">
                    {filteredFeatured.thumbnailImageId ||
                    filteredFeatured.headerImageId ? (
                      <Image
                        src={`/media/${filteredFeatured.thumbnailImageId ?? filteredFeatured.headerImageId}`}
                        alt=""
                        fill
                        className="object-cover object-center"
                        sizes="(max-width: 768px) 100vw, 50vw"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-muted" />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col justify-center p-6 md:p-8">
                    {filteredFeatured.isFeatured && (
                      <span className="mb-2 inline-block w-fit rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent-strong">
                        Featured
                      </span>
                    )}
                    <h2 className="text-2xl font-bold text-text-primary md:text-3xl">
                      {filteredFeatured.title}
                    </h2>
                    <p className="mt-2 line-clamp-2 text-text-muted">
                      {filteredFeatured.excerpt ??
                        "We provide tips and resources from industry leaders. For real."}
                    </p>
                    <div className="mt-4 flex flex-col gap-0.5 text-sm text-text-muted">
                      <div className="flex items-center gap-2">
                        {filteredFeatured.authorAvatarId ? (
                          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
                            <Image
                              src={`/media/${filteredFeatured.authorAvatarId}`}
                              alt=""
                              fill
                              className="object-cover"
                              sizes="32px"
                            />
                          </div>
                        ) : (
                          <div className="h-8 w-8 shrink-0 rounded-full bg-muted" />
                        )}
                        <span className="font-medium text-text-primary">
                          {filteredFeatured.authorName ?? "Nexsteps"}
                        </span>
                      </div>
                      <span className="text-xs">
                        {filteredFeatured.readTimeMinutes ?? 5}min read
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Grid of Posts */}
            <div className="grid gap-6 sm:grid-cols-2">
              {visibleGridPosts.map((post) => (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className="group block overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-soft transition hover:border-accent-primary/30 hover:shadow-card"
                >
                  <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                    {post.thumbnailImageId || post.headerImageId ? (
                      <Image
                        src={`/media/${post.thumbnailImageId ?? post.headerImageId}`}
                        alt=""
                        fill
                        className="object-cover object-center transition group-hover:scale-105"
                        sizes="(max-width: 640px) 100vw, 50vw"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-muted" />
                    )}
                  </div>
                  <div className="p-5">
                    {post.tags[0] && (
                      <span className="mb-2 inline-block text-xs font-medium text-accent-strong">
                        {post.tags[0]}
                      </span>
                    )}
                    <h3 className="font-semibold text-text-primary group-hover:text-accent-strong">
                      {post.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm text-text-muted">
                      {post.excerpt ??
                        "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore..."}
                    </p>
                    <div className="mt-4 flex items-center justify-between text-sm text-text-muted">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {post.authorAvatarId ? (
                            <div className="relative h-6 w-6 shrink-0 overflow-hidden rounded-full">
                              <Image
                                src={`/media/${post.authorAvatarId}`}
                                alt=""
                                fill
                                className="object-cover"
                                sizes="24px"
                              />
                            </div>
                          ) : (
                            <div className="h-6 w-6 shrink-0 rounded-full bg-muted" />
                          )}
                          <span className="font-medium text-text-primary">
                            {post.authorName ?? "Nexsteps"}
                          </span>
                        </div>
                        <span className="text-xs">
                          {post.readTimeMinutes ?? 5}min read
                        </span>
                      </div>
                      <ExternalLink className="h-4 w-4 opacity-0 transition group-hover:opacity-100" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {hasMoreVisiblePosts && filteredPosts.length > 0 && (
          <div className="mt-8 text-center">
            <button
              type="button"
              onClick={() => setVisibleCount((count) => count + 10)}
              className="inline-flex items-center gap-2 rounded-lg bg-accent-subtle px-6 py-3 text-sm font-medium text-accent-strong transition hover:bg-accent-primary hover:text-white"
            >
              Show more
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
