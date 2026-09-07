import {
  blogPageHref,
  buildBlogIndexMetadata,
  parseBlogPage,
} from "../lib/blog-pagination";
import { SITE_ORIGIN } from "../lib/seo";

describe("blog page routing", () => {
  it.each([
    [undefined, 1],
    ["2", 2],
    ["17", 17],
    ["0", null],
    ["-1", null],
    ["2.5", null],
    ["words", null],
  ])("parses page value %p as %p", (value, expected) => {
    expect(parseBlogPage(value)).toBe(expected);
  });

  it("uses a clean URL for page one and explicit URLs for later pages", () => {
    expect(blogPageHref(1)).toBe("/blog");
    expect(blogPageHref(2)).toBe("/blog?page=2");
  });

  it("gives later archive pages their own canonical and Open Graph URL", () => {
    const metadata = buildBlogIndexMetadata(2);

    expect(metadata.alternates).toEqual({
      canonical: `${SITE_ORIGIN}/blog?page=2`,
    });
    expect(metadata.openGraph).toMatchObject({
      url: `${SITE_ORIGIN}/blog?page=2`,
    });
  });
});
