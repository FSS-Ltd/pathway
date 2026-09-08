import { prepareArticleContent } from "../lib/article-content";

describe("article content", () => {
  it("removes a leading body H1 because the article template owns the page title", () => {
    const result = prepareArticleContent(
      "<h1>Repeated title</h1><p>Opening</p><h2>First step</h2>",
    );

    expect(result.html).toBe(
      '<p>Opening</p><h2 id="first-step">First step</h2>',
    );
    expect(result.toc).toEqual([{ id: "first-step", label: "First step" }]);
  });

  it("preserves non-leading H1 content rather than deleting unexpected editorial material", () => {
    const result = prepareArticleContent(
      "<p>Opening</p><h1>Unexpected heading</h1><h2>Next step</h2>",
    );

    expect(result.html).toContain("<h1>Unexpected heading</h1>");
  });
});
