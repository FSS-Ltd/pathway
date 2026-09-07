import type { Metadata } from "next";
import { metadataForPath, SITE_ORIGIN } from "./seo";

export const BLOG_POSTS_PER_PAGE = 10;

export function parseBlogPage(
  value: string | string[] | undefined,
): number | null {
  if (value === undefined) return 1;
  if (Array.isArray(value) || !/^\d+$/.test(value)) return null;

  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 ? page : null;
}

export function blogPageHref(page: number): string {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new Error("Blog page must be a positive integer");
  }
  return page === 1 ? "/blog" : `/blog?page=${page}`;
}

function absoluteBlogPageUrl(page: number): string {
  return new URL(blogPageHref(page), SITE_ORIGIN).href;
}

export function buildBlogIndexMetadata(page: number): Metadata {
  const base = metadataForPath("/blog");
  const title =
    page === 1
      ? "Guides to Children’s Programme Operations"
      : `Guides to Children’s Programme Operations - Page ${page}`;
  const canonical = absoluteBlogPageUrl(page);

  return {
    ...base,
    title,
    alternates: { canonical },
    openGraph: {
      ...base.openGraph,
      title,
      url: canonical,
    },
    twitter: {
      ...base.twitter,
      title,
    },
  };
}
