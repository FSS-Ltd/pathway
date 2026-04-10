/**
 * Blog post page - renders published post from DB.
 * Clean layout with generous spacing, featured image, author block, related articles.
 * ISR with revalidate 60s; on-demand revalidation on publish.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import {
  fetchBlogPostBySlug,
  fetchBlogPosts,
  fetchRelatedPosts,
} from "../../../../lib/blog-client";

const baseUrl = "https://nexsteps.dev";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) {
    return { title: "Post Not Found" };
  }

  const title = post.seoTitle ?? post.title;
  const description = post.seoDescription ?? post.excerpt ?? undefined;
  const canonical = `${baseUrl}/blog/${slug}`;
  const ogImage = post.thumbnailImageId ?? post.headerImageId
    ? `${baseUrl}/media/${post.thumbnailImageId ?? post.headerImageId}`
    : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "article",
      publishedTime: post.publishedAt ?? undefined,
      modifiedTime: post.updatedAt,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const { posts } = await fetchBlogPosts(undefined, 100);
    return posts.map((p) => ({ slug: p.slug }));
  } catch {
    return [];
  }
}

type TocItem = {
  id: string;
  label: string;
};

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/&amp;/g, "and")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function buildContentWithToc(contentHtml: string): { html: string; toc: TocItem[] } {
  const toc: TocItem[] = [];
  const slugCounts = new Map<string, number>();

  const html = contentHtml.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/gi, (match, attrs, inner) => {
    const label = inner.replace(/<[^>]+>/g, "").trim();
    if (!label) return match;

    const existingIdMatch = attrs.match(/\sid=(["'])(.*?)\1/i);
    let id = existingIdMatch?.[2];
    if (!id) {
      const base = slugifyHeading(label) || "section";
      const seen = slugCounts.get(base) ?? 0;
      slugCounts.set(base, seen + 1);
      id = seen === 0 ? base : `${base}-${seen + 1}`;
    }

    toc.push({ id, label });

    if (existingIdMatch) return match;
    return `<h2${attrs} id="${id}">${inner}</h2>`;
  });

  return { html, toc };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await fetchBlogPostBySlug(slug);
  if (!post) notFound();

  const [relatedPosts] = await Promise.all([
    fetchRelatedPosts(slug, 4),
  ]);
  const { html: postHtmlWithIds, toc } = buildContentWithToc(post.contentHtml);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "";
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? post.seoDescription ?? undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    author: {
      "@type": "Person",
      name: post.authorName ?? "Nexsteps",
    },
    publisher: {
      "@type": "Organization",
      name: "Nexsteps",
      logo: { "@type": "ImageObject", url: `${baseUrl}/favicon.svg` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${baseUrl}/blog/${slug}` },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <article>
        <section className="bg-shell">
          <div className="mx-auto max-w-7xl px-4 py-8 md:py-16">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm font-medium text-text-muted transition hover:text-text-primary"
            >
              ← Back to Resources
            </Link>

            <div className="mt-6 grid items-center gap-6 md:gap-8 lg:grid-cols-2">
              <div>
                <div className="mb-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-accent-subtle px-3 py-1 text-xs font-medium text-accent-strong"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <h1 className="text-3xl font-bold text-text-primary sm:text-4xl md:text-5xl">
                  {post.title}
                </h1>
                {post.excerpt && (
                  <p className="mt-4 text-base text-text-muted sm:text-lg">{post.excerpt}</p>
                )}
                <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-text-muted">
                  <span>{formatDate(post.publishedAt)}</span>
                  <span>•</span>
                  <span>{post.readTimeMinutes ?? 5}min read</span>
                  <span>•</span>
                  <span>{post.authorName ?? "Nexsteps"}</span>
                </div>
              </div>

              <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted sm:aspect-video">
                {(post.headerImageId ?? post.thumbnailImageId) ? (
                  <Image
                    src={`/media/${post.headerImageId ?? post.thumbnailImageId}`}
                    alt=""
                    fill
                    className="object-cover object-center"
                    priority
                    sizes="(max-width: 1024px) 100vw, 50vw"
                  />
                ) : (
                  <div className="absolute inset-0 bg-muted" />
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white">
          <div className="mx-auto max-w-7xl px-4 py-10 md:py-16">
            <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div
                className="prose prose-base max-w-none prose-headings:text-text-primary prose-h2:scroll-mt-28 prose-h3:scroll-mt-28 prose-p:text-text-primary prose-p:leading-relaxed prose-a:text-accent-strong prose-a:no-underline hover:prose-a:underline prose-blockquote:border-l-accent-secondary prose-blockquote:bg-accent-subtle/30 prose-blockquote:py-2 prose-blockquote:pl-6 prose-img:my-8 prose-img:rounded-xl md:prose-lg"
                dangerouslySetInnerHTML={{ __html: postHtmlWithIds }}
              />

              {toc.length > 0 && (
                <aside className="hidden xl:sticky xl:top-24 xl:block xl:self-start">
                  <div className="rounded-xl border border-border-subtle bg-surface p-6">
                    <h2 className="mb-4 text-xl font-bold text-text-primary">
                      Table of Contents
                    </h2>
                    <ul className="space-y-2">
                      {toc.map((item) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            className="block rounded-md px-2 py-1.5 text-sm text-text-muted transition hover:bg-muted hover:text-text-primary"
                          >
                            {item.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              )}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl px-4 pb-16">
          {/* Related Articles */}
          {relatedPosts.length > 0 && (
            <aside className="mt-8 border-t border-border-subtle pt-12">
              <h2 className="mb-6 text-2xl font-semibold text-text-primary">
                Related Articles
              </h2>
              <ul className="grid gap-6 sm:grid-cols-2">
                {relatedPosts.map((r) => (
                  <li key={r.slug}>
                    <Link
                      href={`/blog/${r.slug}`}
                      className="block rounded-xl border border-border-subtle p-5 transition hover:border-accent-primary/30 hover:shadow-soft"
                    >
                      <h3 className="font-semibold text-text-primary">
                        {r.title}
                      </h3>
                      {r.excerpt && (
                        <p className="mt-2 line-clamp-2 text-sm text-text-muted">
                          {r.excerpt}
                        </p>
                      )}
                      <time className="mt-3 block text-xs text-text-muted">
                        {formatDate(r.publishedAt)}
                      </time>
                    </Link>
                  </li>
                ))}
              </ul>
            </aside>
          )}
        </div>
      </article>
    </>
  );
}
