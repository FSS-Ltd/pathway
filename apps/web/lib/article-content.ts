export type ArticleTocItem = {
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

export function prepareArticleContent(contentHtml: string): {
  html: string;
  toc: ArticleTocItem[];
} {
  const withoutRepeatedTitle = contentHtml.replace(
    /^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i,
    "",
  );
  const toc: ArticleTocItem[] = [];
  const slugCounts = new Map<string, number>();

  const html = withoutRepeatedTitle.replace(
    /<h2([^>]*)>([\s\S]*?)<\/h2>/gi,
    (match, attrs: string, inner: string) => {
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
      return existingIdMatch ? match : `<h2${attrs} id="${id}">${inner}</h2>`;
    },
  );

  return { html, toc };
}
