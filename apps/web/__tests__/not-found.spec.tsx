import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NotFoundPage, { metadata } from "../app/not-found";

describe("not found page", () => {
  it("keeps unknown pages out of search while offering useful recovery links", () => {
    const html = renderToStaticMarkup(createElement(NotFoundPage));

    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(html).toContain("Page not found");
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/blog"');
    expect(html).toContain('href="/demo"');
  });
});
