/**
 * Blog client for fetching published posts from the API.
 * Used by apps/web for SSR/ISR blog pages.
 *
 * For server-side fetches: prefer API_INTERNAL_URL. When NEXT_PUBLIC_API_URL is
 * HTTPS (e.g. Caddy dev with self-signed cert), we use undici's Agent to accept it.
 */
const API_BASE_URL =
  process.env.API_INTERNAL_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:3003";

/** Fetch options for server-side: in dev with HTTPS API, accept self-signed certs. */
function getFetchOptions(): RequestInit | undefined {
  if (
    typeof window === "undefined" &&
    process.env.NODE_ENV !== "production" &&
    API_BASE_URL.startsWith("https://")
  ) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- undici for dev TLS
    const { Agent } = require("undici");
    return {
      dispatcher: new Agent({ connect: { rejectUnauthorized: false } }),
    } as RequestInit;
  }
  return undefined;
}

export type BlogPostSummary = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  thumbnailImageId: string | null;
  headerImageId: string | null;
  publishedAt: string | null;
  tags: string[];
  authorName: string | null;
  authorAvatarId: string | null;
  readTimeMinutes: number | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BlogPostDetail = BlogPostSummary & {
  contentHtml: string;
};

export type BlogListResponse = {
  posts: BlogPostSummary[];
  nextCursor?: string;
};

export async function fetchBlogPosts(
  cursor?: string,
  limit = 20,
): Promise<BlogListResponse> {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  params.set("limit", String(limit));
  try {
    const res = await fetch(`${API_BASE_URL}/public/blog/posts?${params}`, {
      next: { revalidate: 60 },
      ...getFetchOptions(),
    });
    if (!res.ok) {
      return { posts: [], nextCursor: undefined };
    }
    return res.json();
  } catch {
    return { posts: [], nextCursor: undefined };
  }
}

export async function fetchBlogPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/public/blog/posts/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 },
      ...getFetchOptions(),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      return null;
    }
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchRelatedPosts(
  slug: string,
  limit = 4,
): Promise<Array<{ slug: string; title: string; excerpt: string | null; publishedAt: string }>> {
  const params = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(
    `${API_BASE_URL}/public/blog/posts/${encodeURIComponent(slug)}/related?${params}`,
    { next: { revalidate: 60 }, ...getFetchOptions() },
  );
  if (!res.ok) return [];
  return res.json();
}
