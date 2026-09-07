import {
  SITE_ORIGIN,
  absoluteContentUrl,
  articleJsonLd,
  buildArticleMetadata,
  buildStaticSitemap,
  buildPageMetadata,
  publicPages,
  serializeJsonLd,
} from "../lib/seo";

describe("SEO foundations", () => {
  it("builds one clean canonical identity across canonical and Open Graph metadata", () => {
    const metadata = buildPageMetadata({
      path: "/features/attendance",
      title: "Attendance Tracking Software for Clubs and Schools",
      description: "Understand how Nexsteps supports attendance workflows.",
    });

    expect(metadata.alternates).toEqual({
      canonical: `${SITE_ORIGIN}/features/attendance`,
    });
    expect(metadata.openGraph).toMatchObject({
      url: `${SITE_ORIGIN}/features/attendance`,
      title: "Attendance Tracking Software for Clubs and Schools",
      siteName: "Nexsteps",
      type: "website",
    });
    expect(metadata.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Attendance Tracking Software for Clubs and Schools",
    });
  });

  it.each([
    "//example.com/page",
    "/page?utm_source=test",
    "/page#section",
    "relative",
  ])("rejects unsafe canonical path %s", (path) => {
    expect(() => absoluteContentUrl(path)).toThrow();
  });

  it("lists every approved commercial route exactly once", () => {
    const paths = publicPages.map((page) => page.path);

    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/",
        "/schools",
        "/clubs",
        "/churches",
        "/charities",
        "/homeschool",
        "/features/attendance",
        "/features/teams-scheduling",
        "/features/family-communication",
        "/features/safeguarding",
        "/features/reporting",
        "/configure",
        "/security",
        "/blog",
      ]),
    );
  });

  it("builds static sitemap entries without fabricated modification dates", () => {
    const entries = buildStaticSitemap();

    expect(entries).toHaveLength(publicPages.length);
    expect(
      entries.find((entry) => entry.url.endsWith("/configure")),
    ).toMatchObject({
      url: `${SITE_ORIGIN}/configure`,
      changeFrequency: "monthly",
      priority: 0.9,
    });
    expect(entries.every((entry) => entry.lastModified === undefined)).toBe(
      true,
    );
  });

  it("uses the organisation for a branded article byline and a person for a named author", () => {
    const branded = articleJsonLd({
      path: "/blog/example",
      title: "Example",
      description: "Example article",
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      authorName: null,
    });
    const named = articleJsonLd({
      path: "/blog/example",
      title: "Example",
      description: "Example article",
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      authorName: "Alex Morgan",
    });
    const editorialTeam = articleJsonLd({
      path: "/blog/example",
      title: "Example",
      description: "Example article",
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      authorName: "Nexsteps Editorial Team",
    });

    expect(branded.author).toEqual({ "@id": `${SITE_ORIGIN}/#organization` });
    expect(editorialTeam.author).toEqual({
      "@id": `${SITE_ORIGIN}/#organization`,
    });
    expect(named.author).toEqual({ "@type": "Person", name: "Alex Morgan" });
  });

  it("keeps article canonical, Open Graph URL and image on the approved host", () => {
    const metadata = buildArticleMetadata({
      path: "/blog/example",
      title: "Example article",
      description: "Example description",
      publishedAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-02-01T00:00:00.000Z",
      imagePath: "/media/image-id",
    });

    expect(metadata.alternates).toEqual({
      canonical: `${SITE_ORIGIN}/blog/example`,
    });
    expect(metadata.openGraph).toMatchObject({
      type: "article",
      url: `${SITE_ORIGIN}/blog/example`,
      images: [{ url: `${SITE_ORIGIN}/media/image-id` }],
    });
    expect(metadata.twitter).toMatchObject({
      images: [`${SITE_ORIGIN}/media/image-id`],
    });
  });

  it("escapes markup boundaries in JSON-LD without corrupting parsed data", () => {
    const serialized = serializeJsonLd({
      "@context": "https://schema.org",
      name: "Nexsteps </script><script>alert(1)</script>",
    });

    expect(serialized).not.toContain("<");
    expect(JSON.parse(serialized)).toMatchObject({
      name: "Nexsteps </script><script>alert(1)</script>",
    });
  });
});
