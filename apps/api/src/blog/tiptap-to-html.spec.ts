import { safeHref, tiptapJsonToHtml } from "./tiptap-to-html";

const linkDoc = (href: string) => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "click", marks: [{ type: "link", attrs: { href } }] },
      ],
    },
  ],
});

describe("tiptapJsonToHtml link hrefs", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    " \u0001javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
  ])("replaces %j with #", (href) => {
    const html = tiptapJsonToHtml(linkDoc(href), "https://example.com");
    expect(html).toContain('<a href="#">click</a>');
  });

  it.each([
    "https://example.com/a?b=1&c=2",
    "http://example.com",
    "mailto:hi@example.com",
    "tel:+441234567890",
    "/blog/post",
    "#section",
    "relative/path",
  ])("keeps %j", (href) => {
    expect(safeHref(href)).toBe(href);
  });

  it("still escapes attribute-breaking characters in allowed links", () => {
    const html = tiptapJsonToHtml(
      linkDoc('https://example.com/"onmouseover="x'),
      "https://example.com",
    );
    expect(html).toContain("&quot;onmouseover=&quot;");
    expect(html).not.toContain('"onmouseover="');
  });
});
