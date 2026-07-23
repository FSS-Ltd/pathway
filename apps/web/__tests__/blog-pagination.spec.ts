import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { BlogPostSummary } from "../lib/blog-client";

function makePost(id: string): BlogPostSummary {
  return {
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    excerpt: null,
    seoTitle: null,
    seoDescription: null,
    thumbnailImageId: null,
    headerImageId: null,
    publishedAt: "2026-07-23T00:00:00.000Z",
    tags: [],
    authorName: null,
    authorAvatarId: null,
    readTimeMinutes: null,
    isFeatured: false,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
  };
}

describe("blog pagination", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetModules();
  });

  it("uses the complete blog feed for the paginated index", () => {
    const pageSource = readFileSync(
      join(process.cwd(), "app/(marketing)/blog/page.tsx"),
      "utf8",
    );

    expect(pageSource).toContain("fetchAllBlogPosts");
  });

  it("follows public blog cursors until every page is loaded", async () => {
    const responses = [
      { posts: [makePost("1")], nextCursor: "cursor-1" },
      { posts: [makePost("2")], nextCursor: "cursor-2" },
      { posts: [makePost("3")] },
    ];
    const fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve(responses.shift()),
        }),
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const blogClient = (await import("../lib/blog-client")) as typeof import("../lib/blog-client") & {
      fetchAllBlogPosts?: () => Promise<BlogPostSummary[]>;
    };

    expect(typeof blogClient.fetchAllBlogPosts).toBe("function");
    const posts = await blogClient.fetchAllBlogPosts();

    expect(posts.map((post) => post.id)).toEqual(["1", "2", "3"]);
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
      "http://localhost:3003/public/blog/posts?limit=50",
      "http://localhost:3003/public/blog/posts?cursor=cursor-1&limit=50",
      "http://localhost:3003/public/blog/posts?cursor=cursor-2&limit=50",
    ]);
  });
});
