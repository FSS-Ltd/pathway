/**
 * RSS feed for blog posts.
 * Served at /blog/feed.xml
 */

import { NextResponse } from "next/server";
import { fetchBlogPosts } from "../../../lib/blog-client";
import { SITE_ORIGIN } from "../../../lib/seo";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const { posts } = await fetchBlogPosts(undefined, 50);

  const items = posts
    .map(
      (post: {
        title: string;
        slug: string;
        excerpt: string | null;
        seoDescription: string | null;
        publishedAt: string | null;
      }) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${SITE_ORIGIN}/blog/${escapeXml(encodeURIComponent(post.slug))}</link>
      <guid isPermaLink="true">${SITE_ORIGIN}/blog/${escapeXml(encodeURIComponent(post.slug))}</guid>
      <description>${escapeXml(post.excerpt ?? post.seoDescription ?? "")}</description>
      <pubDate>${post.publishedAt ? new Date(post.publishedAt).toUTCString() : ""}</pubDate>
    </item>`,
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Nexsteps Blog</title>
    <link>${SITE_ORIGIN}/blog</link>
    <description>Insights on safeguarding, attendance, rotas, and school operations.</description>
    <language>en-GB</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="${SITE_ORIGIN}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;

  return new NextResponse(rss, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
